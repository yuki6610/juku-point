import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ATTENDANCE_POINT = 100;

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function requireAdmin(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new ApiError("ログイン情報がありません。", 401);
  const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
  const adminSnap = await adminDb.collection("admins").doc(decoded.uid).get();
  if (!adminSnap.exists) throw new ApiError("管理者権限がありません。", 403);
  return decoded.uid;
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
    const adminUid = await requireAdmin(request);
    const body = await request.json();
    const { action = "save", student, date, status: requestedStatus, originalDate, note = "", year, terms = {} } = body;
    const status = normalizeStatus(requestedStatus);
    if (!student?.id || !["user", "elementary"].includes(student.source)) throw new ApiError("生徒情報が正しくありません。", 400);
    if (!validDate(date)) throw new ApiError("授業日が正しくありません。", 400);
    if (action === "save" && !status) throw new ApiError("出欠区分が正しくありません。", 400);
    if (action === "save" && status === "makeup" && !validDate(originalDate)) throw new ApiError("振替元の欠席日を選択してください。", 400);

    const key = student.source === "elementary" ? `elementary_${student.id}` : `user_${student.id}`;
    const records = adminDb.collection("adminLessonAttendance").doc(key).collection("records");
    const commonRef = records.doc(date);
    const userRef = student.source === "user" ? adminDb.collection("users").doc(student.id) : null;
    const isMiddle = student.source === "user" && Number(student.grade) >= 7 && Number(student.grade) <= 9;
    const isHigh = student.source === "user" && Number(student.grade) >= 10 && Number(student.grade) <= 12;
    const termId = termIdForDate(date, terms, Number(year));
    const currentTermId = termIdForDate(todayInJapan(), terms, Number(year));
    const middleRef = isMiddle && termId ? userRef.collection("lessonTerms").doc(termId).collection("records").doc(date) : null;
    const legacyHighRef = isHigh ? userRef.collection("classAttendance").doc(date) : null;
    const historyRef = isHigh ? userRef.collection("pointHistory").doc(`classAttendance_${date}`) : null;

    const result = await adminDb.runTransaction(async (transaction) => {
      const snapshots = await Promise.all([transaction.get(commonRef), ...(userRef ? [transaction.get(userRef)] : []), ...(legacyHighRef ? [transaction.get(legacyHighRef)] : [])]);
      const commonSnap = snapshots[0];
      const userSnap = userRef ? snapshots[1] : null;
      const legacySnap = legacyHighRef ? snapshots[snapshots.length - 1] : null;
      if (userRef && !userSnap.exists) throw new ApiError("生徒が見つかりません。", 404);
      const old = commonSnap.exists ? commonSnap.data() : {};
      const oldStatus = old.status || old.attendance || (!commonSnap.exists && legacySnap?.exists && legacySnap.data().attended ? "present" : null);
      const oldPresent = oldStatus === "present" || Boolean(legacySnap?.exists && legacySnap.data().attended);
      const nextPresent = action === "save" && status === "present";
      const pointDelta = isHigh ? (Number(nextPresent) - Number(oldPresent)) * ATTENDANCE_POINT : 0;
      const now = FieldValue.serverTimestamp();

      if (action === "delete") {
        transaction.delete(commonRef);
        if (middleRef) transaction.set(middleRef, { attendance: FieldValue.delete(), originalLessonDate: FieldValue.delete(), behaviorNote: FieldValue.delete(), updatedBy: adminUid, updatedAt: now }, { merge: true });
        if (legacyHighRef) transaction.delete(legacyHighRef);
      } else {
        transaction.set(commonRef, { date, status, originalDate: status === "makeup" ? originalDate : null, note: String(note).trim(), studentId: student.id, studentSource: student.source, updatedBy: adminUid, updatedAt: now }, { merge: true });
        if (middleRef) transaction.set(middleRef, { date, termId, attendance: status, originalLessonDate: status === "makeup" ? originalDate : FieldValue.delete(), behaviorNote: String(note).trim() || FieldValue.delete(), updatedBy: adminUid, updatedAt: now }, { merge: true });
        if (legacyHighRef) {
          if (nextPresent) transaction.set(legacyHighRef, { attended: true, date, points: ATTENDANCE_POINT, updatedBy: adminUid, updatedAt: now }, { merge: true });
          else transaction.delete(legacyHighRef);
        }
      }

      const oldOriginal = old.originalDate || old.originalLessonDate || null;
      const oldMakeupDate = old.makeupDate || null;
      if (oldStatus === "makeup" && oldOriginal && (action === "delete" || status !== "makeup" || originalDate !== oldOriginal)) {
        transaction.set(records.doc(oldOriginal), { makeupDate: FieldValue.delete(), makeupCompleted: FieldValue.delete(), updatedBy: adminUid, updatedAt: now }, { merge: true });
      }
      if (action === "save" && status === "makeup") transaction.set(records.doc(originalDate), { makeupDate: date, makeupCompleted: true, updatedBy: adminUid, updatedAt: now }, { merge: true });
      if (oldStatus === "absent" && oldMakeupDate && (action === "delete" || status !== "absent")) {
        transaction.delete(records.doc(oldMakeupDate));
        const makeupTermId = termIdForDate(oldMakeupDate, terms, Number(year));
        if (isMiddle && makeupTermId) {
          transaction.set(userRef.collection("lessonTerms").doc(makeupTermId).collection("records").doc(oldMakeupDate), {
            attendance: FieldValue.delete(), originalLessonDate: FieldValue.delete(), behaviorNote: FieldValue.delete(), updatedBy: adminUid, updatedAt: now,
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
    return Response.json({ error: error instanceof ApiError ? error.message : "出欠記録を保存できませんでした。" }, { status: error instanceof ApiError ? error.status : 500 });
  }
}
