import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FIELDS = [
  "displayName",
  "grade",
  "level",
  "termPoints",
  "points",
  "termStudyMinutes",
  "totalStudyMinutes",
  "termWordScore",
  "totalWordTestScore",
  "termSelfStudyCount",
  "selfStudyCount",
  "termHomeworkCount",
  "homeworkCount",
];

export async function GET(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return Response.json({ error: "ログインが必要です。" }, { status: 401 });
    }
    await adminAuth.verifyIdToken(authorization.slice(7));

    const { searchParams } = new URL(request.url);
    const previousSeason = searchParams.get("previousSeason") || "";
    if (previousSeason && !/^\d{4}_\d$/.test(previousSeason)) {
      return Response.json({ error: "学期情報が正しくありません。" }, { status: 400 });
    }

    const [usersSnap, adminsSnap, hallSnap] = await Promise.all([
      adminDb.collection("users").get(),
      adminDb.collection("admins").get(),
      previousSeason
        ? adminDb.collection("hallOfFame").doc(previousSeason).get()
        : Promise.resolve(null),
    ]);
    const adminIds = new Set(adminsSnap.docs.map((snapshot) => snapshot.id));
    const users = usersSnap.docs
      .filter((snapshot) => !adminIds.has(snapshot.id))
      .map((snapshot) => {
        const source = snapshot.data();
        const user = { id: snapshot.id };
        for (const field of PUBLIC_FIELDS) user[field] = source[field] ?? null;
        user.rewardCount = Array.isArray(source.rewardHistory)
          ? source.rewardHistory.length
          : 0;
        return user;
      });

    return Response.json({
      users,
      hallOfFame: hallSnap?.exists ? hallSnap.data() : null,
    });
  } catch (error) {
    console.error("ランキングAPIエラー:", error);
    const code =
      error?.code === "auth/id-token-expired"
        ? "TOKEN_EXPIRED"
        : error?.code === "auth/argument-error"
          ? "INVALID_TOKEN"
          : "RANKING_BACKEND_ERROR";
    const status = code === "RANKING_BACKEND_ERROR" ? 503 : 401;
    return Response.json(
      {
        error:
          status === 401
            ? "ログイン情報の有効期限が切れました。再ログインしてください。"
            : "ランキングAPIに接続できませんでした。",
        code,
      },
      { status },
    );
  }
}
