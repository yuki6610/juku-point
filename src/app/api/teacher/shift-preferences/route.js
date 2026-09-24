import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireStaff } from '@/lib/staffAccess';
import { SHIFT_PERIODS, validShiftDate } from '@/lib/weeklyShifts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const validSubjects = new Set(['japanese', 'math', 'english', 'science', 'social', 'other']);
export async function GET(request) {
  try {
    const staff = await requireStaff(request), snap = await adminDb.collection('teacherShiftPreferences').doc(staff.uid).get();
    return Response.json({ preferences: snap.data() || { subjects: [], grades: [], availability: {} }, periods: SHIFT_PERIODS });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
export async function POST(request) {
  try {
    const staff = await requireStaff(request), body = await request.json();
    const subjects = [...new Set((Array.isArray(body.subjects) ? body.subjects : []).filter(value => validSubjects.has(value)))];
    const grades = [...new Set((Array.isArray(body.grades) ? body.grades : []).map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= 12))];
    const availability = {};
    for (const [date, ids] of Object.entries(body.availability || {})) {
      if (!validShiftDate(date) || !Array.isArray(ids)) continue;
      availability[date] = [...new Set(ids.filter(id => SHIFT_PERIODS.some(period => period.id === id)))];
    }
    if (Object.keys(availability).length > 120) throw new Error('希望は120日以内で入力してください。');
    await adminDb.collection('teacherShiftPreferences').doc(staff.uid).set({ subjects, grades, availability, updatedBy: staff.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ saved: true });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
