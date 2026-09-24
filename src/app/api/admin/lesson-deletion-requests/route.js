import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin, requireStaff, assertAssigned, normalizeStudentKey } from '@/lib/staffAccess';
import { POST as deleteAttendance } from '@/app/api/admin/lesson-attendance/route';

export const dynamic = 'force-dynamic';
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const requestRef = (key, date) => adminDb.collection('lessonDeletionRequests').doc(key).collection('items').doc(date);
const studentRef = key => adminDb.collection(key.startsWith('elementary_') ? 'adminStudents' : 'users').doc(key.replace(/^(user|elementary)_/, ''));

export async function GET(request) {
  try {
    const staff = await requireStaff(request);
    const params = new URL(request.url).searchParams;
    const key = params.get('studentKey');
    const date = params.get('date');
    if (key && date) {
      normalizeStudentKey(key);
      if (!validDate(date)) throw new Error('授業日が正しくありません。');
      assertAssigned(staff, key, date);
      const snapshot = await requestRef(key, date).get();
      return Response.json({ request: snapshot.exists ? { status: snapshot.data().status } : null });
    }
    if (staff.role !== 'admin') throw new Error('管理者権限がありません。');
    const groups = await adminDb.collectionGroup('items').get();
    const pending = groups.docs.filter(doc => doc.ref.parent.parent?.parent.id === 'lessonDeletionRequests' && doc.data().status === 'pending');
    const items = await Promise.all(pending.map(async doc => {
      const data = doc.data();
      const profile = await studentRef(data.studentKey).get();
      return { studentKey: data.studentKey, date: data.date, name: profile.data()?.realName || profile.data()?.name || profile.data()?.displayName || '名前未設定', grade: Number(profile.data()?.grade || 0), requestedAt: data.requestedAt?.toDate?.().toISOString() || null };
    }));
    return Response.json({ items: items.sort((a, b) => (a.requestedAt || '').localeCompare(b.requestedAt || '')) });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

export async function POST(request) {
  try {
    const staff = await requireStaff(request);
    const body = await request.json();
    const key = normalizeStudentKey(body.studentKey);
    const date = String(body.date || '');
    if (!validDate(date)) throw new Error('授業日が正しくありません。');
    assertAssigned(staff, key, date);
    const student = await studentRef(key).get();
    if (!student.exists) throw new Error('生徒が見つかりません。');
    const [common, termRecords] = await Promise.all([
      adminDb.collection('adminLessonAttendance').doc(key).collection('records').doc(date).get(),
      student.ref.collection('lessonTerms').get(),
    ]);
    let hasMiddleRecord = false;
    if (Number(student.data().grade) >= 7 && Number(student.data().grade) <= 9) {
      const matches = await Promise.all(termRecords.docs.map(term => term.ref.collection('records').doc(date).get()));
      hasMiddleRecord = matches.some(item => item.exists && item.data().attendance);
    }
    if (!common.data()?.status && !hasMiddleRecord) throw new Error('削除する入力済みの授業記録が見つかりません。');
    const ref = requestRef(key, date);
    await adminDb.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.data()?.status === 'pending' || current.data()?.status === 'processing') throw new Error('すでに削除を申請しています。');
      tx.set(ref, { studentKey: key, date, status: 'pending', requestedBy: staff.uid, requestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    return Response.json({ requested: true });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

export async function PATCH(request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const key = normalizeStudentKey(body.studentKey);
    const date = String(body.date || '');
    if (!validDate(date) || !['approve', 'reject'].includes(body.action)) throw new Error('申請内容が正しくありません。');
    const ref = requestRef(key, date);
    await adminDb.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.data()?.status !== 'pending') throw new Error('承認待ちの削除申請が見つかりません。');
      tx.update(ref, { status: body.action === 'reject' ? 'rejected' : 'processing', handledBy: admin.uid, updatedAt: FieldValue.serverTimestamp() });
    });
    if (body.action === 'approve') {
      try {
        const student = await studentRef(key).get();
        if (!student.exists) throw new Error('生徒が見つかりません。');
        const response = await deleteAttendance(new Request(request.url, { method: 'POST', headers: { authorization: request.headers.get('authorization'), 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', student: { id: student.id, source: key.startsWith('elementary_') ? 'elementary' : 'user', grade: Number(student.data().grade) }, date }) }));
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || '授業記録を削除できませんでした。');
        await ref.update({ status: 'approved', handledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      } catch (error) {
        await ref.update({ status: 'pending', updatedAt: FieldValue.serverTimestamp() });
        throw error;
      }
    }
    return Response.json({ handled: true });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
