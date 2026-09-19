import { adminAuth,adminDb } from '@/lib/firebaseAdmin';

export const dynamic='force-dynamic';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date());

export async function GET(request){
  try{
    const token=request.headers.get('authorization')||'';
    if(!token.startsWith('Bearer '))return Response.json({error:'ログインしてください。'},{status:401});
    const user=await adminAuth.verifyIdToken(token.slice(7),true),[student,profile]=await Promise.all([adminDb.collection('users').doc(user.uid).get(),adminDb.collection('studentProfiles').doc(`user_${user.uid}`).get()]);
    if(!student.exists||student.data().active===false||student.data().enrollmentStatus==='withdrawn')return Response.json({error:'生徒情報を確認できません。'},{status:403});
    const from=today(),through=new Date(`${from}T00:00:00+09:00`);through.setDate(through.getDate()+120);const end=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(through);
    const snapshot=await adminDb.collection('parentEvents').where('startDate','<=',end).limit(300).get(),grade=Number(student.data().grade),school=String(profile.data()?.schoolName||student.data().schoolName||''),key=`user_${user.uid}`;
    const targeted=item=>item.targetType==='all'||!item.targetType||item.targetType==='grade'&&String(item.targetValue)===String(grade)||item.targetType==='school'&&String(item.targetValue)===school||item.targetType==='student'&&String(item.targetValue||'').split(',').map(value=>value.trim()).some(value=>value===key||value===user.uid);
    const items=snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).filter(item=>item.showStudent===true&&(item.endDate||item.startDate)>=from&&targeted(item)).sort((a,b)=>a.startDate.localeCompare(b.startDate)).slice(0,8).map(item=>({id:item.id,name:String(item.name||'予定').slice(0,120),type:item.type||'other',startDate:item.startDate,endDate:item.endDate||item.startDate,startTime:item.startTime||'',endTime:item.endTime||''}));
    return Response.json({items});
  }catch(error){return Response.json({error:error.message||'予定を取得できませんでした。'},{status:400})}
}
