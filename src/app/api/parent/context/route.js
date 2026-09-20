import { adminDb } from '@/lib/firebaseAdmin';
import { requireParent, linkedChildren } from '@/lib/parentAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { japanDateId, resolveAcademicTerm } from '@/lib/academicCalendar.mjs';
import { matchingSubmissionEntries, projectSubmissionStatus } from '@/lib/scoreSubmissionPlan.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const parent = await requireParent(request),project=(key,data,adminTest=false)=>({key,name:data.realName||data.name||data.displayName||(adminTest?'管理者':'名前未設定'),grade:Number(data.grade||0),weekdays:(data.lessonSchedule?.weekdays||data.weekdays||[]).map(Number),tags:Array.isArray(data.tags)?data.tags:[],courseTags:Array.isArray(data.courseTags)?data.courseTags:[],adminTest});
    let children=[];
    if(parent.role==='admin'){
      const[users,elementary]=await Promise.all([adminDb.collection('users').get(),adminDb.collection('adminStudents').get()]);
      children=[...users.docs.map(doc=>({key:`user_${doc.id}`,id:doc.id,data:doc.data(),adminTest:doc.id===parent.uid})),...elementary.docs.map(doc=>({key:`elementary_${doc.id}`,id:doc.id,data:doc.data(),adminTest:false}))].filter(item=>item.adminTest||item.data.active!==false&&item.data.enrollmentStatus!=='withdrawn'&&Number(item.data.grade)<=9).sort((a,b)=>Number(b.adminTest)-Number(a.adminTest)).map(item=>project(item.key,item.data,item.adminTest));
    }else{
      const keys=await linkedChildren(parent.uid,false);children=(await Promise.all(keys.map(async key=>{const elementary=key.startsWith('elementary_'),id=key.replace(/^(user|elementary)_/,'');const doc=await adminDb.collection(elementary?'adminStudents':'users').doc(id).get();if(!doc.exists||doc.data().active===false||doc.data().enrollmentStatus==='withdrawn'||Number(doc.data().grade)>9)return null;return project(key,doc.data())}))).filter(Boolean);
    }
    let currentTermId=null, submissionStatus={};
    try {
      currentTermId=resolveAcademicTerm(await readAcademicSettings(),japanDateId()).id;
      const ids=parent.role==='admin'?[]:children.filter(child=>child.key.startsWith('user_')&&child.grade>=7&&child.grade<=9).map(child=>child.key.slice(5));
      const year=currentTermId.split('_')[0],calendar=ids.length?await adminDb.collection('scoreSubmissionCalendars').doc(year).collection('entries').get():{docs:[]},entries=calendar.docs.map(doc=>({id:doc.id,...doc.data()}));
      const term=`${currentTermId.split('_')[1]}学期`,snapshots=await Promise.all(ids.map(async id=>Promise.all([adminDb.collection('scoreSubmissionTerms').doc(currentTermId).collection('students').doc(id).get(),adminDb.collection('studentProfiles').doc(`user_${id}`).get(),adminDb.collection('users').doc(id).collection('scores').where('year','==',year).where('term','==',term).get()])));
      const schools=[...new Set(entries.map(item=>String(item.schoolName||'')).filter(Boolean))];
      submissionStatus=Object.fromEntries(snapshots.map(([status,profile,scores],index)=>{const child=children.find(item=>item.key===`user_${ids[index]}`),tagSchool=(child?.tags||[]).find(tag=>schools.some(name=>String(name).normalize('NFKC').replace(/\s+/g,'')===String(tag).normalize('NFKC').replace(/\s+/g,''))),matched=matchingSubmissionEntries(entries,{grade:child?.grade,schoolName:tagSchool||profile.data()?.schoolName||''},currentTermId);return [ids[index],projectSubmissionStatus(matched,status.data()||{},japanDateId(),scores.docs.map(doc=>doc.data()))]}));
    } catch {}
    return Response.json({ parent: { displayName: parent.profile.displayName }, adminPreview: parent.role === 'admin', children, currentTermId, submissionStatus });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
}
