import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await requireAdmin(request);
    const snapshot = await adminDb.collection('teachers').get();
    return Response.json({ teachers: snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
}

export async function PATCH(request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    if (!body.uid) throw new Error('講師を選択してください。');
    await adminDb.collection('teachers').doc(body.uid).set({ active: body.active !== false, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    try{await adminAuth.updateUser(body.uid, { disabled: body.active===false });}catch{throw new Error('教室側の設定は保存済みですが、ログイン状態の更新に失敗しました。同じ状態でもう一度保存してください。')}
    return Response.json({ saved: true });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
