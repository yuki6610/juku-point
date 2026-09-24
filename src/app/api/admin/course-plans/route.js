import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';
import { SHIFT_PERIODS, shiftWeekStart, validShiftDate } from '@/lib/weeklyShifts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const validId = value => /^[A-Za-z0-9_-]{6,160}$/.test(value || '');
const validStudent = value => /^(user|elementary)_[A-Za-z0-9_-]{6,128}$/.test(value || '');
const collection = () => adminDb.collection('courseLessonPlans');

export async function GET(request) {
  try {
    await requireAdmin(request);
    const programId = new URL(request.url).searchParams.get('programId');
    if (!validId(programId)) throw new Error('講習を選択してください。');
    const [plans, teachers] = await Promise.all([collection().where('programId', '==', programId).get(), adminDb.collection('teachers').get()]);
    return Response.json({ plans: plans.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)), teachers: teachers.docs.filter(doc => doc.data().active !== false).map(doc => ({ uid: doc.id, name: doc.data().displayName || doc.data().email || doc.id })) });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request), body = await request.json(), now = FieldValue.serverTimestamp();
    if (!validId(body.programId)) throw new Error('講習を選択してください。');
    const program = await adminDb.collection('coursePrograms').doc(body.programId).get();
    if (!program.exists) throw new Error('講習が見つかりません。');
    if (body.action === 'confirmCount') {
      if (!validStudent(body.studentKey) || !Number.isInteger(Number(body.lessons)) || Number(body.lessons) < 1 || Number(body.lessons) > 100) throw new Error('生徒とコマ数を確認してください。');
      const ref = adminDb.collection('courseApplications').doc(`${body.programId}_${body.studentKey}`), application = await ref.get();
      if (!application.exists || application.data().status === 'cancelled') throw new Error('有効な申込がありません。');
      const planned = await collection().where('studentKey', '==', body.studentKey).get();
      if (planned.docs.filter(doc => doc.data().programId === body.programId).length > Number(body.lessons)) throw new Error('すでに配置した日程より少ない回数にはできません。');
      await ref.set({ confirmedLessons: Number(body.lessons), countConfirmedAt: now, countConfirmedBy: admin.uid, updatedAt: now }, { merge: true });
      return Response.json({ saved: true });
    }
    if (body.action === 'savePlan') {
      if (!validStudent(body.studentKey) || !validShiftDate(body.date) || new Date(`${body.date}T12:00:00+09:00`).getUTCDay() === 0 || !SHIFT_PERIODS.some(item => item.startTime === body.startTime && item.endTime === body.endTime)) throw new Error('生徒・日付・時間帯を確認してください。日曜日は休校です。');
      if (body.teacherUid && !validId(body.teacherUid)) throw new Error('担当講師を確認してください。');
      if (body.date < program.data().startDate || body.date > program.data().endDate) throw new Error('講習期間内の日付を指定してください。');
      const [application, availability, otherPlans, teacher, shift] = await Promise.all([adminDb.collection('courseApplications').doc(`${body.programId}_${body.studentKey}`).get(), adminDb.collection('courseAvailability').doc(`${body.programId}_${body.studentKey}`).get(), collection().where('studentKey', '==', body.studentKey).get(), body.teacherUid ? adminDb.collection('teachers').doc(body.teacherUid).get() : Promise.resolve(null), adminDb.collection('weeklyShifts').doc(shiftWeekStart(body.date)).get()]);
      if (!application.exists || application.data().status === 'cancelled' || !application.data().countConfirmedAt) throw new Error('先に受講コマ数を確定してください。');
      if (body.teacherUid && (!teacher?.exists || teacher.data().active === false)) throw new Error('担当講師を確認してください。');
      const unavailable = (availability.data()?.entries || []).some(item => item.date === body.date && body.startTime < item.endTime && body.endTime > item.startTime);
      if (unavailable) throw new Error('保護者が来校不可に設定した時間です。');
      const docId = validId(body.id) ? body.id : crypto.randomUUID();
      const others = otherPlans.docs.filter(doc => doc.id !== docId);
      if (others.filter(doc => doc.data().programId === body.programId).length >= Number(application.data().confirmedLessons)) throw new Error('確定した受講コマ数を超えます。');
      if (others.some(doc => doc.data().date === body.date)) throw new Error('同じ生徒を同日に複数配置できません。');
      if (shift.exists && shift.data().status === 'confirmed' && (shift.data().entries || []).some(item => item.studentKey === body.studentKey && item.date === body.date)) throw new Error('確定シフトで同じ生徒の授業がある日です。先にシフトを調整してください。');
      if (!String(body.subject || '').trim()) throw new Error('教科を選択してください。');
      const ref = collection().doc(docId), old = await ref.get();
      if (old.exists && (old.data().programId !== body.programId || old.data().studentKey !== body.studentKey)) throw new Error('別の講習日程は上書きできません。');
      if (old.exists && old.data().status === 'confirmed') throw new Error('確定済みの日程は変更できません。削除して作り直してください。');
      await ref.set({ programId: body.programId, studentKey: body.studentKey, date: body.date, startTime: body.startTime, endTime: body.endTime, subject: String(body.subject || '').trim().slice(0, 40), subjectCode: String(body.subjectCode || '').trim().slice(0, 40), teacherUid: String(body.teacherUid || ''), status: 'draft', createdAt: old.data()?.createdAt || now, createdBy: old.data()?.createdBy || admin.uid, updatedAt: now, updatedBy: admin.uid });
      return Response.json({ saved: true, id: docId });
    }
    if (body.action === 'confirmPlan') {
      if (!validId(body.id)) throw new Error('日程を確認してください。');
      const ref = collection().doc(body.id), plan = await ref.get();
      if (!plan.exists || plan.data().programId !== body.programId || plan.data().status !== 'draft' || !plan.data().teacherUid) throw new Error('未確定の日程と担当講師を確認してください。');
      const row = plan.data();
      if (!validShiftDate(row.date) || row.date < program.data().startDate || row.date > program.data().endDate || !SHIFT_PERIODS.some(item => item.startTime === row.startTime && item.endTime === row.endTime)) throw new Error('講習日程と時間帯を確認してください。');
      const [teacher, application, availability, otherPlans, shift] = await Promise.all([
        adminDb.collection('teachers').doc(row.teacherUid).get(),
        adminDb.collection('courseApplications').doc(`${body.programId}_${row.studentKey}`).get(),
        adminDb.collection('courseAvailability').doc(`${body.programId}_${row.studentKey}`).get(),
        collection().where('studentKey', '==', row.studentKey).get(),
        adminDb.collection('weeklyShifts').doc(shiftWeekStart(row.date)).get(),
      ]);
      if (!teacher.exists || teacher.data().active === false) throw new Error('担当講師を確認してください。');
      if (!application.exists || application.data().status === 'cancelled' || !application.data().countConfirmedAt) throw new Error('有効な申込と確定コマ数を確認してください。');
      if ((availability.data()?.entries || []).some(item => item.date === row.date && row.startTime < item.endTime && row.endTime > item.startTime)) throw new Error('保護者が来校不可に設定した時間です。');
      const others = otherPlans.docs.filter(doc => doc.id !== body.id);
      if (others.some(doc => doc.data().date === row.date) || others.filter(doc => doc.data().programId === body.programId).length >= Number(application.data().confirmedLessons)) throw new Error('同じ日の授業または確定コマ数を確認してください。');
      if (shift.exists && shift.data().status === 'confirmed' && (shift.data().entries || []).some(item => item.studentKey === row.studentKey && item.date === row.date)) throw new Error('確定シフトに同じ生徒の授業があります。');
      await ref.set({ status: 'confirmed', confirmedAt: now, confirmedBy: admin.uid, updatedAt: now }, { merge: true });
      return Response.json({ saved: true });
    }
    if (body.action === 'deletePlan') {
      if (!validId(body.id)) throw new Error('日程を確認してください。');
      const ref = collection().doc(body.id), plan = await ref.get();
      if (!plan.exists || plan.data().programId !== body.programId) throw new Error('日程が見つかりません。');
      const week = await adminDb.collection('weeklyShifts').doc(shiftWeekStart(plan.data().date)).get();
      const imported = week.exists && (week.data().entries || []).some(item => item.sourceId === body.id);
      const batch = adminDb.batch();
      if (imported) batch.set(week.ref, { entries: (week.data().entries || []).filter(item => item.sourceId !== body.id), updatedBy: admin.uid, updatedAt: now }, { merge: true });
      batch.delete(ref);
      await batch.commit();
      return Response.json({ deleted: true });
    }
    throw new Error('操作が正しくありません。');
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
