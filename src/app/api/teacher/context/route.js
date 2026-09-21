import { adminDb } from '@/lib/firebaseAdmin';
import { requireStaff } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import { readAbsenceCandidates } from '@/lib/absenceCandidates';
import { FieldValue } from 'firebase-admin/firestore';
import { matchingSubmissionEntries, normalizeSchool, projectSubmissionStatus } from '@/lib/scoreSubmissionPlan.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const staff = await requireStaff(request);
    const date = new URL(request.url).searchParams.get('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('日付が正しくありません。');
    const [users, elementary, daily,drafts,profiles] = await Promise.all([adminDb.collection('users').get(), adminDb.collection('adminStudents').get(),adminDb.collection('dailyLessonInputs').doc(date).collection('students').get(),adminDb.collection('lessonDrafts').doc(date).collection('students').get(),adminDb.collection('studentProfiles').get()]);
    const inputStatus = Object.fromEntries(daily.docs.map(doc => [doc.id,{ updatedAt:doc.data().updatedAt?.toDate?.().toISOString() || null,updatedBy:doc.data().updatedBy || null,missingFields:Array.isArray(doc.data().missingFields)?doc.data().missingFields:[] }]));
    const draftStatus=Object.fromEntries(drafts.docs.map(doc=>[doc.id,{updatedAt:doc.data().updatedAt?.toDate?.().toISOString()||null,updatedBy:doc.data().updatedBy||null,missingFields:doc.data().missingFields||[]}]))
    const weekday = new Date(`${date}T12:00:00+09:00`).getDay();
    const students = [...users.docs.map(doc => ({ key: `user_${doc.id}`, id: doc.id, source: 'user', ...doc.data() })), ...elementary.docs.map(doc => ({ key: `elementary_${doc.id}`, id: doc.id, source: 'elementary', ...doc.data() }))]
      .filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn')
      .map(data => { const weekdays = data.lessonSchedule?.weekdays || data.weekdays || []; return { key: data.key, id: data.id, source: data.source, name: data.realName || data.name || data.displayName || '名前未設定', grade: Number(data.grade), tags:Array.isArray(data.tags)?data.tags:[], weekdays, scheduled: weekdays.map(Number).includes(weekday), lessonStartTime:data.lessonSchedule?.startTime||data.lessonStartTime||'', wordTestQuestionCount: Number(data.wordTestQuestionCount || (Number(data.grade) === 7 ? 20 : Number(data.grade) === 8 ? 30 : Number(data.grade) === 9 ? 50 : 20)), wordTestCurrentRange: data.wordTestCurrentRange || null }; })
      .sort((a, b) => Number(b.scheduled)-Number(a.scheduled)||(a.lessonStartTime||'99:99').localeCompare(b.lessonStartTime||'99:99')||a.grade-b.grade||a.name.localeCompare(b.name,'ja'));
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
    const profileMap=new Map(profiles.docs.map(doc=>[doc.id,doc.data()]));
    const selectedProfile = requested ? profileMap.get(requested) : null;
    const selectedStudent=requested?students.find(item=>item.key===requested):null;
    const absenceCandidates=selectedStudent?await readAbsenceCandidates({studentKey:requested,student:selectedStudent,year:term.year}):[];
    const statusTargets=students.filter(item=>item.source==='user'&&item.grade>=7&&item.grade<=9&&(item.scheduled||item.key===requested));
    const calendar=statusTargets.length?await adminDb.collection('scoreSubmissionCalendars').doc(String(term.year)).collection('entries').get():{docs:[]};
    const calendarEntries=calendar.docs.map(doc=>({id:doc.id,...doc.data()}));
    const schoolNames=[...new Set(calendarEntries.map(item=>String(item.schoolName||'')).filter(Boolean))];
    const statusPairs=await Promise.all(statusTargets.map(async item=>{const [scores,saved]=await Promise.all([adminDb.collection('users').doc(item.id).collection('scores').where('year','==',String(term.year)).where('term','==',`${term.term}学期`).get(),adminDb.collection('scoreSubmissionTerms').doc(term.id).collection('students').doc(item.id).get()]);const legacySchool=String(profileMap.get(item.key)?.schoolName||''),tagSchool=item.tags.find(tag=>schoolNames.some(name=>normalizeSchool(name)===normalizeSchool(tag))),schoolName=tagSchool||legacySchool;const entries=matchingSubmissionEntries(calendarEntries,{grade:item.grade,schoolName},term.id);return[item.key,projectSubmissionStatus(entries,saved.data()||{},date,scores.docs.map(doc=>doc.data()))] }));
    const submissionByStudent=Object.fromEntries(statusPairs);
    const publicGuidance=(value,submissionStatus)=>value||submissionStatus ? { policy: String(value?.memo || '').slice(0,2000), materials: String(value?.materials || '').slice(0,1000), courseMaterials: String(value?.courseMaterials || '').slice(0,1000), teacherMemo:String(value?.teacherMemo||'').slice(0,2000), sharedInfo:String(value?.sharedInfo||'').slice(0,3000), submissionStatus:submissionStatus||null } : null;
    const guidance = publicGuidance(selectedProfile,submissionByStudent[requested]);
    const guidanceByStudent=Object.fromEntries(students.map(item=>[item.key,publicGuidance(profileMap.get(item.key),submissionByStudent[item.key])]).filter(([,value])=>value));
    const existingDraft=requested&&drafts.docs.find(item=>item.id===requested)?.data()?.payload||null;
    return Response.json({ role: staff.role, displayName: staff.profile?.displayName || '管理者', date, weekday, term, students, inputStatus, draftStatus, existingRecord, existingDraft, guidance, guidanceByStudent, absenceCandidates });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');
const validKey=value=>/^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(value||'');
const clean=value=>String(value||'').slice(0,5000);
export async function POST(request){try{const staff=await requireStaff(request),body=await request.json(),date=body.date,studentKey=body.studentKey;if(!validDate(date)||!validKey(studentKey))throw new Error('授業日または生徒を確認してください。');const studentId=studentKey.replace(/^(user|elementary)_/,''),elementary=studentKey.startsWith('elementary_'),student=await adminDb.collection(elementary?'adminStudents':'users').doc(studentId).get();if(!student.exists)throw new Error('生徒が見つかりません。');const grade=Number(student.data().grade);const payload={attendance:['present','absent','makeup'].includes(body.payload?.attendance)?body.payload.attendance:'present',originalDate:String(body.payload?.originalDate||'').slice(0,10),reviewId:clean(body.payload?.reviewId).slice(0,128),itemResults:body.payload?.itemResults&&typeof body.payload.itemResults==='object'?body.payload.itemResults:{},commentIds:Array.isArray(body.payload?.commentIds)?body.payload.commentIds.slice(0,10):[],late:body.payload?.late===true,forgot:body.payload?.forgot===true,note:clean(body.payload?.note),wordCorrect:String(body.payload?.wordCorrect??'').slice(0,5),wordTotal:String(body.payload?.wordTotal??'').slice(0,5),wordRange:body.payload?.wordRange||null,nextWordRange:body.payload?.nextWordRange||null,wordRangeMode:['same','next','custom'].includes(body.payload?.wordRangeMode)?body.payload.wordRangeMode:'same',learningContent:clean(body.payload?.learningContent).slice(0,500),reportFacts:body.payload?.reportFacts&&typeof body.payload.reportFacts==='object'?body.payload.reportFacts:{},nextItems:Array.isArray(body.payload?.nextItems)?body.payload.nextItems.slice(0,20):[],dueDate:String(body.payload?.dueDate||'').slice(0,10),homework:String(body.payload?.homework||'none').slice(0,30),nextId:String(body.payload?.nextId||'').slice(0,128),nextVersion:body.payload?.nextVersion??null};const missingFields=[];if(grade<10&&!payload.learningContent)missingFields.push('学習内容');if(grade<10&&!String(payload.reportFacts?.extraNote||'').trim())missingFields.push('授業報告');await adminDb.collection('lessonDrafts').doc(date).collection('students').doc(studentKey).set({studentKey,date,grade,payload,missingFields,updatedBy:staff.uid,updatedAt:FieldValue.serverTimestamp()},{merge:true});return Response.json({saved:true,missingFields});}catch(error){return Response.json({error:error.message},{status:error.status||400})}}
export async function DELETE(request){try{const staff=await requireStaff(request),params=new URL(request.url).searchParams,date=params.get('date'),studentKey=params.get('student');if(!validDate(date)||!validKey(studentKey))throw new Error('授業日または生徒を確認してください。');await adminDb.collection('lessonDrafts').doc(date).collection('students').doc(studentKey).delete();return Response.json({deleted:true,uid:staff.uid});}catch(error){return Response.json({error:error.message},{status:error.status||400})}}
