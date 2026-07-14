import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return Response.json({ error: "ログインが必要です。" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));

    const [userSnap, eventSnap, usersSnap, adminsSnap] = await Promise.all([
      adminDb.collection("users").doc(decoded.uid).get(),
      adminDb.collection("admin_data").doc("summerEvent").get(),
      adminDb.collection("users").where("courseTags", "array-contains", "summer_course").get(),
      adminDb.collection("admins").get(),
    ]);

    if (!userSnap.exists) {
      return Response.json({ error: "生徒情報を確認できませんでした。" }, { status: 404 });
    }
    if (!(userSnap.data().courseTags || []).includes("summer_course")) {
      return Response.json({ error: "夏期イベントの対象外です。" }, { status: 403 });
    }

    const adminIds = new Set(adminsSnap.docs.map((item) => item.id));
    const ranking = usersSnap.docs
      .filter((item) => {
        const data = item.data();
        return !adminIds.has(item.id) && data.isAdmin !== true && data.role !== "admin";
      })
      .map((item) => {
        const data = item.data();
        return {
          uid: item.id,
          name: data.realName || data.displayName || "名前なし",
          point: Number(data.summerExchangePoint || 0),
        };
      })
      .sort((a, b) => b.point - a.point || a.name.localeCompare(b.name, "ja"));

    const event = eventSnap.exists ? eventSnap.data() : {};
    return Response.json({
      ranking,
      yenPerPoint: event.yenPerPoint ?? 0.3,
      endDate: event.endDate ?? "2026-08-22",
    });
  } catch (error) {
    console.error("夏期イベントAPIエラー:", error);
    return Response.json(
      { error: "夏期イベントを読み込めませんでした。" },
      { status: error?.code?.startsWith("auth/") ? 401 : 503 },
    );
  }
}
