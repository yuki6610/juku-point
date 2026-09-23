import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';

export const dynamic='force-dynamic';
const validKey=value=>/^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(value||'');
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'');

export async function GET(request){
  try{
    await requireAdmin(request);
    // `status` の collection-group index が無効でも動作するよう、対象コレクションを
    // 読んだ後にサーバー側で pending のみへ絞り込む。
    const groups=await adminDb.collectionGroup('items').get();
    const rows=groups.docs
      .filter(doc=>doc.ref.parent.parent?.parent.id==='lessonReportSubmissions'&&doc.data().status==='pending')
      .slice(0,100);
    const keys=[...new Set(rows.map(doc=>doc.data().studentKey).filter(validKey))];
    const profiles=await Promise.all(keys.map(async key=>{
      const elementary=key.startsWith('elementary_'),id=key.replace(/^(user|elementary)_/,'');
      const snap=await adminDb.collection(elementary?'adminStudents':'users').doc(id).get();
      return[key,snap.data()?.realName||snap.data()?.name||snap.data()?.displayName||'名前未設定'];
    }));
    const names=Object.fromEntries(profiles);
    const items=rows.map(doc=>({id:doc.id,...doc.data(),name:names[doc.data().studentKey]||'名前未設定',submittedAt:doc.data().submittedAt?.toDate?.().toISOString()||null})).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return Response.json({items});
  }catch(error){return Response.json({error:error.message},{status:error.status||400});}
}

export async function PATCH(request){
  try{
    const admin=await requireAdmin(request),body=await request.json(),studentKey=String(body.studentKey||''),date=String(body.date||''),text=String(body.text||'').trim().slice(0,2000);
    if(!validKey(studentKey)||!validDate(date)||!text)throw new Error('承認する授業報告を確認してください。');
    const submission=adminDb.collection('lessonReportSubmissions').doc(studentKey).collection('items').doc(date),publicRef=adminDb.collection('lessonPublic').doc(studentKey).collection('records').doc(date);
    await adminDb.runTransaction(async tx=>{
      const current=await tx.get(submission);if(!current.exists||current.data().status!=='pending')throw new Error('未承認の授業報告が見つかりません。');
      const now=FieldValue.serverTimestamp();
      tx.set(publicRef,{lessonReport:{version:3,text,source:'approved_lesson_report'},updatedAt:now},{merge:true});
      tx.set(submission,{text,status:'approved',approvedBy:admin.uid,approvedAt:now,updatedAt:now},{merge:true});
    });
    return Response.json({approved:true});
  }catch(error){return Response.json({error:error.message},{status:error.status||400});}
}
