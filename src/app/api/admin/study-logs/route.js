import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function requireAdmin(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    throw new ApiError("ログイン情報がありません。", 401);
  }

  const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
  const adminSnap = await adminDb.collection("admins").doc(decoded.uid).get();
  if (!adminSnap.exists) {
    throw new ApiError("管理者権限がありません。", 403);
  }
}

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function GET(request) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      const usersSnap = await adminDb.collection("users").get();
      const students = usersSnap.docs
        .map((snapshot) => {
          const data = snapshot.data();
          return {
            id: snapshot.id,
            name: data.realName || data.displayName || "名前未登録",
            grade: Number(data.grade || 0),
          };
        })
        .filter((student) => student.grade >= 7 && student.grade <= 9)
        .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "ja"));
      return Response.json({ students });
    }

    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
      throw new ApiError("生徒IDが正しくありません。", 400);
    }

    const logsSnap = await adminDb
      .collection("users")
      .doc(uid)
      .collection("checkins")
      .get();

    const logs = logsSnap.docs
      .map((snapshot) => {
        const data = snapshot.data();
        return {
          date: snapshot.id,
          currentSessionActive: Boolean(data.currentSessionActive),
          enterAt: toIso(data.enterAt),
          sessions: Array.isArray(data.sessions)
            ? data.sessions.map((session) => ({
                enterAt: toIso(session.enterAt),
                exitAt: toIso(session.exitAt),
                minutes: Number(session.minutes || 0),
              }))
            : [],
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return Response.json({ logs });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("学習記録APIエラー:", error);
    }
    const status = error instanceof ApiError ? error.status : 500;
    const message =
      error instanceof ApiError ? error.message : "学習記録を取得できませんでした。";
    return Response.json({ error: message }, { status });
  }
}
