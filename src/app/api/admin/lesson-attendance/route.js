import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebaseAdmin";
import { requireStaff, assertAssigned } from '@/lib/staffAccess';
import { readAcademicSettings } from '@/lib/academicCalendarServer';
import { resolveAcademicTerm, japanDateId } from '@/lib/academicCalendar.mjs';
import { learningFields } from '@/lib/lessonStudents.mjs';
import { homeworkTemplates, prepareHomeworkReview } from '@/lib/homeworkServer';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ATTENDANCE_POINT = 100;

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const normalizeStatus = (value) => ["present", "absent", "makeup"].includes(value) ? value : null;
function termIdForDate(date, terms, year) {
  for (const term of [1, 2, 3]) {
    const setting = terms?.[term] || terms?.[String(term)];
    if (setting?.start && setting?.end && date >= setting.start && date <= setting.end) return `${year}_${term}`;
  }
  return null;
}

function todayInJapan() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function POST(request) {
  try {
    const staff = await requireStaff(request);
    const adminUid = staff.uid;
    const body = await request.json();
    const templates = body.homeworkReview || Array.isArray(body.commentIds) ? await homeworkTemplates() : null;
    const { action = "save", student, date, status: requestedStatus, originalDate, note = "" } = body;
    const settings = await readAcademicSettings();
    let selectedTerm;
    let currentTerm;
    try {
      selectedTerm = resolveAcademicTerm(settings, date);
      currentTerm = resolveAcademicTerm(settings, japanDateId());
    } catch (error) { throw new ApiError(error.message, 400); }
    const year = selectedTerm.year;
    const terms = settings.find(item => Number(item.year) === year)?.terms || {};
    const status = normalizeStatus(requestedStatus);
    let learningRecord;
    if (body.learningRecord !== undefined) {
      try { learningRecord = learningFields(body.learningRecord); } catch (error) { throw new ApiError(error.message, 400); }
      if (status === 'absent') learningRecord = { ...learningRecord, homework: 'notEvaluated', late: false, forgot: false, wordTest: { status: 'pending', correct: null, total: null } };
    }
    if (!student?.id || !["user", "elementary"].includes(student.source)) throw new ApiError("生徒情報が正しくありません。", 400);
    if (!validDate(date)) throw new ApiError("授業日が正しくありません。", 400);
    if (!['save', 'delete'].includes(action)) throw new ApiError('操作が正しくありません。', 400);
    if (status === 'makeup' && originalDate === date) throw new ApiError('振替元と授業日は別の日を指定してください。', 400);
    if (action === "save" && !status) throw new ApiError("出欠区分が正しくありません。", 400);
    if (action === "save" && status === "makeup" && !validDate(originalDate)) throw new ApiError("振替元の欠席日を選択してください。", 400);

    const key = student.source === "elementary" ? `elementary_${student.id}` : `user_${student.id}`;
    assertAssigned(staff, key, date);
    if (staff.role === 'teacher' && action === 'delete') throw new ApiError('削除は管理者に依頼してください。', 403);
    const records = adminDb.collection("adminLessonAttendance").doc(key).collection("records");
    const commonRef = records.doc(date);
    const userRef = student.source === "user" ? adminDb.collection("users").doc(student.id) : null;
    const isMiddle = student.source === "user" && Number(student.grade) >= 7 && Number(student.grade) <= 9;
    const isHigh = student.source === "user" && Number(student.grade) >= 10 && Number(student.grade) <= 12;
    const termId = termIdForDate(date, terms, Number(year));
    const currentTermId = currentTerm.id;
    const middleRef = isMiddle && termId ? userRef.collection("lessonTerms").doc(termId).collection("records").doc(date) : null;
    const legacyHighRef = isHigh ? userRef.collection("classAttendance").doc(date) : null;
    const historyRef = isHigh ? userRef.collection("pointHistory").doc(`classAttendance_${date}`) : null;

    const result = await adminDb.runTransaction(async (transaction) => {
      const snapshots = await Promise.all([transaction.get(commonRef), ...(userRef ? [transaction.get(userRef)] : []), ...(legacyHighRef ? [transaction.get(legacyHighRef)] : [])]);
      const commonSnap = snapshots[0];
      const userSnap = userRef ? snapshots[1] : null;
      const legacySnap = legacyHighRef ? snapshots[snapshots.length - 1] : null;
      if (userRef && !userSnap.exists) throw new ApiError("生徒が見つかりません。", 404);
      const studentSnap = userSnap || await transaction.get(adminDb.collection('adminStudents').doc(student.id));
      if (!studentSnap.exists) throw new ApiError('生徒が見つかりません。', 404);
      const studentData = studentSnap.data();
      const grade = Number(studentData.grade);
      if (!Number.isInteger(grade) || (student.source === 'elementary' ? grade < 1 || grade > 6 : grade < 7 || grade > 12)) throw new ApiError('学年・生徒区分を確認してください。', 400);
      if (Number(studentData.grade) !== Number(student.grade)) throw new ApiError('学年が変更されています。画面を再読み込みしてください。', 409);
      if (learningRecord && (isMiddle || studentData.active === false || studentData.enrollmentStatus === 'withdrawn')) throw new ApiError('対象生徒の登録状態を確認してください。', 409);
      const middleSnap = middleRef ? await transaction.get(middleRef) : null;
      const old = commonSnap.exists ? commonSnap.data() : middleSnap?.data() || {};
      const oldStatus = old.status || old.attendance || (!commonSnap.exists && legacySnap?.exists && legacySnap.data().attended ? "present" : null);
      const oldPresent = oldStatus === "present" || Boolean(legacySnap?.exists && legacySnap.data().attended);
      const nextPresent = action === "save" && status === "present";
      const pointDelta = isHigh ? (Number(nextPresent) - Number(oldPresent)) * ATTENDANCE_POINT : 0;
      const now = FieldValue.serverTimestamp();
      const oldOriginal = old.originalDate || old.originalLessonDate || null;
      const oldMakeupDate = old.makeupDate || null;
      const linkedMakeup = oldMakeupDate ? await transaction.get(records.doc(oldMakeupDate)) : null;
      const originalSnap = oldOriginal ? await transaction.get(records.doc(oldOriginal)) : null;
      const requestedOriginal = action === 'save' && status === 'makeup' ? await transaction.get(records.doc(originalDate)) : null;
      const requestedOriginalTerm = requestedOriginal ? termIdForDate(originalDate, terms, Number(year)) : null;
      const originalLesson = requestedOriginal && !requestedOriginal.exists && isMiddle && requestedOriginalTerm
        ? await transaction.get(userRef.collection('lessonTerms').doc(requestedOriginalTerm).collection('records').doc(originalDate)) : null;
      if (requestedOriginal) {
        const originalData = requestedOriginal.exists ? requestedOriginal.data() : originalLesson?.data();
        if (!['absent', '欠席'].includes(originalData?.status || originalData?.attendance)) {
          throw new ApiError('振替元の欠席記録が見つかりません。欠席日を確認してください。', 409);
        }
      }
      if (requestedOriginal?.exists && requestedOriginal.data().makeupDate && requestedOriginal.data().makeupDate !== date) {
        throw new ApiError('この欠席には別の振替が登録されています。先に既存の記録を確認してください。', 409);
      }

      let publication = null;
      if (learningRecord && templates) {
        if (old.learningRecord?.homeworkReview?.assignmentId && old.learningRecord.homeworkReview.assignmentId !== body.homeworkReview?.assignmentId) throw new ApiError('この日の確認対象の宿題セットは変更できません。元のセットを選択してください。', 409);
        try { publication = await prepareHomeworkReview(transaction, { key, date, termId, uid: adminUid, review: body.homeworkReview, comments: body.commentIds, attendance: status, learningRecord, templates }); }
        catch (error) { throw new ApiError(error.message, 400); }
        learningRecord = { ...learningRecord, homeworkReview: body.homeworkReview || null, commentIds: body.commentIds || [], ...(publication.homework ? { homework: publication.homework } : {}) };
      }
      publication?.commit();
      if (action === "delete") {
        // Keep a dated cancellation marker so older copies cannot resurrect attendance.
        transaction.set(commonRef, { date, status: null, attendance: null, originalDate: null, originalLessonDate: null, makeupDate: null, makeupCompleted: false, updatedBy: adminUid, updatedAt: now }, { merge: true });
        if (middleRef) transaction.set(middleRef, { attendance: null, originalLessonDate: null, updatedBy: adminUid, updatedAt: now }, { merge: true });
        if (legacyHighRef) transaction.delete(legacyHighRef);
      } else {
        transaction.set(adminDb.collection('dailyLessonInputs').doc(date).collection('students').doc(key),{ studentKey:key,date,grade,updatedBy:adminUid,updatedAt:now },{ merge:true });
        if (learningRecord) transaction.set(commonRef, { learningRecord: { ...learningRecord, date, termId, createdBy: old.learningRecord?.createdBy || adminUid, createdAt: old.learningRecord?.createdAt || now, updatedBy: adminUid, updatedAt: now } }, { merge: true });
        transaction.set(commonRef, { date, status, attendance: null, originalLessonDate: null, originalDate: status === "makeup" ? originalDate : null, ...(status !== 'absent' ? { makeupDate: null, makeupCompleted: false } : {}), note: String(note).trim(), studentId: student.id, studentSource: student.source, updatedBy: adminUid, updatedAt: now }, { merge: true });
        if (middleRef) transaction.set(middleRef, { date, termId, attendance: status, originalLessonDate: status === "makeup" ? originalDate : FieldValue.delete(), behaviorNote: String(note).trim() || FieldValue.delete(), updatedBy: adminUid, updatedAt: now }, { merge: true });
        if (legacyHighRef) {
          if (nextPresent) transaction.set(legacyHighRef, { attended: true, date, points: ATTENDANCE_POINT, updatedBy: adminUid, updatedAt: now }, { merge: true });
          else transaction.delete(legacyHighRef);
        }
      }

      if (oldStatus === "makeup" && oldOriginal && originalSnap?.data()?.makeupDate === date && (action === "delete" || status !== "makeup" || originalDate !== oldOriginal)) {
        transaction.set(records.doc(oldOriginal), { makeupDate: null, makeupCompleted: false, updatedBy: adminUid, updatedAt: now }, { merge: true });
      }
      if (action === "save" && status === "makeup") transaction.set(records.doc(originalDate), { date: originalDate, status: 'absent', makeupDate: date, makeupCompleted: true, updatedBy: adminUid, updatedAt: now }, { merge: true });
      if (oldStatus === "absent" && oldMakeupDate && (action === "delete" || status !== "absent")) {
        if (linkedMakeup?.exists) transaction.set(records.doc(oldMakeupDate), { originalDate: null, originalLessonDate: null, updatedBy: adminUid, updatedAt: now }, { merge: true });
        const makeupTermId = termIdForDate(oldMakeupDate, terms, Number(year));
        if (isMiddle && makeupTermId) {
          transaction.set(userRef.collection("lessonTerms").doc(makeupTermId).collection("records").doc(oldMakeupDate), {
            originalLessonDate: null, updatedBy: adminUid, updatedAt: now,
          }, { merge: true });
        }
      }

      if (isHigh && pointDelta) {
        const data = userSnap.data();
        transaction.update(userRef, { points: Math.max(0, Number(data.points || 0) + pointDelta), ...(termId && termId === currentTermId ? { termPoints: Math.max(0, Number(data.termPoints || 0) + pointDelta) } : {}), totalEarnedPoints: Math.max(0, Number(data.totalEarnedPoints || 0) + pointDelta), classAttendanceCount: Math.max(0, Number(data.classAttendanceCount || 0) + pointDelta / ATTENDANCE_POINT), lastUpdated: now });
      }
      if (isHigh) {
        if (nextPresent) transaction.set(historyRef, { type: "classAttendance", amount: ATTENDANCE_POINT, note: `授業出席 (${date})`, sourceDate: date, termId, createdAt: Timestamp.fromDate(new Date(`${date}T12:00:00+09:00`)), recordedAt: now, updatedBy: adminUid }, { merge: true });
        else transaction.delete(historyRef);
      }
      return { pointDelta };
    });
    return Response.json(result);
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("出欠保存APIエラー:", error);
    return Response.json({ error: error.message || "出欠記録を保存できませんでした。" }, { status: error.status || (error instanceof ApiError ? error.status : 500) });
  }
}
