import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export class ParentAccessError extends Error {
  constructor(message, status = 403) { super(message); this.status = status; }
}

export async function requireParent(request) {
  const token = request.headers.get('authorization') || '';
  if (!token.startsWith('Bearer ')) throw new ParentAccessError('ログインしてください。', 401);
  const decoded = await adminAuth.verifyIdToken(token.slice(7), true);
  const [account, admin] = await Promise.all([adminDb.collection('parentAccounts').doc(decoded.uid).get(), adminDb.collection('admins').doc(decoded.uid).get()]);
  if (admin.exists) return { uid: decoded.uid, role: 'admin', profile: { displayName: '管理者プレビュー' } };
  if (!account.exists || account.data().active === false) throw new ParentAccessError('保護者アカウントを確認できません。', 403);
  return { uid: decoded.uid, role: 'parent', profile: account.data() };
}

export async function linkedChildren(parentUid, adminPreview = false) {
  if (adminPreview) {
    const [users, elementary] = await Promise.all([adminDb.collection('users').get(), adminDb.collection('adminStudents').get()]);
    return [...users.docs.map(doc=>({key:`user_${doc.id}`,...doc.data()})),...elementary.docs.map(doc=>({key:`elementary_${doc.id}`,...doc.data()}))]
      .filter(item=>item.active!==false&&item.enrollmentStatus!=='withdrawn'&&Number(item.grade)<=9).map(item=>item.key);
  }
  const snapshot = await adminDb.collection('parentLinks').doc(parentUid).collection('children').get();
  return snapshot.docs.filter(doc => doc.data().active !== false).map(doc => doc.id);
}
