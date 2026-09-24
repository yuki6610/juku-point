import { auth } from '@/firebaseConfig';

export async function studentIdentityForCurrentUser() {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('ログインしてください。');
  const response = await fetch('/api/auth/role', { headers: { Authorization: `Bearer ${token}` } });
  const value = await response.json();
  if (!response.ok || value.role !== 'student') throw new Error('生徒アカウントを確認できません。');
  const studentKey = value.studentKey;
  const elementary = studentKey.startsWith('elementary_');
  return { studentKey, collectionName: elementary ? 'adminStudents' : 'users', studentId: studentKey.slice(elementary ? 11 : 5) };
}
