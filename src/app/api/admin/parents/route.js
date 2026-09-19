import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, normalizeStudentKey } from '@/lib/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function studentList() {
  const [users, elementary] = await Promise.all([adminDb.collection('users').get(), adminDb.collection('adminStudents').get()]);
  return [...users.docs.map(doc => ({ key: `user_${doc.id}`, ...doc.data() })), ...elementary.docs.map(doc => ({ key: `elementary_${doc.id}`, ...doc.data() }))]
    .filter(item => item.active !== false && item.enrollmentStatus !== 'withdrawn' && Number(item.grade)>=1 && Number(item.grade)<=9)
    .map(item => ({ key: item.key, name: item.realName || item.name || item.displayName || '名前未設定', grade: Number(item.grade || 0) }))
    .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, 'ja'));
}

async function parentList() {
  const accounts = await adminDb.collection('parentAccounts').get();
  return Promise.all(accounts.docs.map(async doc => ({ uid: doc.id, ...doc.data(), childKeys: (await adminDb.collection('parentLinks').doc(doc.id).collection('children').get()).docs.filter(link => link.data().active !== false).map(link => link.id) })));
}

export async function GET(request) {
  try { await requireAdmin(request); return Response.json({ parents: await parentList(), students: await studentList() }); }
  catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
}

export async function PATCH(request) {
  try {
    const admin = await requireAdmin(request), body = await request.json();
    if (!body.uid) throw new Error('保護者を選択してください。');
    const childKeys = [...new Set((body.childKeys || []).map(normalizeStudentKey))];
    const students = new Set((await studentList()).map(item => item.key));
    if (childKeys.some(key => !students.has(key))) throw new Error('退塾済みまたは存在しない生徒が含まれています。');
    const links = adminDb.collection('parentLinks').doc(body.uid).collection('children');
    const old = await links.get(); const batch = adminDb.batch(); const now = FieldValue.serverTimestamp();
    old.docs.forEach(doc => { if (!childKeys.includes(doc.id)) batch.set(doc.ref, { active: false, updatedBy: admin.uid, updatedAt: now }, { merge: true }); });
    childKeys.forEach(key => batch.set(links.doc(key), { active: true, studentKey: key, updatedBy: admin.uid, updatedAt: now }, { merge: true }));
    const tags=[...new Set((body.tags||[]).map(value=>String(value).trim()).filter(Boolean))].slice(0,30);if(tags.some(value=>value.length>40))throw new Error('タグは40文字以内で入力してください。');
    batch.set(adminDb.collection('parentAccounts').doc(body.uid), { active: body.active !== false, tags, updatedBy: admin.uid, updatedAt: now }, { merge: true });
    await batch.commit(); try{await adminAuth.updateUser(body.uid, { disabled: body.active === false });}catch{throw new Error('子どもの紐付けは保存済みですが、ログイン状態の更新に失敗しました。同じ状態でもう一度保存してください。')}
    return Response.json({ saved: true });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
