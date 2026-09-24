import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { normalizeTopPercent, schoolDeviationFromTopPercent } from '@/lib/schoolDeviation.mjs';
import { resolveStudentIdentity } from '@/lib/studentIdentity';


const MAIN=['国語','社会','数学','理科','英語'], SUB=['音楽','美術','保体','技家'];
const validTerm=value=>['1学期','2学期','3学期'].includes(value);
const numbers=(value,subjects,min,max)=>Object.fromEntries(subjects.map(subject=>{const raw=value?.[subject],number=Number(raw);if(raw===null||raw===undefined||String(raw).trim()===''||!Number.isInteger(number)||number<min||number>max)throw new Error(`${subject}の値を確認してください。`);return[subject,number]}));

export async function POST(request) {
  try {
    const header=request.headers.get('authorization')||'';if(!header.startsWith('Bearer '))return Response.json({error:'ログインしてください。'},{status:401});
    const user=await adminAuth.verifyIdToken(header.slice(7),true),body=await request.json(),uid=user.uid;
    const identity=await resolveStudentIdentity(uid),student=identity.student,profile=student.data()||{};
    if(!student.exists||profile.active===false||profile.enrollmentStatus==='withdrawn'||Number(profile.grade)<7||Number(profile.grade)>9)throw new Error('対象の中学生を確認できません。');
    const grade=Number(body.grade||profile.grade);if(![7,8,9].includes(grade))throw new Error('学年を確認してください。');
    const year=String(body.year||''), term=String(body.term||'');
    if(!/^20\d{2}$/.test(year)||!validTerm(term))throw new Error('年度・学期を確認してください。');
    const settings=await readAcademicSettings();if(!settings.some(item=>String(item.year)===year&&item.terms?.[Number(term[0])]))throw new Error('登録済みの年度・学期を選んでください。');
    const ref=identity.ref.collection('scores');
    await adminDb.runTransaction(async transaction=>{
    const existing=await transaction.get(ref.where('year','==',year).where('term','==',term));
    let data;
    if(body.type==='exam'){
      const testType=String(body.testType||'').trim().slice(0,60);if(!testType)throw new Error('テスト名を入力してください。');
      if(existing.docs.some(doc=>doc.data().type==='exam'&&doc.data().testType===testType))throw new Error('同じテストの成績は登録済みです。');
      const exam=numbers(body.exam,MAIN,0,100),examTotal=Object.values(exam).reduce((sum,value)=>sum+value,0);
      const gradePercentile=normalizeTopPercent(body.gradePercentile);
      data={type:'exam',year,grade,term,testType,exam,examTotal,examConverted:examTotal*.5,gradePercentile,schoolEstimatedDeviation:schoolDeviationFromTopPercent(gradePercentile)};
    }else if(body.type==='internal'){
      if(existing.docs.some(doc=>doc.data().type==='internal'))throw new Error('この学期の通知表は登録済みです。');
      const internalMain=numbers(body.internalMain,MAIN,1,5),internalSub=numbers(body.internalSub,SUB,1,5);
      const internalTotal=Object.values(internalMain).reduce((sum,value)=>sum+value,0)*4+Object.values(internalSub).reduce((sum,value)=>sum+value,0)*7.5;
      data={type:'internal',year,grade,term,internalMain,internalSub,internalTotal};
    }else throw new Error('成績の種類が正しくありません。');
    transaction.set(ref.doc(),{...data,submittedBy:'student',submittedByUid:uid,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    });
    return Response.json({saved:true});
  } catch(error){return Response.json({error:error.message||'成績を保存できませんでした。'},{status:error.status||400});}
}
