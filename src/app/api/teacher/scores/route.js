import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireStaff, normalizeStudentKey } from '@/lib/staffAccess';
import { normalizeTopPercent, schoolDeviationFromTopPercent } from '@/lib/schoolDeviation.mjs';

const MAIN=['国語','社会','数学','理科','英語'],SUB=['音楽','美術','保体','技家'];
const numbers=(value,subjects,min,max)=>Object.fromEntries(subjects.map(subject=>{const raw=value?.[subject],number=Number(raw);if(raw===null||raw===undefined||String(raw).trim()===''||!Number.isInteger(number)||number<min||number>max)throw new Error(`${subject}の値を確認してください。`);return[subject,number]}));

export async function POST(request){
  try{
    const staff=await requireStaff(request),body=await request.json(),studentKey=normalizeStudentKey(body.student);
    if(!studentKey.startsWith('user_'))throw new Error('成績入力は中学生のみ利用できます。');
    const uid=studentKey.slice(5),student=await adminDb.collection('users').doc(uid).get(),profile=student.data()||{},grade=Number(profile.grade);
    if(!student.exists||profile.active===false||profile.enrollmentStatus==='withdrawn'||grade<7||grade>9)throw new Error('対象の中学生を確認できません。');
    const year=String(body.year||''),term=String(body.term||'');if(!/^20\d{2}$/.test(year)||!['1学期','2学期','3学期'].includes(term))throw new Error('年度・学期を確認してください。');
    const ref=adminDb.collection('users').doc(uid).collection('scores');
    await adminDb.runTransaction(async transaction=>{
      const existing=await transaction.get(ref.where('year','==',year).where('term','==',term));let data;
      if(body.type==='exam'){
        const testType=String(body.testType||'').trim().slice(0,60);if(!testType)throw new Error('テスト名を入力してください。');if(existing.docs.some(doc=>doc.data().type==='exam'&&doc.data().testType===testType))throw new Error('同じテストの成績は登録済みです。');
        const exam=numbers(body.exam,MAIN,0,100),examTotal=Object.values(exam).reduce((sum,value)=>sum+value,0),gradePercentile=normalizeTopPercent(body.gradePercentile);
        data={type:'exam',year,grade,term,testType,exam,examTotal,examConverted:examTotal*.5,gradePercentile,schoolEstimatedDeviation:schoolDeviationFromTopPercent(gradePercentile)};
      }else if(body.type==='internal'){
        if(existing.docs.some(doc=>doc.data().type==='internal'))throw new Error('この学期の通知表は登録済みです。');const internalMain=numbers(body.internalMain,MAIN,1,5),internalSub=numbers(body.internalSub,SUB,1,5),internalTotal=Object.values(internalMain).reduce((sum,value)=>sum+value,0)*4+Object.values(internalSub).reduce((sum,value)=>sum+value,0)*7.5;data={type:'internal',year,grade,term,internalMain,internalSub,internalTotal};
      }else throw new Error('成績の種類が正しくありません。');
      transaction.set(ref.doc(),{...data,submittedBy:staff.role,submittedByUid:staff.uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    });
    return Response.json({saved:true});
  }catch(error){return Response.json({error:error.message||'成績を保存できませんでした。'},{status:error.status||400});}
}
