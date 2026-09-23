import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { resolveAcademicTerm, japanDateId } from '@/lib/academicCalendar.mjs';
import { summarizeTermHistory } from '@/lib/termLedger.mjs';
export async function POST(request){try{
  await requireAdmin(request);const settings=await readAcademicSettings(),current=resolveAcademicTerm(settings,japanDateId());
  const seasonRef=adminDb.collection('admin_data').doc('season');
  const result=await adminDb.runTransaction(async tx=>{
    const [season,users,admins]=await Promise.all([tx.get(seasonRef),tx.get(adminDb.collection('users')),tx.get(adminDb.collection('admins'))]);
    if(season.data()?.lastResetSeason===current.id)return {alreadyStarted:true};
    const oldId=season.data()?.lastResetSeason;const [year,term]=String(oldId||'').split('_').map(Number);
    const oldPeriod=settings.find(item=>item.year===year)?.terms?.[term];
    if(!oldPeriod?.start||!oldPeriod?.end)throw new Error('前学期の期間設定を確認してください。データは変更していません。');
    const adminIds=new Set(admins.docs.map(item=>item.id));const students=users.docs.filter(item=>!adminIds.has(item.id));
    if(students.length>200)throw new Error('一度に処理できる生徒数を超えました。管理者に確認してください。');
    const histories=await Promise.all(students.map(item=>tx.get(item.ref.collection('pointHistory'))));
    const existingArchives=await Promise.all(students.map(item=>tx.get(item.ref.collection('termArchives').doc(oldId))));
    const archived=[];
    students.forEach((item,index)=>{
      const rows=histories[index].docs.map(doc=>doc.data()),old=summarizeTermHistory(rows,oldPeriod),next=summarizeTermHistory(rows,current);
      archived.push({id:item.id,...item.data(),...old});
      if(!existingArchives[index].exists)tx.set(item.ref.collection('termArchives').doc(oldId),{...old,legacySnapshot:Object.fromEntries(Object.keys(old).map(key=>[key,Number(item.data()[key]||0)])),seasonId:oldId,displayName:item.data().displayName||'',grade:item.data().grade??null,walletPointsAtClose:item.data().points||0,totalEarnedPointsAtClose:item.data().totalEarnedPoints||0,closedAt:FieldValue.serverTimestamp()},{merge:true});
      tx.update(item.ref,{...next,termPointsSeason:current.id});
    });
    const hall={season:oldId,createdAt:FieldValue.serverTimestamp()};
    for(const [category,field] of Object.entries({points:'termPoints',studyHours:'termStudyMinutes',wordTotal:'termWordScore',selfStudyCount:'termSelfStudyCount',homeworkCount:'termHomeworkCount'}))hall[category]={top3:[...archived].filter(item=>item.active!==false&&item.enrollmentStatus!=='withdrawn').sort((a,b)=>b[field]-a[field]).slice(0,3).map((item,index)=>({rank:index+1,uid:item.id,displayName:item.displayName||'',points:item[field],level:item.level||1}))};
    tx.set(adminDb.collection('hallOfFame').doc(oldId),hall);
    tx.set(seasonRef,{lastResetSeason:current.id,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {started:true};
  });return Response.json(result);
}catch(error){return Response.json({error:error.message},{status:error.status||400})}}
