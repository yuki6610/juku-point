import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, normalizeStudentKey } from '@/lib/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validUid = value => /^[A-Za-z0-9_-]{6,128}$/.test(value || '');

export async function GET(request) {
  try {
    await requireAdmin(request);
    const [requests, users, elementary] = await Promise.all([
      adminDb.collection('accountRequests').where('status', '==', 'pending').get(),
      adminDb.collection('users').get(),
      adminDb.collection('adminStudents').get(),
    ]);
    const students = [...users.docs.map(doc => ({ key: `user_${doc.id}`, ...doc.data() })), ...elementary.docs.map(doc => ({ key: `elementary_${doc.id}`, ...doc.data() }))]
      .filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn' && Number(item.grade) >= 1 && Number(item.grade) <= 9)
      .map(item => ({ key: item.key, name: item.realName || item.name || item.displayName || '名前未設定', grade: Number(item.grade) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return Response.json({ requests: requests.docs.map(doc => ({ uid: doc.id, ...doc.data(), createdAt: doc.data().createdAt?.toDate?.().toISOString() || null })).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))), students });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 400 });
  }
}

export async function PATCH(request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    if (!validUid(body.uid) || !['approve', 'reject'].includes(body.action)) throw new Error('申請内容を確認してください。');
    const ref = adminDb.collection('accountRequests').doc(body.uid);
    await adminDb.runTransaction(async tx => {
      const requestDoc = await tx.get(ref);
      const item = requestDoc.data();
      if (!item || item.status !== 'pending' || !['teacher', 'parent', 'admin'].includes(item.role)) throw new Error('承認待ちの申請が見つかりません。');
      const childKeys = item.role === 'parent' && body.action === 'approve' && Array.isArray(body.childKeys) ? [...new Set(body.childKeys.map(normalizeStudentKey))] : [];
      if (item.role === 'parent' && body.action === 'approve' && !childKeys.length) throw new Error('保護者に紐付ける生徒を選択してください。');
      const roleCollection = { teacher: 'teachers', parent: 'parentAccounts', admin: 'admins' }[item.role];
      const roleRef = adminDb.collection(roleCollection).doc(body.uid);
      const existingRoles = await Promise.all(['users', 'admins', 'teachers', 'parentAccounts', 'pendingTeachers'].map(collection => tx.get(adminDb.collection(collection).doc(body.uid))));
      if (existingRoles.some(snapshot => snapshot.exists)) throw new Error('このアカウントはすでに登録されています。');
      const children = await Promise.all(childKeys.map(async key => {
        const elementary = key.startsWith('elementary_');
        const student = await tx.get(adminDb.collection(elementary ? 'adminStudents' : 'users').doc(key.slice(elementary ? 11 : 5)));
        if (!student.exists || student.data().active === false || student.data().enrollmentStatus === 'withdrawn' || Number(student.data().grade) < 1 || Number(student.data().grade) > 9) throw new Error('紐付ける生徒を確認してください。');
        return key;
      }));
      const now = FieldValue.serverTimestamp();
      if (body.action === 'approve') {
        tx.set(roleRef, { email: item.email, displayName: item.displayName, active: true, createdByRequest: body.uid, approvedBy: admin.uid, createdAt: now, updatedAt: now });
        for (const key of children) tx.set(adminDb.collection('parentLinks').doc(body.uid).collection('children').doc(key), { active: true, studentKey: key, approvedBy: admin.uid, createdAt: now, updatedAt: now });
      }
      tx.update(ref, { status: body.action === 'approve' ? 'approved' : 'rejected', reviewedBy: admin.uid, reviewedAt: now, updatedAt: now });
    });
    return Response.json({ saved: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 400 });
  }
}
