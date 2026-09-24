import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const token = request.headers.get('authorization') || '';
    if (!token.startsWith('Bearer ')) return Response.json({ role: 'anonymous' }, { status: 401 });
    const user = await adminAuth.verifyIdToken(token.slice(7), true);
    const [admin, teacher, parent, pendingTeacher, accountRequest] = await Promise.all([adminDb.collection('admins').doc(user.uid).get(), adminDb.collection('teachers').doc(user.uid).get(), adminDb.collection('parentAccounts').doc(user.uid).get(), adminDb.collection('pendingTeachers').doc(user.uid).get(), adminDb.collection('accountRequests').doc(user.uid).get()]);
    if (admin.exists) return Response.json({ role: 'admin' });
    if (teacher.exists && teacher.data().active !== false) return Response.json({ role: 'teacher' });
    if (teacher.exists) return Response.json({ role: 'disabled' });
    if (parent.exists && parent.data().active !== false) return Response.json({ role: 'parent' });
    if (parent.exists) return Response.json({ role: 'disabled' });
    if (pendingTeacher.exists && pendingTeacher.data().status === 'pending') return Response.json({ role: 'pendingTeacher' });
    if (accountRequest.exists) return Response.json({ role: accountRequest.data().status === 'pending' ? `pending${accountRequest.data().role[0].toUpperCase()}${accountRequest.data().role.slice(1)}` : 'requestRejected' });
    const link = await adminDb.collection('studentAuthLinks').doc(user.uid).get();
    return Response.json({ role: 'student', studentKey: link.data()?.studentKey || `user_${user.uid}` });
  } catch { return Response.json({ role: 'anonymous' }, { status: 401 }); }
}
