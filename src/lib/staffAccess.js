import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export class StaffAccessError extends Error {
  constructor(message, status = 403) { super(message); this.status = status; }
}

export async function requireStaff(request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new StaffAccessError('ログイン情報がありません。', 401);
  const decoded = await adminAuth.verifyIdToken(authorization.slice(7), true);
  const [admin, teacher] = await Promise.all([
    adminDb.collection('admins').doc(decoded.uid).get(),
    adminDb.collection('teachers').doc(decoded.uid).get(),
  ]);
  if (admin.exists) return { uid: decoded.uid, role: 'admin' };
  if (!teacher.exists || teacher.data().active === false) throw new StaffAccessError('講師権限がありません。', 403);
  return { uid: decoded.uid, role: 'teacher', profile: teacher.data() };
}

export async function requireAdmin(request) {
  const staff = await requireStaff(request);
  if (staff.role !== 'admin') throw new StaffAccessError('管理者権限がありません。', 403);
  return staff;
}

export function normalizeStudentKey(value) {
  if (!/^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(value || '')) throw new StaffAccessError('生徒情報が正しくありません。', 400);
  return value;
}

export function assertAssigned(staff, studentKey, date) {
  normalizeStudentKey(studentKey);
  if (staff.role !== 'admin' && !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new StaffAccessError('授業日が正しくありません。', 400);
}
