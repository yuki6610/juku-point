import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const token = request.headers.get('authorization') || '';
    if (!token.startsWith('Bearer ')) return Response.json({ role: 'anonymous' }, { status: 401 });
    const user = await adminAuth.verifyIdToken(token.slice(7));
    const [admin, teacher, parent] = await Promise.all([adminDb.collection('admins').doc(user.uid).get(), adminDb.collection('teachers').doc(user.uid).get(), adminDb.collection('parentAccounts').doc(user.uid).get()]);
    if (admin.exists) return Response.json({ role: 'admin' });
    if (teacher.exists && teacher.data().active !== false) return Response.json({ role: 'teacher' });
    if (teacher.exists) return Response.json({ role: 'disabled' });
    if (parent.exists && parent.data().active !== false) return Response.json({ role: 'parent' });
    if (parent.exists) return Response.json({ role: 'disabled' });
    return Response.json({ role: 'student' });
  } catch { return Response.json({ role: 'anonymous' }, { status: 401 }); }
}
