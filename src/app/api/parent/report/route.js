import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent, linkedChildren } from '@/lib/parentAccess';
import { normalizeStudentKey } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { japanDateId, resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import { buildParentTermSummary, publicScore } from '@/lib/parentReport.mjs';
import { readPublicHomeworkCompatible } from '@/lib/homeworkServer';
import { mergeParentLessons } from '@/lib/parentLessonCompatibility.mjs';
import { matchingSubmissionEntries, projectSubmissionStatus } from '@/lib/scoreSubmissionPlan.mjs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const parent = await requireParent(request), params = new URL(request.url).searchParams;
    const studentKey = normalizeStudentKey(params.get('student')), termId = params.get('term');
    if (!(await linkedChildren(parent.uid, parent.role === 'admin')).includes(studentKey)) return Response.json({ error: 'この生徒の情報を閲覧する権限がありません。' }, { status: 403 });
    const settings = await readAcademicSettings();
    const terms = settings.flatMap(item => [1,2,3].map(term => ({ id: `${item.year}_${term}`, year: item.year, term, ...(item.terms?.[term] || item.terms?.[String(term)] || {}) }))).filter(item => item.start && item.end).sort((a,b) => b.start.localeCompare(a.start));
    let currentTermId = null; try { currentTermId = resolveAcademicTerm(settings, japanDateId()).id; } catch {}
    if (!termId) return Response.json({ terms, currentTermId });
    const selected = terms.find(item => item.id === termId); if (!selected) throw new Error('学期設定が見つかりません。');
    const elementary = studentKey.startsWith('elementary_'), id = studentKey.replace(/^(user|elementary)_/, '');
    const publicLessons = await adminDb.collection('lessonPublic').doc(studentKey).collection('records').where(FieldPath.documentId(), '>=', selected.start).where(FieldPath.documentId(), '<=', selected.end).limit(300).get();
    const student = await adminDb.collection(elementary ? 'adminStudents' : 'users').doc(id).get();
    if (!student.exists || student.data().active === false || student.data().enrollmentStatus === 'withdrawn' || Number(student.data().grade)>9) throw new Error('対象生徒を確認できません。');
    const profile = await adminDb.collection('studentProfiles').doc(studentKey).get();
    let legacyLessons;
    if (!elementary && Number(student.data().grade) >= 7 && Number(student.data().grade) <= 9) legacyLessons = await adminDb.collection('users').doc(id).collection('lessonTerms').doc(termId).collection('records').limit(300).get();
    else legacyLessons = await adminDb.collection('adminLessonAttendance').doc(studentKey).collection('records').where(FieldPath.documentId(), '>=', selected.start).where(FieldPath.documentId(), '<=', selected.end).limit(300).get();
    const common=await adminDb.collection('adminLessonAttendance').doc(studentKey).collection('records').where(FieldPath.documentId(),'>=',selected.start).where(FieldPath.documentId(),'<=',selected.end).limit(300).get();
    const byDate=mergeParentLessons([
      ...legacyLessons.docs.map(doc=>({id:doc.id,data:doc.data(),source:'legacy'})),
      ...common.docs.map(doc=>({id:doc.id,data:doc.data(),source:'common'})),
      ...publicLessons.docs.map(doc=>({id:doc.id,data:doc.data(),source:'public'})),
    ]);
    const through=new Date(`${selected.end}T00:00:00Z`);through.setUTCDate(through.getUTCDate()+1);
    const assignments = (await readPublicHomeworkCompatible(studentKey, 300, through.toISOString().slice(0,10))).filter(item => item.review?.date >= selected.start && item.review?.date <= selected.end);
    let scores = [], submissionStatus = null;
    if (!elementary) { const ref=adminDb.collection('users').doc(id).collection('scores'),snapshots=await Promise.all([ref.where('year','==',String(selected.year)).get(),ref.where('year','==',Number(selected.year)).get()]),docs=new Map();snapshots.forEach(snapshot=>snapshot.docs.forEach(doc=>docs.set(doc.id,doc)));scores=[...docs.values()].map(doc => publicScore(doc.data(), doc.id)).filter(item => item && item.year === String(selected.year) && item.term === `${selected.term}学期`).sort((a,b)=>b.createdAt-a.createdAt); }
    if (!elementary && Number(student.data().grade) >= 7) {
      const [status,calendar]=await Promise.all([adminDb.collection('scoreSubmissionTerms').doc(termId).collection('students').doc(id).get(),adminDb.collection('scoreSubmissionCalendars').doc(String(selected.year)).collection('entries').get()]);
      const saved=status.data()||{},entries=matchingSubmissionEntries(calendar.docs.map(doc=>({id:doc.id,...doc.data()})),{grade:student.data().grade,schoolName:profile.data()?.schoolName||''},termId);
      submissionStatus=projectSubmissionStatus(entries,saved,japanDateId(),scores);
    }
    let entranceExams=[],latestJudgement=null,schoolComparisons=[];
    if(!elementary&&Number(student.data().grade)>=7){const latestExam=scores.find(item=>item.type==='exam'),latestInternal=scores.find(item=>item.type==='internal');if(latestExam&&latestInternal){const total=Number(latestExam.converted||0)+Number(latestInternal.total||0),schools=await adminDb.collection('schools').get();schoolComparisons=schools.docs.map(doc=>{const value=doc.data(),difference=total-Number(value.minScore||0);return{name:String(value.name||value.schoolName||'高校名未設定'),difference,label:difference>=20?'安全圏':difference>=0?'合格圏':difference>=-20?'努力圏':'要努力'}}).sort((a,b)=>b.difference-a.difference);const target=String(profile.data()?.targetSchool||'').trim();latestJudgement=schoolComparisons.find(item=>item.name===target)||null;}}
    if(!elementary&&Number(student.data().grade)===9){
      const examDates=(await adminDb.collection('admin_data').doc('examDates').get()).data()?.years?.[selected.year]||{};
      const definitions=[['private','exam_private','私立入試'],['recommendation','exam_recommendation','公立推薦'],['general','exam_general','公立一般']];
      const tags=Array.isArray(student.data().courseTags)?student.data().courseTags:[],assigned=definitions.filter(([,tag])=>tags.includes(tag));
      entranceExams=(assigned.length?assigned:definitions).filter(([id])=>examDates[id]).map(([id,,label])=>({id,label,date:examDates[id]}));
    }
    return Response.json({ terms, currentTermId, selected, summary: buildParentTermSummary([...byDate.values()], assignments), scores, submissionStatus, targetSchool:String(profile.data()?.targetSchool||''), entranceExams, latestJudgement, schoolComparisons });
  } catch (error) { return Response.json({ error: error.message || '学期レポートを取得できませんでした。' }, { status: error.status || 400 }); }
}
