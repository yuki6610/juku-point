import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROLES = new Set(['teacher', 'admin']);

export async function POST(request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    if (!authorization.startsWith('Bearer ')) return Response.json({ error: '登録したアカウントでログインしてください。' }, { status: 401 });
    const user = await adminAuth.verifyIdToken(authorization.slice(7), true);
    const body = await request.json();
    const role = String(body.role || '');
    const displayName = String(body.displayName || '').trim();
    const childName = String(body.childName || '').trim();
    if (!ROLES.has(role) || !displayName || displayName.length > 80 || (role === 'parent' && !childName) || childName.length > 80) throw new Error('氏名と申請区分を確認してください。');
    if (!user.email) throw new Error('メールアドレスを確認できません。');
    const refs = ['users', 'admins', 'teachers', 'parentAccounts', 'pendingTeachers'].map(name => adminDb.collection(name).doc(user.uid));
    const snapshots = await Promise.all(refs.map(ref => ref.get()));
    if (snapshots.some(snapshot => snapshot.exists)) throw new Error('このアカウントはすでに別の区分で登録されています。');
    const ref = adminDb.collection('accountRequests').doc(user.uid);
    const existing = await ref.get();
    if (existing.exists && existing.data().status !== 'pending') throw new Error('このアカウントの申請は処理済みです。教室へお問い合わせください。');
    if (existing.exists && existing.data().role !== role) throw new Error('申請区分は変更できません。教室へお問い合わせください。');
    await ref.set({ role, displayName, email: user.email, childName: role === 'parent' ? childName : '', status: 'pending', createdAt: existing.data()?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ requested: true });
  } catch (error) {
    return Response.json({ error: error.message || '登録申請に失敗しました。' }, { status: 400 });
  }
}
