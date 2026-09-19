import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(request){
  try{
    const header=request.headers.get('authorization')||'';
    if(!header.startsWith('Bearer '))return Response.json({error:'ログイン情報がありません。'},{status:401});
    const user=await adminAuth.verifyIdToken(header.slice(7),true), body=await request.json(), displayName=String(body.displayName||'').trim();
    if(!user.email||displayName.length<2||displayName.length>80)throw new Error('氏名とメールアドレスを確認してください。');
    const refs=['users','admins','teachers','parentAccounts'].map(name=>adminDb.collection(name).doc(user.uid));
    const existing=await Promise.all(refs.map(ref=>ref.get()));
    if(existing.some(item=>item.exists))throw new Error('このアカウントはすでに別の用途で登録されています。');
    await adminDb.collection('pendingTeachers').doc(user.uid).set({email:user.email,displayName,status:'pending',createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return Response.json({registered:true});
  }catch(error){return Response.json({error:error.message||'講師登録を申請できませんでした。'},{status:error.status||400});}
}
