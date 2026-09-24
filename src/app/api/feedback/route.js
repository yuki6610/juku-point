import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const runtime='nodejs';
const TYPES=new Set(['display','operation','content','other']);
async function identity(request){
  const token=request.headers.get('authorization')||'';
  if(!token.startsWith('Bearer '))throw Object.assign(new Error('ログインしてください。'),{status:401});
  const decoded=await adminAuth.verifyIdToken(token.slice(7),true),uid=decoded.uid;
  const[admin,parent,user,link]=await Promise.all([adminDb.collection('admins').doc(uid).get(),adminDb.collection('parentAccounts').doc(uid).get(),adminDb.collection('users').doc(uid).get(),adminDb.collection('studentAuthLinks').doc(uid).get()]);
  if(admin.exists)return{uid,role:'admin',name:'管理者'};
  if(parent.exists&&parent.data().active!==false)return{uid,role:'parent',name:parent.data().displayName||'保護者'};
  if(user.exists&&user.data().active!==false)return{uid,role:'student',name:user.data().realName||user.data().displayName||'生徒'};
  if(link.exists&&link.data().studentKey?.startsWith('elementary_')){const linked=await adminDb.collection('adminStudents').doc(link.data().studentId).get();if(linked.exists&&linked.data().active!==false)return{uid,role:'student',name:linked.data().realName||linked.data().name||'生徒'};}
  throw Object.assign(new Error('利用者情報を確認できません。'),{status:403});
}
export async function POST(request){try{const actor=await identity(request),body=await request.json(),type=TYPES.has(body.type)?body.type:'other',message=String(body.message||'').trim().slice(0,2000),page=String(body.page||'').trim().slice(0,300),studentKey=String(body.studentKey||'').trim().slice(0,150);if(!message)throw new Error('不具合の内容を入力してください。');const ref=adminDb.collection('bugReports').doc();await ref.set({type,message,page,studentKey:actor.role==='parent'?studentKey:'',reporterUid:actor.uid,reporterRole:actor.role,reporterName:actor.name,status:'new',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return Response.json({saved:true,id:ref.id});}catch(error){return Response.json({error:error.message},{status:error.status||400})}}
