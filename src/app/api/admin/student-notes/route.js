import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const clean = (value, max = 5000) => String(value || '').trim().slice(0, max);
const keyOk = key => /^(user|elementary)_[A-Za-z0-9_-]{1,128}$/.test(key || '');

export async function GET(request) {
  try {
    await requireAdmin(request);
    const [users, elementary, profiles] = await Promise.all([
      adminDb.collection('users').get(),
      adminDb.collection('adminStudents').get(),
      adminDb.collection('studentProfiles').get(),
    ]);
    const profileMap = Object.fromEntries(profiles.docs.map(item => [item.id, item.data()]));
    const rows = [
      ...users.docs.map(item => ({ key:`user_${item.id}`, source:'user', id:item.id, ...item.data() })),
      ...elementary.docs.map(item => ({ key:`elementary_${item.id}`, source:'elementary', id:item.id, ...item.data() })),
    ].filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn').map(item => ({
      key:item.key, name:item.realName || item.displayName || item.name || '名前未設定', grade:Number(item.grade || 0),
      schoolName:profileMap[item.key]?.schoolName || '', targetSchool:profileMap[item.key]?.targetSchool || '',
      version:Number(profileMap[item.key]?.version||0), memo:profileMap[item.key]?.memo || '', materials:profileMap[item.key]?.materials || '',
      mockExam:profileMap[item.key]?.mockExam || '', courseMaterials:profileMap[item.key]?.courseMaterials || '',
      teacherMemo:profileMap[item.key]?.teacherMemo || '', teacherMemoDate:profileMap[item.key]?.teacherMemoDate || '',
    }));
    return Response.json({ rows });
  } catch (error) { return Response.json({ error:error.message }, { status:error.status || 400 }); }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request), body = await request.json();
    if (!keyOk(body.key)) throw new Error('生徒情報が正しくありません。');
    const data = {
      schoolName:clean(body.schoolName, 120), targetSchool:clean(body.targetSchool, 200), memo:clean(body.memo),
      materials:clean(body.materials, 1000), mockExam:clean(body.mockExam, 500), courseMaterials:clean(body.courseMaterials, 1000),
      updatedBy:admin.uid, updatedAt:FieldValue.serverTimestamp(),
    };
    const ref=adminDb.collection('studentProfiles').doc(body.key);const version=await adminDb.runTransaction(async tx=>{const old=await tx.get(ref);const current=Number(old.data()?.version||0);if(Number(body.version||0)!==current)throw new Error('他の画面でメモが更新されました。入力内容を控え、最新に更新してください。');tx.set(ref,{...data,version:current+1},{merge:true});return current+1;});
    return Response.json({ saved:true,version });
  } catch (error) { return Response.json({ error:error.message }, { status:error.status || 400 }); }
}
