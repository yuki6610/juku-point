import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function requireAdmin(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new ApiError("ログイン情報がありません。", 401);
  const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
  const admin = await adminDb.collection("admins").doc(decoded.uid).get();
  if (!admin.exists) throw new ApiError("管理者権限がありません。", 403);
  return decoded.uid;
}

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "");
const validId = (value) => /^[A-Za-z0-9_-]{6,128}$/.test(value || "");

export async function GET(request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get("programId");
    if (!programId) {
      const snapshot = await adminDb.collection("coursePrograms").orderBy("startDate", "desc").get();
      return Response.json({ programs: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) });
    }
    if (!validId(programId)) throw new ApiError("講習IDが正しくありません。");
    const snapshot = await adminDb.collection("coursePrograms").doc(programId)
      .collection("assignments").orderBy("assignedDate", "desc").get();
    return Response.json({ assignments: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("講習課題取得APIエラー:", error);
    return Response.json({ error: error.message || "データを取得できませんでした。" }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const adminUid = await requireAdmin(request);
    const body = await request.json();
    if (body.action === "createProgram") {
      const { name, startDate, endDate } = body;
      if (!String(name || "").trim() || !validDate(startDate) || !validDate(endDate) || endDate < startDate) {
        throw new ApiError("講習名と期間を確認してください。");
      }
      const reference = await adminDb.collection("coursePrograms").add({
        name: String(name).trim(), startDate, endDate, purpose: "assignmentManagement",
        createdBy: adminUid, updatedBy: adminUid,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      return Response.json({ id: reference.id });
    }
    if (body.action === "createAssignment") {
      const { programId, assignment } = body;
      if (!validId(programId) || !validId(assignment?.uid) || !validDate(assignment?.assignedDate)) {
        throw new ApiError("生徒または指示日が正しくありません。");
      }
      if (!["homework", "wordTest"].includes(assignment.type) || !String(assignment.range || "").trim()) {
        throw new ApiError("課題の種類と範囲を確認してください。");
      }
      const programRef = adminDb.collection("coursePrograms").doc(programId);
      const [program, student] = await Promise.all([
        programRef.get(), adminDb.collection("users").doc(assignment.uid).get(),
      ]);
      if (!program.exists) throw new ApiError("講習が見つかりません。", 404);
      if (!student.exists || Number(student.data().grade) < 7 || Number(student.data().grade) > 9) {
        throw new ApiError("対象の中学生が見つかりません。", 404);
      }
      if (assignment.assignedDate < program.data().startDate || assignment.assignedDate > program.data().endDate) {
        throw new ApiError("指示日は講習期間内で指定してください。");
      }
      const reference = await programRef.collection("assignments").add({
        ...assignment, range: String(assignment.range).trim(), note: String(assignment.note || "").trim(),
        status: "assigned", createdBy: adminUid, updatedBy: adminUid,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      return Response.json({ id: reference.id });
    }
    throw new ApiError("操作が正しくありません。");
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("講習課題保存APIエラー:", error);
    return Response.json({ error: error.message || "保存できませんでした。" }, { status: error.status || 500 });
  }
}

export async function PATCH(request) {
  try {
    const adminUid = await requireAdmin(request);
    const { programId, assignmentId, result, checkedDate } = await request.json();
    if (!validId(programId) || !validId(assignmentId) || !validDate(checkedDate)) throw new ApiError("対象データが正しくありません。");
    const reference = adminDb.collection("coursePrograms").doc(programId).collection("assignments").doc(assignmentId);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new ApiError("課題が見つかりません。", 404);
    if (snapshot.data().type === "wordTest") {
      const correct = Number(result?.wordCorrect);
      const total = Number(result?.wordTotal);
      if (!Number.isFinite(correct) || !Number.isFinite(total) || correct < 0 || total <= 0 || correct > total) throw new ApiError("単語テストの点数が正しくありません。");
    }
    await reference.set({ status: "checked", checkedDate, result, updatedBy: adminUid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ ok: true });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("講習課題更新APIエラー:", error);
    return Response.json({ error: error.message || "更新できませんでした。" }, { status: error.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get("programId");
    const assignmentId = searchParams.get("assignmentId");
    if (!validId(programId) || !validId(assignmentId)) throw new ApiError("対象データが正しくありません。");
    await adminDb.collection("coursePrograms").doc(programId).collection("assignments").doc(assignmentId).delete();
    return Response.json({ ok: true });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("講習課題削除APIエラー:", error);
    return Response.json({ error: error.message || "削除できませんでした。" }, { status: error.status || 500 });
  }
}
