import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireHomeworkUser, homeworkRefs } from '@/lib/homeworkServer';
import { publicAssignment } from '@/lib/homeworkModel.mjs';
export const dynamic='force-dynamic';
export async function GET(request){try{
  const uid=await requireHomeworkUser(request),key=`user_${uid}`,after=new URL(request.url).searchParams.get('after');
  const refs=homeworkRefs(key,'check');let cursor=null;
  if(after){const pair=homeworkRefs(key,after);const [a,b]=await Promise.all([pair.privateRef.get(),pair.publicRef.get()]);cursor=a.exists?a:b;if(!cursor.exists)throw new Error('続きを取得できません。');}
  const page=ref=>{let query=ref.parent.orderBy('assignedDate','desc').orderBy(FieldPath.documentId(),'desc').limit(31);if(cursor)query=query.startAfter(cursor.data().assignedDate,after);return query.get()};
  const [published,privateRows,lessons]=await Promise.all([page(refs.publicRef),page(refs.privateRef),adminDb.collection('lessonPublic').doc(key).collection('records').orderBy('date','desc').limit(10).get()]);
  const merged=new Map();for(const row of [...published.docs,...privateRows.docs])merged.set(row.id,{id:row.id,...publicAssignment(row.data())});
  const items=[...merged.values()].sort((a,b)=>b.assignedDate.localeCompare(a.assignedDate)||b.id.localeCompare(a.id));
  return Response.json({items:items.slice(0,30),next:items.length>30?items[29].id:null,comments:lessons.docs.map(doc=>({date:doc.data().date,comments:doc.data().comments||[]}))});
}catch(error){return Response.json({error:'宿題を取得できませんでした。再読み込みしてください。'},{status:400})}}
