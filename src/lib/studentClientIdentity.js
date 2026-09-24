import { auth } from '@/firebaseConfig';

export async function studentIdentityForCurrentUser() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('ログインしてください。');
  const response = await fetch('/api/auth/role', { headers: { Authorization: `Bearer ${token}` } });
  const value = await response.json();
  if (!response.ok || !['student', 'admin'].includes(value.role)) throw new Error('生徒アカウントを確認できません。');
  // 管理者は従来どおり、自分の users/{uid} を生徒画面の確認用に使う。
  const studentKey = value.role === 'admin' ? `user_${auth.currentUser.uid}` : value.studentKey;
  const elementary = studentKey.startsWith('elementary_');
  return { studentKey, collectionName: elementary ? 'adminStudents' : 'users', studentId: studentKey.slice(elementary ? 11 : 5) };
}
