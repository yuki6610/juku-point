import crypto from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, normalizeStudentKey } from '@/lib/staffAccess';
import { inviteHash, newInviteSecret, validInviteRole } from '@/lib/accountInvites';

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

async function activeStudents() {
  const [users, elementary] = await Promise.all([adminDb.collection('users').get(), adminDb.collection('adminStudents').get()]);
  return new Set([...users.docs.map(doc=>({key:`user_${doc.id}`,...doc.data()})),...elementary.docs.map(doc=>({key:`elementary_${doc.id}`,...doc.data()}))].filter(item=>item.active!==false&&item.enrollmentStatus!=='withdrawn').map(item=>item.key));
}

export async function POST(request) {
  try {
    const admin=await requireAdmin(request), body=await request.json(), role=body.role, displayName=String(body.displayName||'').trim();
    if(!validInviteRole(role)||!displayName) throw new Error('招待の種類と氏名を確認してください。');
    const childKeys=role==='parent'?[...new Set((body.childKeys||[]).map(normalizeStudentKey))]:[];
    if(role==='parent'&&!childKeys.length) throw new Error('保護者に紐付ける生徒を1人以上選択してください。');
    const students=await activeStudents(); if(childKeys.some(key=>!students.has(key))) throw new Error('退塾済みまたは存在しない生徒が含まれています。');
    const id=crypto.randomUUID().replaceAll('-',''),secret=newInviteSecret(),now=new Date(),expires=new Date(now.getTime()+7*86400000);
    await adminDb.collection('accountInvites').doc(id).set({role,displayName,childKeys,secretHash:inviteHash(secret),status:'pending',expiresAt:Timestamp.fromDate(expires),createdBy:admin.uid,createdAt:FieldValue.serverTimestamp()});
    const origin=new URL(request.url).origin;
    return Response.json({invite:{id,role,displayName,expiresAt:expires.toISOString(),url:`${origin}/invite/${id}#${secret}`}});
  } catch(error){return Response.json({error:error.message},{status:error.status||400});}
}

export async function DELETE(request) {
  try { const admin=await requireAdmin(request),id=new URL(request.url).searchParams.get('id'); if(!/^[A-Za-z0-9_-]{16,80}$/.test(id||''))throw new Error('招待IDが正しくありません。'); const ref=adminDb.collection('accountInvites').doc(id),snap=await ref.get(); if(!snap.exists||snap.data().status!=='pending')throw new Error('有効な招待が見つかりません。'); await ref.set({status:'revoked',revokedBy:admin.uid,revokedAt:FieldValue.serverTimestamp()},{merge:true}); return Response.json({revoked:true}); } catch(error){return Response.json({error:error.message},{status:error.status||400});}
}
