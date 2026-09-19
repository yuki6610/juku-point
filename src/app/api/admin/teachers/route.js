import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireAdmin(request);
    const [snapshot,pending] = await Promise.all([adminDb.collection('teachers').get(),adminDb.collection('pendingTeachers').where('status','==','pending').get()]);
    return Response.json({ teachers: snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })), pending:pending.docs.map(doc=>({uid:doc.id,...doc.data()})) });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
}

export async function PATCH(request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(body.uid||'')) throw new Error('講師を選択してください。');
    if(body.action==='approve'){
      const pendingRef=adminDb.collection('pendingTeachers').doc(body.uid),pending=await pendingRef.get();
      if(!pending.exists||pending.data().status!=='pending')throw new Error('承認待ちの申請が見つかりません。');
      const batch=adminDb.batch(),now=FieldValue.serverTimestamp();
      batch.set(adminDb.collection('teachers').doc(body.uid),{email:pending.data().email,displayName:pending.data().displayName,active:true,approvedBy:admin.uid,createdAt:pending.data().createdAt||now,updatedAt:now},{merge:true});
      batch.set(pendingRef,{status:'approved',approvedBy:admin.uid,approvedAt:now,updatedAt:now},{merge:true});
      await batch.commit();await adminAuth.updateUser(body.uid,{disabled:false});return Response.json({saved:true});
    }
    if(body.action==='reject'){
      await adminDb.collection('pendingTeachers').doc(body.uid).set({status:'rejected',rejectedBy:admin.uid,rejectedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()},{merge:true});
      return Response.json({saved:true});
    }
    await adminDb.collection('teachers').doc(body.uid).set({ active: body.active !== false, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    try{await adminAuth.updateUser(body.uid, { disabled: body.active===false });}catch{throw new Error('教室側の設定は保存済みですが、ログイン状態の更新に失敗しました。同じ状態でもう一度保存してください。')}
    return Response.json({ saved: true });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
