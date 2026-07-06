import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentSeason() {
  const now = new Date();
  const japanNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const month = japanNow.getUTCMonth() + 1;
  const calendarYear = japanNow.getUTCFullYear();
  const year = month <= 3 ? calendarYear - 1 : calendarYear;
  const term = month >= 4 && month <= 8 ? 1 : month >= 9 ? 2 : 3;
  const start =
    term === 1 ? japanMidnight(year, 3, 1) :
    term === 2 ? japanMidnight(year, 8, 1) :
    japanMidnight(year + 1, 0, 1);
  const end =
    term === 1 ? japanMidnight(year, 8, 1) :
    term === 2 ? japanMidnight(year + 1, 0, 1) :
    japanMidnight(year + 1, 3, 1);
  return { id: `${year}_${term}`, start, end };
}

function japanMidnight(year, monthIndex, day) {
  return new Date(Date.UTC(year, monthIndex, day) - 9 * 60 * 60 * 1000);
}

function historyDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value === "number") return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return Response.json({ error: "ログインが必要です。" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const adminSnap = await adminDb.collection("admins").doc(decoded.uid).get();
    if (!adminSnap.exists) {
      return Response.json({ error: "管理者権限が必要です。" }, { status: 403 });
    }

    const season = currentSeason();
    const [usersSnap, adminsSnap] = await Promise.all([
      adminDb.collection("users").get(),
      adminDb.collection("admins").get(),
    ]);
    const adminIds = new Set(adminsSnap.docs.map((item) => item.id));
    const writer = adminDb.bulkWriter();
    let updated = 0;

    for (const userDoc of usersSnap.docs) {
      if (adminIds.has(userDoc.id)) continue;
      const historySnap = await userDoc.ref.collection("pointHistory").get();
      const termPoints = historySnap.docs.reduce((sum, item) => {
        const data = item.data();
        if (data.seasonId && data.seasonId !== season.id) return sum;
        if (!data.seasonId) {
          const date = historyDate(data.createdAt || data.date);
          if (!date || date < season.start || date >= season.end) return sum;
        }
        const amount = Number(data.amount ?? data.point ?? 0);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);
      writer.update(userDoc.ref, {
        termPoints,
        termPointsSeason: season.id,
        termPointsRebuiltAt: new Date(),
      });
      updated += 1;
    }

    await writer.close();
    return Response.json({ updated, seasonId: season.id });
  } catch (error) {
    console.error("学期ポイント再集計エラー:", error);
    return Response.json({ error: "学期ポイントを再集計できませんでした。" }, { status: 500 });
  }
}
