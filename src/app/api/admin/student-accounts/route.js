import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
import { studentRef } from '@/lib/studentIdentity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || '');
const emailValue = value => String(value || '').trim().toLowerCase();

export async function GET(request) {
  try {
    await requireAdmin(request);
    const [users, elementary] = await Promise.all([adminDb.collection('users').get(), adminDb.collection('adminStudents').get()]);
    const rows = [
      ...users.docs.map(doc => ({ key: `user_${doc.id}`, studentId: doc.id, source: 'users', ...doc.data() })),
      ...elementary.docs.map(doc => ({ key: `elementary_${doc.id}`, studentId: doc.id, source: 'adminStudents', ...doc.data() })),
    ].filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn');
    const items = await Promise.all(rows.map(async item => {
      const authUid = item.authUid || (item.source === 'users' ? item.studentId : null);
      let authUser = null;
      if (authUid) { try { authUser = await adminAuth.getUser(authUid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; } }
      return { studentKey: item.key, studentId: item.studentId, source: item.source, name: item.realName || item.name || item.displayName || '名前未設定', grade: Number(item.grade || 0), authUid: authUser?.uid || null, email: authUser?.email || '', linked: Boolean(authUser) };
    }));
    return Response.json({ students: items.sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, 'ja')) });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request), body = await request.json();
    const ref = studentRef(body.studentKey), student = await ref.get();
    if (!student.exists || student.data().active === false || student.data().enrollmentStatus === 'withdrawn') throw new Error('在籍中の生徒を選択してください。');
    const currentUid = student.data().authUid || (ref.parent.id === 'users' ? ref.id : null);
    if (body.action === 'updateEmail') {
      const email = emailValue(body.email);
      if (!currentUid || !validEmail(email) || Number(student.data().grade) < 7 || Number(student.data().grade) > 9) throw new Error('中学生の紐付け済みアカウントと新しいメールアドレスを確認してください。');
      const priorLink = await adminDb.collection('studentAuthLinks').doc(currentUid).get();
      if (priorLink.exists && priorLink.data().studentKey !== body.studentKey) throw new Error('この認証アカウントは別の生徒に紐付いています。');
      const existing = await adminAuth.getUser(currentUid);
      if (existing.email !== email) await adminAuth.updateUser(currentUid, { email, emailVerified: false });
      await ref.set({ studentId: ref.id, authUid: currentUid, email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminDb.collection('studentAuthLinks').doc(currentUid).set({ studentKey: body.studentKey, studentId: ref.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminDb.collection('studentAccountHistory').add({ studentKey: body.studentKey, authUid: currentUid, action: 'updateEmail', beforeEmail: existing.email || '', afterEmail: email, by: admin.uid, at: FieldValue.serverTimestamp() });
      return Response.json({ saved: true, authUid: currentUid });
    }
    if (body.action === 'promote') {
      if (ref.parent.id !== 'adminStudents' || Number(student.data().grade) !== 6) throw new Error('小学6年生を選択してください。');
      await ref.set({ studentId: ref.id, grade: 7, schoolStage: 'middle', promotedAt: FieldValue.serverTimestamp(), promotedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await adminDb.collection('studentAccountHistory').add({ studentKey: body.studentKey, authUid: currentUid, action: 'promote', by: admin.uid, at: FieldValue.serverTimestamp() });
      return Response.json({ saved: true });
    }
    if (body.action === 'createAccount') {
      if (ref.parent.id !== 'adminStudents' || Number(student.data().grade) < 7 || Number(student.data().grade) > 9 || currentUid) throw new Error('進級済み・未連携の生徒を選択してください。');
      const email = emailValue(body.email);
      if (!validEmail(email)) throw new Error('本人のメールアドレスを入力してください。');
      const created = await adminAuth.createUser({ email, emailVerified: false, password: randomBytes(32).toString('base64url'), displayName: student.data().name || student.data().realName || '' });
      try {
        await adminDb.runTransaction(async tx => {
          const latest = await tx.get(ref), linkRef = adminDb.collection('studentAuthLinks').doc(created.uid), link = await tx.get(linkRef);
          if (!latest.exists || latest.data().authUid || link.exists) throw new Error('既にアカウントが紐付いています。');
          tx.set(ref, { studentId: ref.id, authUid: created.uid, email, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          tx.create(linkRef, { studentKey: body.studentKey, studentId: ref.id, createdAt: FieldValue.serverTimestamp(), createdBy: admin.uid });
          tx.create(adminDb.collection('studentAccountHistory').doc(), { studentKey: body.studentKey, authUid: created.uid, action: 'createAccount', afterEmail: email, by: admin.uid, at: FieldValue.serverTimestamp() });
        });
      } catch (error) { await adminAuth.deleteUser(created.uid); throw error; }
      return Response.json({ saved: true, authUid: created.uid, needsPasswordLink: true });
    }
    throw new Error('操作が正しくありません。');
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
