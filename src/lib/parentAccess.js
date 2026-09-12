import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export class ParentAccessError extends Error {
  constructor(message, status = 403) { super(message); this.status = status; }
}

export async function requireParent(request) {
  const token = request.headers.get('authorization') || '';
  if (!token.startsWith('Bearer ')) throw new ParentAccessError('ログインしてください。', 401);
  const decoded = await adminAuth.verifyIdToken(token.slice(7), true);
  const account = await adminDb.collection('parentAccounts').doc(decoded.uid).get();
  if (!account.exists || account.data().active === false) throw new ParentAccessError('保護者アカウントを確認できません。', 403);
  return { uid: decoded.uid, profile: account.data() };
}

export async function linkedChildren(parentUid) {
  const snapshot = await adminDb.collection('parentLinks').doc(parentUid).collection('children').get();
  return snapshot.docs.filter(doc => doc.data().active !== false).map(doc => doc.id);
}
