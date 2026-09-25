import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireStaff } from '@/lib/staffAccess';
import { SHIFT_PERIODS, validShiftDate } from '@/lib/weeklyShifts';
import { TEACHER_SUBJECTS, emptyTeacherSubjects } from '@/lib/teacherSubjects.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const staff = await requireStaff(request), snap = await adminDb.collection('teacherShiftPreferences').doc(staff.uid).get();
    return Response.json({ preferences: snap.data() || { subjectsByLevel: emptyTeacherSubjects(), subjectsConfigured: false, availability: {} }, periods: SHIFT_PERIODS });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
export async function POST(request) {
  try {
    const staff = await requireStaff(request), body = await request.json();
    if (!['availability', 'subjects'].includes(body.action)) throw new Error('保存対象を確認してください。');
    const ref = adminDb.collection('teacherShiftPreferences').doc(staff.uid);
    if (body.action === 'subjects') {
      const subjectsByLevel = Object.fromEntries(Object.entries(TEACHER_SUBJECTS).map(([level, options]) => {
        const allowed = new Set(options.map(([code]) => code));
        return [level, [...new Set((Array.isArray(body.subjectsByLevel?.[level]) ? body.subjectsByLevel[level] : []).filter(code => allowed.has(code)))]];
      }));
      await ref.set({ subjectsByLevel, subjectsConfigured: true, updatedBy: staff.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return Response.json({ saved: true });
    }
    const availability = {};
    for (const [date, ids] of Object.entries(body.availability || {})) {
      if (!validShiftDate(date) || !Array.isArray(ids)) continue;
      availability[date] = [...new Set(ids.filter(id => SHIFT_PERIODS.some(period => period.id === id)))];
    }
    if (Object.keys(availability).length > 120) throw new Error('希望は120日以内で入力してください。');
    await ref.set({ availability, updatedBy: staff.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ saved: true });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
