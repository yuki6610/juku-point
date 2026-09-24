import { adminDb } from '@/lib/firebaseAdmin';
import { requireStaff } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import { readAbsenceCandidates } from '@/lib/absenceCandidates';
import { FieldValue } from 'firebase-admin/firestore';
import { matchingSubmissionEntries, normalizeSchool, projectSubmissionStatus } from '@/lib/scoreSubmissionPlan.mjs';
import { SHIFT_PERIODS, shiftWeekStart } from '@/lib/weeklyShifts';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const staff = await requireStaff(request);
    const date = new URL(request.url).searchParams.get('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('日付が正しくありません。');
    const [users, elementary, daily,drafts,profiles,shift,coursePrograms] = await Promise.all([adminDb.collection('users').get(), adminDb.collection('adminStudents').get(),adminDb.collection('dailyLessonInputs').doc(date).collection('students').get(),adminDb.collection('lessonDrafts').doc(date).collection('students').get(),adminDb.collection('studentProfiles').get(),adminDb.collection('weeklyShifts').doc(shiftWeekStart(date)).get(),adminDb.collection('coursePrograms').get()]);
    const inputStatus = Object.fromEntries(daily.docs.map(doc => [doc.id,{ updatedAt:doc.data().updatedAt?.toDate?.().toISOString() || null,updatedBy:doc.data().updatedBy || null,missingFields:Array.isArray(doc.data().missingFields)?doc.data().missingFields:[] }]));
    const draftStatus=Object.fromEntries(drafts.docs.map(doc=>[doc.id,{updatedAt:doc.data().updatedAt?.toDate?.().toISOString()||null,updatedBy:doc.data().updatedBy||null,missingFields:doc.data().missingFields||[]}]))
    const weekday = new Date(`${date}T12:00:00+09:00`).getDay();
    const confirmedShift = shift.exists && shift.data().status === 'confirmed';
    const dateEntries = confirmedShift ? (shift.data().entries || []).filter(item => item.date === date) : [];
    const visibleEntries = staff.role === 'admin' ? dateEntries : dateEntries.filter(item => item.teacherUid === staff.uid);
    const entryByStudent = new Map(visibleEntries.map(item => [item.studentKey, item]));
    const students = [...users.docs.map(doc => ({ key: `user_${doc.id}`, id: doc.id, source: 'user', ...doc.data() })), ...elementary.docs.map(doc => ({ key: `elementary_${doc.id}`, id: doc.id, source: 'elementary', ...doc.data() }))]
      .filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn')
      .map(data => { const weekdays = data.lessonSchedule?.weekdays || data.weekdays || [],slots=data.lessonSchedule?.slots||data.lessonScheduleSlots||{},slot=slots[String(weekday)]||{},entry=entryByStudent.get(data.key),period=entry&&SHIFT_PERIODS.find(item=>item.id===entry.periodId); return { key: data.key, id: data.id, source: data.source, name: data.realName || data.name || data.displayName || '名前未設定', grade: Number(data.grade), tags:Array.isArray(data.tags)?data.tags:[], weekdays, scheduled: confirmedShift ? Boolean(entry) : weekdays.map(Number).includes(weekday), lessonStartTime:period?.startTime||slot.startTime||data.lessonSchedule?.startTime||data.lessonStartTime||'',lessonPeriodId:entry?.periodId||slot.periodId||data.lessonSchedule?.periodId||'',lessonSubject:entry?.subject||slot.subject||'',lessonType:entry?.lessonType||null,lessonSourceId:entry?.sourceId||'',lessonSlots:slots, wordTestQuestionCount: Number(data.wordTestQuestionCount || (Number(data.grade) === 7 ? 20 : Number(data.grade) === 8 ? 30 : Number(data.grade) === 9 ? 50 : 20)), wordTestCurrentRange: data.wordTestCurrentRange || null }; })
      .sort((a, b) => Number(b.scheduled)-Number(a.scheduled)||(a.lessonStartTime||'99:99').localeCompare(b.lessonStartTime||'99:99')||a.grade-b.grade||a.name.localeCompare(b.name,'ja'));
    const settings = await readAcademicSettings();
    const term = resolveAcademicTerm(settings, date);
    const requested = new URL(request.url).searchParams.get('student');
    let existingRecord = null;
    if (requested) {
      const selected = students.find(item => item.key === requested);
      if (!selected) throw new Error('対象生徒を確認できません。');
      const common = await adminDb.collection('adminLessonAttendance').doc(requested).collection('records').doc(date).get();
      if (selected.grade >= 7 && selected.grade <= 9) {
        const middle = await adminDb.collection(selected.source === 'elementary' ? 'adminStudents' : 'users').doc(selected.id).collection('lessonTerms').doc(term.id).collection('records').doc(date).get();
        existingRecord = middle.exists ? middle.data() : common.data()?.learningRecord || common.data() || null;
      } else existingRecord = common.data()?.learningRecord ? { ...common.data(),...common.data().learningRecord } : common.data() || null;
    }
    const profileMap=new Map(profiles.docs.map(doc=>[doc.id,doc.data()]));
    const selectedProfile = requested ? profileMap.get(requested) : null;
    const selectedStudent=requested?students.find(item=>item.key===requested):null;
    const absenceCandidates=selectedStudent?await readAbsenceCandidates({studentKey:requested,student:selectedStudent,year:term.year}):[];
    const statusTargets=students.filter(item=>item.grade>=7&&item.grade<=9&&(item.scheduled||item.key===requested));
    const calendar=statusTargets.length?await adminDb.collection('scoreSubmissionCalendars').doc(String(term.year)).collection('entries').get():{docs:[]};
    const calendarEntries=calendar.docs.map(doc=>({id:doc.id,...doc.data()}));
    const schoolNames=[...new Set(calendarEntries.map(item=>String(item.schoolName||'')).filter(Boolean))];
    const statusPairs=await Promise.all(statusTargets.map(async item=>{const [scores,saved]=await Promise.all([adminDb.collection(item.source==='elementary'?'adminStudents':'users').doc(item.id).collection('scores').where('year','==',String(term.year)).where('term','==',`${term.term}学期`).get(),adminDb.collection('scoreSubmissionTerms').doc(term.id).collection('students').doc(item.source==='elementary'?item.key:item.id).get()]);const legacySchool=String(profileMap.get(item.key)?.schoolName||''),tagSchool=item.tags.find(tag=>schoolNames.some(name=>normalizeSchool(name)===normalizeSchool(tag))),schoolName=tagSchool||legacySchool;const entries=matchingSubmissionEntries(calendarEntries,{grade:item.grade,schoolName},term.id);return[item.key,projectSubmissionStatus(entries,saved.data()||{},date,scores.docs.map(doc=>doc.data()))] }));
    const submissionByStudent=Object.fromEntries(statusPairs);
    const publicGuidance=(value,submissionStatus)=>value||submissionStatus ? { policy: String(value?.memo || '').slice(0,2000), materials: String(value?.materials || '').slice(0,1000), courseMaterials: String(value?.courseMaterials || '').slice(0,1000), teacherMemo:String(value?.teacherMemo||'').slice(0,2000), sharedInfo:String(value?.sharedInfo||'').slice(0,3000), submissionStatus:submissionStatus||null } : null;
    let nextLessonNote=null,academicRecords=null;
    if(selectedStudent){
      const handoffRef=adminDb.collection('lessonHandoffs').doc(requested);
      await adminDb.runTransaction(async transaction=>{const handoff=await transaction.get(handoffRef);if(handoff.exists&&selectedStudent.scheduled&&selectedStudent.lessonType!=='course'&&String(handoff.data().sourceDate||'')<date){nextLessonNote={text:String(handoff.data().text||'').slice(0,1000),items:Array.isArray(handoff.data().items)?handoff.data().items.slice(0,20):[],sourceDate:handoff.data().sourceDate||null};transaction.delete(handoffRef)}});
      if(selectedStudent.grade>=7){
        const studentRef=adminDb.collection(selectedStudent.source==='elementary'?'adminStudents':'users').doc(selectedStudent.id);
        const [scores,mocks,schools]=await Promise.all([studentRef.collection('scores').orderBy('createdAt','desc').limit(50).get(),studentRef.collection('mockScores').orderBy('examDate','desc').limit(20).get(),adminDb.collection('schools').get()]);
        const scoreItems=scores.docs.map(doc=>({id:doc.id,...doc.data(),createdAt:undefined,updatedAt:undefined,submittedByUid:undefined})),currentScores=scoreItems.filter(item=>String(item.year)===String(term.year)&&item.term===`${term.term}学期`),exam=currentScores.find(item=>item.type==='exam'),internal=currentScores.find(item=>item.type==='internal'),total=Number(exam?.examConverted||0)+Number(internal?.internalTotal||0);
        const judgments=exam&&internal?schools.docs.map(doc=>{const school=doc.data(),difference=total-Number(school.minScore||0);return{id:doc.id,name:school.name||'高校名未設定',difference,label:difference>=20?'安全圏':difference>=0?'合格圏':difference>=-20?'努力圏':'要努力'}}).sort((a,b)=>b.difference-a.difference):[];
        academicRecords={scores:scoreItems,mockScores:mocks.docs.map(doc=>({id:doc.id,...doc.data(),updatedAt:undefined,updatedBy:undefined})),judgments};
      }
    }
    const guidance = publicGuidance(selectedProfile,submissionByStudent[requested]);
    const guidanceByStudent=Object.fromEntries(students.map(item=>[item.key,publicGuidance(profileMap.get(item.key),submissionByStudent[item.key])]).filter(([,value])=>value));
    const existingDraft=requested&&drafts.docs.find(item=>item.id===requested)?.data()?.payload||null;
    return Response.json({ role: staff.role, displayName: staff.profile?.displayName || '管理者', date, weekday, term, students, shiftConfirmed:confirmedShift, coursePeriod:coursePrograms.docs.some(doc=>doc.data().startDate<=date&&date<=doc.data().endDate), suggestedKeys:visibleEntries.map(item=>item.studentKey), inputStatus, draftStatus, existingRecord, existingDraft, guidance, guidanceByStudent, absenceCandidates,nextLessonNote,academicRecords });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');
const validKey=value=>/^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(value||'');
const clean=value=>String(value||'').slice(0,5000);
export async function POST(request) {
  try {
    const staff = await requireStaff(request), body = await request.json(), date = body.date, studentKey = body.studentKey;
    if (!validDate(date) || !validKey(studentKey)) throw new Error('授業日または生徒を確認してください。');
    const studentId = studentKey.replace(/^(user|elementary)_/, ''), elementary = studentKey.startsWith('elementary_');
    const student = await adminDb.collection(elementary ? 'adminStudents' : 'users').doc(studentId).get();
    if (!student.exists) throw new Error('生徒が見つかりません。');
    const grade = Number(student.data().grade), input = body.payload || {};
    const payload = {
      attendance: ['present', 'absent', 'makeup'].includes(input.attendance) ? input.attendance : 'present',
      lessonType: ['regular', 'course', 'makeup'].includes(input.lessonType) ? input.lessonType : 'regular',
      originalDate: String(input.originalDate || '').slice(0, 10),
      reviewId: clean(input.reviewId).slice(0, 128),
      itemResults: input.itemResults && typeof input.itemResults === 'object' ? input.itemResults : {},
      commentIds: Array.isArray(input.commentIds) ? input.commentIds.slice(0, 10) : [],
      late: input.late === true, forgot: input.forgot === true,
      forgotItems: Array.isArray(input.forgotItems) ? input.forgotItems.filter(item => ['workbook', 'stationery', 'other'].includes(item)) : [],
      forgotOther: clean(input.forgotOther).slice(0, 200), note: clean(input.note),
      nextLessonNote: clean(input.nextLessonNote).slice(0, 1000),
      nextLessonItems: Array.isArray(input.nextLessonItems) ? input.nextLessonItems.slice(0, 20).map(item => ({ subject: clean(item?.subject).slice(0, 30), materialId: clean(item?.materialId).slice(0, 128), range: clean(item?.range).slice(0, 300), note: clean(item?.note).slice(0, 300), customLabel: clean(item?.customLabel).slice(0, 100), difficulty: Number(item?.difficulty || 3) })) : [],
      wordCorrect: String(input.wordCorrect ?? '').slice(0, 5), wordTotal: String(input.wordTotal ?? '').slice(0, 5),
      wordRange: input.wordRange || null, nextWordRange: input.nextWordRange || null,
      wordRangeMode: ['same', 'next', 'custom'].includes(input.wordRangeMode) ? input.wordRangeMode : 'same',
      learningContent: clean(input.learningContent).slice(0, 500),
      reportFacts: input.reportFacts && typeof input.reportFacts === 'object' ? input.reportFacts : {},
      nextItems: Array.isArray(input.nextItems) ? input.nextItems.slice(0, 20) : [],
      dueDate: String(input.dueDate || '').slice(0, 10), homework: String(input.homework || 'none').slice(0, 30),
      nextId: String(input.nextId || '').slice(0, 128), nextVersion: input.nextVersion ?? null,
    };
    const missingFields = [];
    if (grade < 10 && !payload.learningContent) missingFields.push('学習内容');
    if (grade < 10 && !String(payload.reportFacts?.extraNote || '').trim()) missingFields.push('授業報告');
    await adminDb.collection('lessonDrafts').doc(date).collection('students').doc(studentKey).set({ studentKey, date, grade, payload, missingFields, updatedBy: staff.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ saved: true, missingFields });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
export async function DELETE(request){try{const staff=await requireStaff(request),params=new URL(request.url).searchParams,date=params.get('date'),studentKey=params.get('student');if(!validDate(date)||!validKey(studentKey))throw new Error('授業日または生徒を確認してください。');await adminDb.collection('lessonDrafts').doc(date).collection('students').doc(studentKey).delete();return Response.json({deleted:true,uid:staff.uid});}catch(error){return Response.json({error:error.message},{status:error.status||400})}}
