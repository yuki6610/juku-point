import { adminDb } from '@/lib/firebaseAdmin';
import { requireStaff } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { resolveAcademicTerm } from '@/lib/academicCalendar.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const staff = await requireStaff(request);
    const date = new URL(request.url).searchParams.get('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('日付が正しくありません。');
    const [users, elementary, daily] = await Promise.all([adminDb.collection('users').get(), adminDb.collection('adminStudents').get(),adminDb.collection('dailyLessonInputs').doc(date).collection('students').get()]);
    const inputStatus = Object.fromEntries(daily.docs.map(doc => [doc.id,{ updatedAt:doc.data().updatedAt?.toDate?.().toISOString() || null,updatedBy:doc.data().updatedBy || null }]));
    const weekday = new Date(`${date}T12:00:00+09:00`).getDay();
    const students = [...users.docs.map(doc => ({ key: `user_${doc.id}`, id: doc.id, source: 'user', ...doc.data() })), ...elementary.docs.map(doc => ({ key: `elementary_${doc.id}`, id: doc.id, source: 'elementary', ...doc.data() }))]
      .filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn')
      .map(data => { const weekdays = data.lessonSchedule?.weekdays || data.weekdays || []; return { key: data.key, id: data.id, source: data.source, name: data.realName || data.name || data.displayName || '名前未設定', grade: Number(data.grade), weekdays, scheduled: weekdays.map(Number).includes(weekday), wordTestQuestionCount: Number(data.wordTestQuestionCount || (Number(data.grade) === 7 ? 20 : Number(data.grade) === 8 ? 30 : Number(data.grade) === 9 ? 50 : 20)) }; })
      .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, 'ja'));
    const settings = await readAcademicSettings();
    const term = resolveAcademicTerm(settings, date);
    const requested = new URL(request.url).searchParams.get('student');
    let existingRecord = null;
    if (requested) {
      const selected = students.find(item => item.key === requested);
      if (!selected) throw new Error('対象生徒を確認できません。');
      const common = await adminDb.collection('adminLessonAttendance').doc(requested).collection('records').doc(date).get();
      if (selected.grade >= 7 && selected.grade <= 9 && selected.source === 'user') {
        const middle = await adminDb.collection('users').doc(selected.id).collection('lessonTerms').doc(term.id).collection('records').doc(date).get();
        existingRecord = middle.exists ? middle.data() : common.data()?.learningRecord || common.data() || null;
      } else existingRecord = common.data()?.learningRecord ? { ...common.data(),...common.data().learningRecord } : common.data() || null;
    }
    return Response.json({ role: staff.role, displayName: staff.profile?.displayName || '管理者', date, weekday, term, students, inputStatus, existingRecord });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
