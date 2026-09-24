import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    await requireAdmin(request);
    const [teachers, preferences] = await Promise.all([adminDb.collection('teachers').get(), adminDb.collection('teacherShiftPreferences').get()]);
    const map = new Map(preferences.docs.map(doc => [doc.id, doc.data()]));
    return Response.json({ teachers: teachers.docs.filter(doc => doc.data().active !== false).map(doc => ({ uid: doc.id, name: doc.data().displayName || doc.data().email || doc.id, preferences: map.get(doc.id) || { subjects: [], grades: [], availability: {} } })) });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
