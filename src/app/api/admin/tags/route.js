import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const COURSE_TAGS=['spring_course','summer_course','winter_course','past_exam','exam_private','exam_recommendation','exam_general'];
const PRESETS=['垂水中','福田中','模試受験',...COURSE_TAGS];
const normalized=value=>String(value||'').trim().toLocaleLowerCase('ja-JP');
const uniqueTags=values=>values.filter((value,index,all)=>normalized(value)&&all.findIndex(item=>normalized(item)===normalized(value))===index);

export async function GET(request){try{
  await requireAdmin(request);
  const [users,elementary,parents,master]=await Promise.all([adminDb.collection('users').get(),adminDb.collection('adminStudents').get(),adminDb.collection('parentAccounts').get(),adminDb.collection('admin_data').doc('tagMaster').get()]);
  const masterTags=Array.isArray(master.data()?.tags)?master.data().tags:[];
  const students=[...users.docs.map(doc=>{const value=doc.data();return{id:doc.id,name:value.realName||value.displayName||'名前未設定',grade:Number(value.grade)||null,tags:[...(value.tags||[]),...(value.courseTags||[])]}}),...elementary.docs.map(doc=>{const value=doc.data();return{id:`elementary_${doc.id}`,name:value.name||value.realName||'名前未設定',grade:Number(value.grade)||null,tags:value.tags||[]}})].sort((a,b)=>a.name.localeCompare(b.name,'ja'));
  return Response.json({presets:uniqueTags([...PRESETS,...masterTags]),courseTags:COURSE_TAGS,students,parents:parents.docs.map(doc=>({id:doc.id,name:doc.data().displayName||'保護者',tags:doc.data().tags||[]})).sort((a,b)=>a.name.localeCompare(b.name,'ja'))});
}catch(error){return Response.json({error:error.message},{status:error.status||500})}}

export async function POST(request){try{
  const admin=await requireAdmin(request),body=await request.json(),isParent=body.target==='parents',entered=String(body.tag||'').trim().slice(0,40),ids=[...new Set(body.ids||[])].filter(id=>/^[A-Za-z0-9_-]{6,128}$/.test(id)).slice(0,200);
  if(!entered||!ids.length)throw new Error('タグと対象者を選択してください。');
  if(isParent&&COURSE_TAGS.includes(entered))throw new Error('講習・入試タグは生徒だけに設定できます。');
  if(COURSE_TAGS.includes(entered)&&ids.some(id=>id.startsWith('elementary_')))throw new Error('講習・入試タグはアカウント生徒だけに設定できます。');
  const masterRef=adminDb.collection('admin_data').doc('tagMaster'),now=FieldValue.serverTimestamp();
  await adminDb.runTransaction(async transaction=>{
    const master=await transaction.get(masterRef),saved=Array.isArray(master.data()?.tags)?master.data().tags:[],tag=saved.find(value=>normalized(value)===normalized(entered))||entered;
    if(!saved.some(value=>normalized(value)===normalized(tag)))transaction.set(masterRef,{tags:FieldValue.arrayUnion(tag),updatedAt:now,updatedBy:admin.uid},{merge:true});
    const field=!isParent&&COURSE_TAGS.includes(tag)?'courseTags':'tags';
    ids.forEach(id=>{const elementary=!isParent&&id.startsWith('elementary_'),collection=isParent?'parentAccounts':elementary?'adminStudents':'users',docId=elementary?id.slice(11):id;transaction.set(adminDb.collection(collection).doc(docId),{[field]:body.enabled===false?FieldValue.arrayRemove(tag):FieldValue.arrayUnion(tag),updatedBy:admin.uid,updatedAt:now},{merge:true})});
  });
  return Response.json({saved:true,count:ids.length});
}catch(error){return Response.json({error:error.message},{status:error.status||400})}}
