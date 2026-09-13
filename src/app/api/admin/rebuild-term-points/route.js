import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { summarizeTermHistory } from '@/lib/termLedger.mjs';
import { getAcademicTerm } from '@/lib/academicCalendarServer';

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentSeason() {
  const term = await getAcademicTerm();
  return { period:term, id: term.id, start: japanDateFromId(term.start), end: new Date(japanDateFromId(term.end).getTime() + 86400000) };
}
function japanDateFromId(id) {
  const [year, month, day] = id.split("-").map(Number);
  return japanMidnight(year, month - 1, day);
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

    const season = await currentSeason();
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
        const date = typeof data.sourceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.sourceDate)
          ? japanDateFromId(data.sourceDate)
          : historyDate(data.createdAt || data.date);
        if (!date || date < season.start || date >= season.end) return sum;
        if (data.type === "reward" || data.affectsEarnedPoints === false) return sum;
        // Old corrections replaced the original row: they represent zero effective reward.
        if (data.type === "homework_undo") return sum;
        const amount = Number(data.amount ?? data.point ?? 0);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);
      writer.update(userDoc.ref, {
        ...summarizeTermHistory(historySnap.docs.map(item=>item.data()),season.period),
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
