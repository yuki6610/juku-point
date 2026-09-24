import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
import { SHIFT_PERIODS, shiftDateAt, shiftEntry, shiftPeriodForDate, shiftPeriodForSlot, shiftPeriodForTime, shiftWeekStart, validShiftDate } from '@/lib/weeklyShifts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validKey = value => /^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(value || '');
const validUid = value => !value || /^[A-Za-z0-9_-]{6,128}$/.test(value);
const weeks = () => adminDb.collection('weeklyShifts');
const list = async name => (await adminDb.collection(name).get()).docs.map(doc => ({ ...doc.data(), id: doc.id }));
const studentRows = async () => {
  const [users, elementary] = await Promise.all([list('users'), list('adminStudents')]);
  return [...users.map(item => ({ ...item, key: `user_${item.id}` })), ...elementary.map(item => ({ ...item, key: `elementary_${item.id}` }))]
    .filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn')
    .map(item => ({ key: item.key, name: item.realName || item.name || item.displayName || '名前未設定', grade: Number(item.grade) || 0, lessonSchedule: item.lessonSchedule || null, lessonScheduleSlots: item.lessonScheduleSlots || null, weekdays: item.weekdays || [], lessonStartTime: item.lessonStartTime || '' }));
};
const relevantPrograms = (programs, monday) => programs.filter(item => item.startDate <= shiftDateAt(monday, 5) && item.endDate >= monday);
const validateEntry = (row, monday, studentKeys, teacherIds, programs) => {
  const entry = shiftEntry(row);
  if (!validShiftDate(entry.date) || shiftWeekStart(entry.date) !== monday || new Date(`${entry.date}T12:00:00+09:00`).getUTCDay() === 0) throw new Error('シフトの日付を確認してください。');
  if (!shiftPeriodForDate(entry.date, entry.periodId, programs)) throw new Error('この日に使用できない時間帯があります。');
  if (!validKey(entry.studentKey) || !studentKeys.has(entry.studentKey)) throw new Error('生徒を確認してください。');
  if (!validUid(entry.teacherUid) || entry.teacherUid && !teacherIds.has(entry.teacherUid)) throw new Error('担当講師を確認してください。');
  return entry;
};
const initialEntries = (students, monday) => students.flatMap(student => {
  const schedule = student.lessonSchedule || {};
  const weekdays = schedule.weekdays || student.weekdays || [];
  const slots = schedule.slots || student.lessonScheduleSlots || {};
  return weekdays.map(Number).filter(day => day >= 1 && day <= 6).flatMap(day => {
    const date = shiftDateAt(monday, day - 1);
    if (schedule.startDate && date < schedule.startDate) return [];
    const slot = slots[String(day)] || {};
    const period = shiftPeriodForSlot(slot, schedule.startTime || student.lessonStartTime);
    if (!period || period.courseOnly) return [];
    return [shiftEntry({ date, periodId: period.id, studentKey: student.key, subject: slot.subject || '', subjectCode: slot.subjectCode || '', lessonType: 'regular' })];
  });
});

