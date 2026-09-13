import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
export async function GET(request){try{
 const header=request.headers.get('authorization')||'';if(!header.startsWith('Bearer '))return Response.json({error:'ログインしてください。'},{status:401});
 const user=await adminAuth.verifyIdToken(header.slice(7),true);
 const snapshot=await adminDb.collection('users').doc(user.uid).collection('rewardHistory').get();
 return Response.json({items:snapshot.docs.filter(item=>!item.data().date).map(item=>{const data=item.data();return{id:item.id,name:data.name||'景品',rewardId:data.rewardId||null,cost:Number(data.cost||0),verified:data.verified===true,date:data.createdAt?.toDate?.().toISOString()||null}})});
}catch{return Response.json({error:'旧履歴を取得できませんでした。'},{status:400})}}
