import { adminDb } from '@/lib/firebaseAdmin';

const status=value=>value==='欠席'||value==='休み'?'absent':value==='振替'||value==='振替出席'?'makeup':value==='出席'?'present':value;
export async function readAbsenceCandidates({studentKey,student}) {
  const common=await adminDb.collection('adminLessonAttendance').doc(studentKey).collection('records').get();
  const records=new Map();
  const grade=Number(student.grade);
  if(studentKey.startsWith('user_')&&grade>=7&&grade<=9){
    // 学年度をまたいだ未消化の欠席も振替対象になるため、現在年度だけに限定しない。
    const termDocs=await adminDb.collection('users').doc(student.id).collection('lessonTerms').get();
    const terms=await Promise.all(termDocs.docs.map(term=>term.ref.collection('records').get()));
    terms.forEach(snapshot=>snapshot.docs.forEach(doc=>records.set(doc.id,{date:doc.id,...doc.data(),source:'lessonTerms'})));
  }
  common.docs.forEach(doc=>{
    const current=records.get(doc.id)||{};
    const value=doc.data(),currentStatus=status(current.status||current.attendance),commonStatus=status(value.status||value.attendance);
    // 共通出欠が明示されている場合だけ優先し、古い空の共通レコードで欠席記録を隠さない。
    records.set(doc.id,{...current,...value,date:doc.id,status:commonStatus||currentStatus,attendance:commonStatus||currentStatus,source:commonStatus?'common':current.source||'common'});
  });
  // 振替済みかどうかは実在する振替記録で判断する。古い makeupCompleted フラグだけでは候補を除外しない。
  const makeupOrigins=new Set([...records.values()].filter(item=>status(item.status||item.attendance)==='makeup').map(item=>item.originalDate||item.originalLessonDate).filter(Boolean));
  return [...records.values()].filter(item=>status(item.status||item.attendance)==='absent'&&!makeupOrigins.has(item.date)).sort((a,b)=>b.date.localeCompare(a.date)).map(item=>({date:item.date,note:String(item.note||item.behaviorNote||'').slice(0,120)}));
}