export async function GET(request) {
  try {
    await requireAdmin(request);
    const monday = new URL(request.url).searchParams.get('week');
    if (!validShiftDate(monday) || shiftWeekStart(monday) !== monday) throw new Error('週の開始日を確認してください。');
    const [week, students, teachers, allPrograms, preferences] = await Promise.all([weeks().doc(monday).get(), studentRows(), list('teachers'), list('coursePrograms'), list('teacherShiftPreferences')]);
    const programs = relevantPrograms(allPrograms, monday);
    const preferenceMap = new Map(preferences.map(item => [item.id, item]));
    return Response.json({ week: week.exists ? { id: week.id, ...week.data() } : null, students: students.map(({ lessonSchedule, lessonScheduleSlots, weekdays, lessonStartTime, ...item }) => item), teachers: teachers.filter(item => item.active !== false).map(item => ({ uid: item.id, name: item.displayName || item.email || item.id, subjects: preferenceMap.get(item.id)?.subjects || [], grades: preferenceMap.get(item.id)?.grades || [], availability: preferenceMap.get(item.id)?.availability || {} })), periods: SHIFT_PERIODS, programs: programs.map(item => ({ id: item.id, name: item.name, startDate: item.startDate, endDate: item.endDate })) });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request), body = await request.json(), monday = body.week;
    if (!validShiftDate(monday) || shiftWeekStart(monday) !== monday) throw new Error('週の開始日を確認してください。');
    const [current, students, teacherRows, allPrograms] = await Promise.all([weeks().doc(monday).get(), studentRows(), list('teachers'), list('coursePrograms')]);
    const programs = relevantPrograms(allPrograms, monday), studentKeys = new Set(students.map(item => item.key)), teacherIds = new Set(teacherRows.filter(item => item.active !== false).map(item => item.id));
    const ref = weeks().doc(monday), existing = current.data()?.entries || [];
    if (body.action === 'initialize') {
      if (current.exists) throw new Error('この週は作成済みです。');
      const entries = initialEntries(students, monday);
      const expected = students.reduce((sum, student) => sum + (student.lessonSchedule?.weekdays || student.weekdays || []).map(Number).filter(day => day >= 1 && day <= 6 && (!student.lessonSchedule?.startDate || shiftDateAt(monday, day - 1) >= student.lessonSchedule.startDate)).length, 0);
      await ref.create({ weekStart: monday, status: 'draft', entries, createdBy: admin.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return Response.json({ saved: true, count: entries.length, unmapped: Math.max(0, expected - entries.length) });
    }
    if (body.action === 'copy') {
      if (current.exists) throw new Error('コピー先の週は作成済みです。');
      const sourceMonday = body.sourceWeek;
      if (!validShiftDate(sourceMonday) || shiftWeekStart(sourceMonday) !== sourceMonday) throw new Error('コピー元を確認してください。');
      const source = await weeks().doc(sourceMonday).get();
      if (!source.exists || source.data().status !== 'confirmed') throw new Error('コピー元の確定シフトがありません。');
      const copied = (source.data().entries || []).filter(item => item.lessonType === 'regular').map(item => shiftEntry({ ...item, id: crypto.randomUUID(), date: shiftDateAt(monday, new Date(`${item.date}T12:00:00+09:00`).getUTCDay() - 1), sourceId: '' }));
      await ref.create({ weekStart: monday, status: 'draft', entries: copied, copiedFrom: sourceMonday, createdBy: admin.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return Response.json({ saved: true, count: copied.length });
    }
    if (!current.exists) throw new Error('先にこの週の下書きを作成してください。');
    if (body.action === 'save') {
      const entries = Array.isArray(body.entries) ? body.entries.slice(0, 600).map(row => validateEntry(row, monday, studentKeys, teacherIds, programs)) : [];
      if (existing.some(item => item.lessonType === 'course' && item.sourceId && !entries.some(next => next.sourceId === item.sourceId))) throw new Error('講習日程を取り消す場合は、講習授業管理から日程を削除してください。');
      if (new Set(entries.map(item => item.id)).size !== entries.length) throw new Error('同じシフト行が重複しています。');
      if (new Set(entries.map(item => `${item.date}:${item.studentKey}`)).size !== entries.length) throw new Error('同じ生徒を同日に複数配置できません。');
      const courseRows = entries.filter(item => item.lessonType === 'course');
      if (courseRows.some(item => !item.teacherUid)) throw new Error('講習の担当講師を設定してください。');
      if (new Set(courseRows.map(item => item.sourceId)).size !== courseRows.length) throw new Error('同じ講習日程が重複しています。');
      const courseDocs = await Promise.all(courseRows.map(item => item.sourceId ? adminDb.collection('courseLessonPlans').doc(item.sourceId).get() : Promise.resolve(null)));
      if (courseRows.some((item, index) => { const plan = courseDocs[index]?.data(); return !plan || plan.status !== 'confirmed' || plan.studentKey !== item.studentKey; })) throw new Error('講習行と確定した日程を確認してください。');
      const planChecks = await Promise.all(courseRows.map(async (item, index) => {
        const plan = courseDocs[index].data(), period = SHIFT_PERIODS.find(value => value.id === item.periodId);
        const program = programs.find(value => value.id === plan.programId);
        if (!program || item.date < program.startDate || item.date > program.endDate || !period) throw new Error('講習期間内の時間帯を指定してください。');
        const [availability, sameStudentPlans] = await Promise.all([adminDb.collection('courseAvailability').doc(`${plan.programId}_${item.studentKey}`).get(), adminDb.collection('courseLessonPlans').where('studentKey', '==', item.studentKey).get()]);
        if ((availability.data()?.entries || []).some(value => value.date === item.date && period.startTime < value.endTime && period.endTime > value.startTime)) throw new Error('保護者が来校不可に設定した講習時間です。');
        if (sameStudentPlans.docs.some(doc => doc.id !== item.sourceId && doc.data().date === item.date)) throw new Error('同じ生徒を同日に複数の講習へ配置できません。');
        return { date: item.date, startTime: period.startTime, endTime: period.endTime, subject: item.subject, subjectCode: item.subjectCode, teacherUid: item.teacherUid };
      }));
      const allPlanSnapshots = await Promise.all(programs.map(program => adminDb.collection('courseLessonPlans').where('programId', '==', program.id).get()));
      const moved = new Map(courseRows.map(item => [item.sourceId, item.date]));
      if (allPlanSnapshots.some(snapshot => snapshot.docs.some(doc => { const plan = doc.data(), plannedDate = moved.get(doc.id) || plan.date; return plan.status === 'confirmed' && entries.some(item => item.studentKey === plan.studentKey && item.date === plannedDate && item.sourceId !== doc.id); }))) throw new Error('確定した講習と同じ日に別の授業を配置できません。');
      if (entries.some(item => item.lessonType === 'makeup' && item.sourceId && (!validShiftDate(item.sourceId) || item.sourceId === item.date))) throw new Error('振替元の欠席日を確認してください。');
      const batch = adminDb.batch();
      batch.set(ref, { entries, status: current.data().status, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      courseRows.forEach((item, index) => { const original = courseDocs[index].data(), next = planChecks[index]; if (Object.entries(next).some(([key, value]) => original[key] !== value)) batch.set(courseDocs[index].ref, { ...next, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp(), rescheduledAt: FieldValue.serverTimestamp() }, { merge: true }); });
      await batch.commit();
      return Response.json({ saved: true, count: entries.length });
    }
    if (body.action === 'addStudent') {
      const student = students.find(item => item.key === body.studentKey);
      if (!student) throw new Error('生徒を確認してください。');
      const added = initialEntries([student], monday).filter(item => !existing.some(old => old.date === item.date && old.studentKey === item.studentKey));
      await ref.set({ entries: [...existing, ...added], status: current.data().status, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return Response.json({ saved: true, count: added.length });
    }
    if (body.action === 'importCourse') {
      const snapshots = await Promise.all(programs.map(program => adminDb.collection('courseLessonPlans').where('programId', '==', program.id).get()));
      const plans = snapshots.flatMap(snapshot => snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))).filter(item => item.status === 'confirmed' && item.date >= monday && item.date <= shiftDateAt(monday, 5));
      const added = [], skipped = [];
      for (const plan of plans) {
        if (existing.some(item => item.sourceId === plan.id) || added.some(item => item.sourceId === plan.id)) continue;
        if (existing.some(item => item.date === plan.date && item.studentKey === plan.studentKey) || added.some(item => item.date === plan.date && item.studentKey === plan.studentKey)) { skipped.push(plan.id); continue; }
        const period = shiftPeriodForTime(plan.startTime);
        if (!period || !shiftPeriodForDate(plan.date, period.id, programs)) { skipped.push(plan.id); continue; }
        added.push(shiftEntry({ date: plan.date, periodId: period.id, studentKey: plan.studentKey, subject: plan.subject, subjectCode: plan.subjectCode, teacherUid: plan.teacherUid, lessonType: 'course', sourceId: plan.id }));
      }
      await ref.set({ entries: [...existing, ...added], status: current.data().status, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return Response.json({ saved: true, count: added.length, skipped: skipped.length });
    }
    if (body.action === 'confirm') {
      if (existing.some(item => !item.teacherUid)) throw new Error('担当講師が未設定の行があります。');
      await ref.set({ status: 'confirmed', confirmedBy: admin.uid, confirmedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return Response.json({ saved: true });
    }
    throw new Error('操作が正しくありません。');
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
