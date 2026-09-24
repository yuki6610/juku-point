import { adminDb } from '@/lib/firebaseAdmin';

export const studentRef = key => {
  if (!/^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(key || '')) throw new Error('生徒IDが正しくありません。');
  const elementary = key.startsWith('elementary_');
  return adminDb.collection(elementary ? 'adminStudents' : 'users').doc(key.slice(elementary ? 11 : 5));
};

export async function resolveStudentIdentity(uid) {
  const link = await adminDb.collection('studentAuthLinks').doc(uid).get();
  const studentKey = link.exists ? link.data().studentKey : `user_${uid}`;
  const ref = studentRef(studentKey);
  const student = await ref.get();
  if (!student.exists || student.data().active === false || student.data().enrollmentStatus === 'withdrawn') throw Object.assign(new Error('有効な生徒情報が見つかりません。'), { status: 403 });
  if (student.data().authUid && student.data().authUid !== uid) throw Object.assign(new Error('生徒アカウントの紐付けが一致しません。'), { status: 403 });
  return { studentKey, studentId: ref.id, student, ref, source: ref.parent.id, authUid: uid };
}
