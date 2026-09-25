import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
import { pendingLessonItems } from '@/lib/pendingLessonItems';
import { SHIFT_PERIODS, shiftWeekStart } from '@/lib/weeklyShifts';

export const dynamic='force-dynamic';
const validKey=value=>/^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(value||'');
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');

export async function GET(request){
  try{
    await requireAdmin(request);
    const rows=(await pendingLessonItems('lessonReportSubmissions')).sort((a,b)=>String(a.data().date).localeCompare(String(b.data().date))).slice(0,100);
    const weeks=[...new Set(rows.map(doc=>shiftWeekStart(doc.data().date)).filter(Boolean))];
    const [teacherDocs,shiftDocs]=await Promise.all([adminDb.collection('teachers').get(),Promise.all(weeks.map(week=>adminDb.collection('weeklyShifts').doc(week).get()))]);
    const teacherNames=new Map(teacherDocs.docs.map(doc=>[doc.id,doc.data().displayName||doc.data().email||doc.id]));
    const shifts=new Map(shiftDocs.map((doc,index)=>[weeks[index],doc.data()?.entries||[]]));
    const keys=[...new Set(rows.map(doc=>doc.data().studentKey).filter(validKey))];
    const profiles=await Promise.all(keys.map(async key=>{
      const elementary=key.startsWith('elementary_'),id=key.replace(/^(user|elementary)_/,'');
      const snap=await adminDb.collection(elementary?'adminStudents':'users').doc(id).get();
      return[key,snap.data()?.realName||snap.data()?.name||snap.data()?.displayName||'名前未設定'];
    }));
    const names=Object.fromEntries(profiles);
    const items=rows.map(doc=>{const value=doc.data(),entry=shifts.get(shiftWeekStart(value.date))?.find(row=>row.date===value.date&&row.studentKey===value.studentKey),period=SHIFT_PERIODS.find(item=>item.id===entry?.periodId),teacherUid=entry?.teacherUid||value.submittedBy;return{id:doc.id,...value,name:names[value.studentKey]||'名前未設定',teacherName:teacherNames.get(teacherUid)||'担当講師不明',periodOrder:period?SHIFT_PERIODS.indexOf(period)+3:99,periodLabel:period?.label||'講未設定',submittedAt:value.submittedAt?.toDate?.().toISOString()||null};}).sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.periodOrder-b.periodOrder||a.name.localeCompare(b.name,'ja'));
    return Response.json({items});
  }catch(error){return Response.json({error:error.message},{status:error.status||400});}
}

export async function PATCH(request){
  try{
    const admin=await requireAdmin(request),body=await request.json(),studentKey=String(body.studentKey||''),date=String(body.date||''),text=String(body.text||'').trim().slice(0,2000);
    if(!validKey(studentKey)||!validDate(date)||!text)throw new Error('承認する授業報告を確認してください。');
    const submission=adminDb.collection('lessonReportSubmissions').doc(studentKey).collection('items').doc(date),publicRef=adminDb.collection('lessonPublic').doc(studentKey).collection('records').doc(date);
    await adminDb.runTransaction(async tx=>{
      const current=await tx.get(submission);if(!current.exists||current.data().status!=='pending')throw new Error('未承認の授業報告が見つかりません。');
      const now=FieldValue.serverTimestamp();
      tx.set(publicRef,{lessonReport:{version:3,text,source:'approved_lesson_report'},updatedAt:now},{merge:true});
      tx.set(submission,{text,status:'approved',approvedBy:admin.uid,approvedAt:now,updatedAt:now},{merge:true});
    });
    return Response.json({approved:true});
  }catch(error){return Response.json({error:error.message},{status:error.status||400});}
}
