import { adminDb } from '@/lib/firebaseAdmin';

const status=value=>value==='欠席'||value==='休み'?'absent':value==='振替'||value==='振替出席'?'makeup':value==='出席'?'present':value;
export async function readAbsenceCandidates({studentKey,student,year}) {
  const common=await adminDb.collection('adminLessonAttendance').doc(studentKey).collection('records').get();
  const records=new Map();
  common.docs.forEach(doc=>records.set(doc.id,{date:doc.id,...doc.data(),source:'common'}));
  const grade=Number(student.grade);
  if(studentKey.startsWith('user_')&&grade>=7&&grade<=9){
    const terms=await Promise.all([1,2,3].map(term=>adminDb.collection('users').doc(student.id).collection('lessonTerms').doc(`${year}_${term}`).collection('records').get()));
    terms.forEach(snapshot=>snapshot.docs.forEach(doc=>{const current=records.get(doc.id)||{};records.set(doc.id,{date:doc.id,...doc.data(),...current,source:current.source||'lessonTerms'})}));
  }
  const makeupOrigins=new Set([...records.values()].filter(item=>status(item.status||item.attendance)==='makeup').map(item=>item.originalDate||item.originalLessonDate).filter(Boolean));
  return [...records.values()].filter(item=>status(item.status||item.attendance)==='absent'&&!item.makeupCompleted&&!item.makeupDate&&!makeupOrigins.has(item.date)).sort((a,b)=>b.date.localeCompare(a.date)).map(item=>({date:item.date,note:String(item.note||item.behaviorNote||'').slice(0,120)}));
}
