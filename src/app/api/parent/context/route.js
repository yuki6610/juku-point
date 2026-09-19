import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent, linkedChildren } from '@/lib/parentAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { japanDateId, resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import { matchingSubmissionEntries, projectSubmissionStatus } from '@/lib/scoreSubmissionPlan.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const parent = await requireParent(request); const keys = await linkedChildren(parent.uid, parent.role === 'admin');
    const children = (await Promise.all(keys.map(async key => { const elementary = key.startsWith('elementary_'); const id = key.replace(/^(user|elementary)_/, ''); const doc = await adminDb.collection(elementary ? 'adminStudents' : 'users').doc(id).get(),adminTest=parent.role==='admin'&&id===parent.uid; if (!doc.exists || !adminTest&&(doc.data().active === false || doc.data().enrollmentStatus === 'withdrawn' || Number(doc.data().grade)>9)) return null; const data = doc.data(); return { key, name: data.realName || data.name || data.displayName || (adminTest?'管理者':'名前未設定'), grade: Number(data.grade || 0), weekdays:(data.lessonSchedule?.weekdays || data.weekdays || []).map(Number), courseTags:Array.isArray(data.courseTags)?data.courseTags:[], adminTest }; }))).filter(Boolean);
    let currentTermId=null, submissionStatus={};
    try {
      currentTermId=resolveAcademicTerm(await readAcademicSettings(),japanDateId()).id;
      const ids=children.filter(child=>child.key.startsWith('user_')&&child.grade>=7&&child.grade<=9).map(child=>child.key.slice(5));
      const year=currentTermId.split('_')[0],calendar=await adminDb.collection('scoreSubmissionCalendars').doc(year).collection('entries').get(),entries=calendar.docs.map(doc=>({id:doc.id,...doc.data()}));
      const snapshots=await Promise.all(ids.map(async id=>Promise.all([adminDb.collection('scoreSubmissionTerms').doc(currentTermId).collection('students').doc(id).get(),adminDb.collection('studentProfiles').doc(`user_${id}`).get()])));
      submissionStatus=Object.fromEntries(snapshots.map(([status,profile],index)=>{const child=children.find(item=>item.key===`user_${ids[index]}`),matched=matchingSubmissionEntries(entries,{grade:child?.grade,schoolName:profile.data()?.schoolName||''},currentTermId);return [ids[index],projectSubmissionStatus(matched,status.data()||{},japanDateId())]}));
    } catch {}
    return Response.json({ parent: { displayName: parent.profile.displayName }, adminPreview: parent.role === 'admin', children, currentTermId, submissionStatus });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
}
