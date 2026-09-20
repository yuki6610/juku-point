import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
export const runtime='nodejs';export const dynamic='force-dynamic';
const STATES=new Set(['new','checked','working','done']);
const json=doc=>({id:doc.id,...doc.data(),createdAt:doc.data().createdAt?.toDate?.().toISOString()||null,updatedAt:doc.data().updatedAt?.toDate?.().toISOString()||null});
export async function GET(request){try{await requireAdmin(request);const snapshot=await adminDb.collection('bugReports').orderBy('createdAt','desc').limit(200).get();return Response.json({items:snapshot.docs.map(json)});}catch(error){return Response.json({error:error.message},{status:error.status||500})}}
export async function PATCH(request){try{const admin=await requireAdmin(request),body=await request.json(),status=STATES.has(body.status)?body.status:null;if(!/^[A-Za-z0-9_-]{6,128}$/.test(body.id||'')||!status)throw new Error('更新内容を確認してください。');await adminDb.collection('bugReports').doc(body.id).set({status,adminNote:String(body.adminNote||'').trim().slice(0,2000),updatedBy:admin.uid,updatedAt:FieldValue.serverTimestamp()},{merge:true});return Response.json({saved:true});}catch(error){return Response.json({error:error.message},{status:error.status||400})}}
