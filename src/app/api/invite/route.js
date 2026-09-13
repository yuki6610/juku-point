import { FieldValue } from 'firebase-admin/firestore';
import crypto from 'node:crypto';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { inviteHash, validInviteId } from '@/lib/accountInvites';

export const runtime='nodejs'; export const dynamic='force-dynamic';
function checked(data,id,secret){if(!validInviteId(id)||!secret||!data)throw new Error('招待情報が正しくありません。');if(data.status!=='pending')throw new Error('この招待は使用済みか取り消されています。');if(data.expiresAt?.toMillis?.()<Date.now())throw new Error('招待の有効期限が切れています。');const supplied=Buffer.from(inviteHash(secret),'hex'),stored=Buffer.from(data.secretHash||'','hex');if(supplied.length!==stored.length||!crypto.timingSafeEqual(supplied,stored))throw new Error('招待コードが正しくありません。');}

export async function POST(request){
  try{const body=await request.json(),ref=adminDb.collection('accountInvites').doc(body.id),snap=await ref.get();const data=snap.data();if(data?.status==='claimed'&&body.action==='claim'){const header=request.headers.get('authorization')||'';if(!header.startsWith('Bearer '))throw new Error('ログインしてください。');const claimant=await adminAuth.verifyIdToken(header.slice(7),true);if(data.claimedBy===claimant.uid&&data.secretHash===inviteHash(body.secret))return Response.json({claimed:true,role:data.role});}checked(data,body.id,body.secret);if(body.action==='preview')return Response.json({role:data.role,displayName:data.displayName,expiresAt:data.expiresAt.toDate().toISOString(),childCount:(data.childKeys||[]).length});
    const authorization=request.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))return Response.json({error:'アカウント登録後に招待を確定してください。'},{status:401});const user=await adminAuth.verifyIdToken(authorization.slice(7),true);if(!user.email)throw new Error('メールアドレスを確認できません。');
    await adminDb.runTransaction(async transaction=>{const current=await transaction.get(ref);checked(current.data(),body.id,body.secret);const invite=current.data(),now=FieldValue.serverTimestamp();const roleRef=adminDb.collection(invite.role==='teacher'?'teachers':'parentAccounts').doc(user.uid);const conflicts=await Promise.all(['users','admins','teachers','parentAccounts'].map(collection=>transaction.get(adminDb.collection(collection).doc(user.uid))));if(conflicts.some(snapshot=>snapshot.exists))throw new Error('このメールアドレスは別のアカウントで使用されています。');transaction.set(roleRef,{email:user.email,displayName:invite.displayName,active:true,createdByInvite:body.id,createdAt:now,updatedAt:now});for(const key of invite.childKeys||[])transaction.set(adminDb.collection('parentLinks').doc(user.uid).collection('children').doc(key),{active:true,studentKey:key,createdByInvite:body.id,createdAt:now,updatedAt:now});transaction.set(ref,{status:'claimed',claimedBy:user.uid,claimedAt:now},{merge:true});});
    return Response.json({claimed:true,role:data.role});
  }catch(error){return Response.json({error:error.message||'招待を処理できませんでした。'},{status:400});}
}
