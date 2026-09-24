import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validUid = value => /^[A-Za-z0-9_-]{6,128}$/.test(value || '');
const digest = value => createHash('sha256').update(value).digest('hex');
const collections = { student: 'users', parent: 'parentAccounts', teacher: 'teachers' };
const nameOf = (data, fallback) => data.realName || data.displayName || data.name || fallback;

export async function GET(request) {
  try {
    await requireAdmin(request);
    const [students, promoted, parents, teachers, recent, subjects] = await Promise.all([
      adminDb.collection('users').get(), adminDb.collection('adminStudents').get(), adminDb.collection('parentAccounts').get(),
      adminDb.collection('teachers').get(), adminDb.collection('accountRecoveryRequests').orderBy('createdAt', 'desc').limit(50).get(), adminDb.collection('accountRecoverySubjects').get(),
    ]);
    const accounts = [
      ...students.docs.map(doc => ({ uid: doc.id, role: 'student', name: nameOf(doc.data(), doc.id), email: doc.data().email || '' })),
      ...promoted.docs.filter(doc => doc.data().authUid).map(doc => ({ uid: doc.data().authUid, role: 'student', name: nameOf(doc.data(), doc.id), email: doc.data().email || '' })),
      ...parents.docs.map(doc => ({ uid: doc.id, role: 'parent', name: nameOf(doc.data(), doc.id), email: doc.data().email || '' })),
      ...teachers.docs.map(doc => ({ uid: doc.id, role: 'teacher', name: nameOf(doc.data(), doc.id), email: doc.data().email || '' })),
    ];
    const versions = new Map(subjects.docs.map(doc => [doc.id, doc.data().version]));
    return Response.json({ accounts, history: recent.docs.map(doc => { const value = doc.data(); return { id: doc.id, uid: value.uid, role: value.role, name: value.name, createdBy: value.createdBy, createdAt: value.createdAt?.toDate?.().toISOString() || null, expiresAt: value.expiresAt?.toDate?.().toISOString() || null, usedAt: value.usedAt?.toDate?.().toISOString() || null, status: value.status === 'issued' && versions.get(value.uid) !== value.version ? 'superseded' : value.status }; }) });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request), body = await request.json();
    if (!collections[body.role] || !validUid(body.uid)) throw new Error('復旧対象を選択してください。');
    const studentLink = body.role === 'student' ? await adminDb.collection('studentAuthLinks').doc(body.uid).get() : null;
    const profileRef = studentLink?.exists && studentLink.data().studentKey?.startsWith('elementary_') ? adminDb.collection('adminStudents').doc(studentLink.data().studentId) : adminDb.collection(collections[body.role]).doc(body.uid);
    const profile = await profileRef.get();
    if (!profile.exists || profile.data().active === false) throw new Error('有効なアカウントが見つかりません。');
    const authUser = await adminAuth.getUser(body.uid);
    if (authUser.disabled) throw new Error('停止中のアカウントは復旧できません。');
    const secret = randomBytes(32).toString('base64url'), requestId = randomBytes(16).toString('hex');
    const subjectRef = adminDb.collection('accountRecoverySubjects').doc(body.uid);
    const recoveryRef = adminDb.collection('accountRecoveryRequests').doc(requestId);
    const expiresAt = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
    await adminDb.runTransaction(async tx => {
      const current = await tx.get(subjectRef), version = Number(current.data()?.version || 0) + 1;
      tx.set(subjectRef, { uid: body.uid, version, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.create(recoveryRef, { uid: body.uid, role: body.role, name: nameOf(profile.data(), authUser.displayName || body.uid), secretHash: digest(secret), version, status: 'issued', createdBy: admin.uid, createdAt: FieldValue.serverTimestamp(), expiresAt, usedAt: null });
    });
    const origin = new URL(request.url).origin;
    return Response.json({ issued: true, url: `${origin}/recover/${requestId}?token=${encodeURIComponent(secret)}`, expiresAt: expiresAt.toDate().toISOString() });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
