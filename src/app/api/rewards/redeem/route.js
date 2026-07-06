import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

class RedeemError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function POST(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      throw new RedeemError("ログイン情報がありません。", 401);
    }

    const token = authorization.slice(7);
    const decodedToken = await adminAuth.verifyIdToken(token);
    const { rewardId } = await request.json();

    if (typeof rewardId !== "string" || !rewardId.trim()) {
      throw new RedeemError("景品が指定されていません。");
    }

    const userRef = adminDb.collection("users").doc(decodedToken.uid);
    const rewardRef = adminDb.collection("rewards").doc(rewardId);

    const result = await adminDb.runTransaction(async (transaction) => {
      const [userSnap, rewardSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(rewardRef),
      ]);

      if (!userSnap.exists) throw new RedeemError("ユーザーが見つかりません。", 404);
      if (!rewardSnap.exists) throw new RedeemError("景品が見つかりません。", 404);

      const userData = userSnap.data();
      const rewardData = rewardSnap.data();
      const currentPoints = Number(userData.points || 0);
      const cost = Number(rewardData.cost || 0);
      const history = Array.isArray(userData.rewardHistory)
        ? userData.rewardHistory
        : [];

      if (!Number.isFinite(cost) || cost < 0) {
        throw new RedeemError("景品データが正しくありません。", 500);
      }
      if (currentPoints < cost) throw new RedeemError("ポイントが足りません。");
      if (rewardData.stock !== undefined && rewardData.stock <= 0) {
        throw new RedeemError("在庫切れです。");
      }
      if (
        rewardData.requiredTag &&
        !(userData.courseTags || []).includes(rewardData.requiredTag)
      ) {
        throw new RedeemError("この景品を交換する権限がありません。", 403);
      }

      const limit = Number(rewardData.limit || 0);
      const usedCount = history.filter((item) =>
        item.rewardId ? item.rewardId === rewardId : item.name === rewardData.name
      ).length;
      if (limit > 0 && usedCount >= limit) {
        throw new RedeemError(`この景品は一人${limit}個までです。`);
      }

      const redeemedAt = Timestamp.now();
      const historyItem = {
        type: "reward",
        rewardId,
        name: rewardData.name,
        cost: -cost,
        date: redeemedAt,
      };
      const userUpdate = {
        points: currentPoints - cost,
        termRewardsCount: FieldValue.increment(1),
        rewardHistory: FieldValue.arrayUnion(historyItem),
        updatedAt: redeemedAt,
      };

      if (rewardData.requiredTag === "summer_course") {
        userUpdate.summerExchangePoint =
          Number(userData.summerExchangePoint || 0) + cost;
      }

      transaction.update(userRef, userUpdate);
      if (rewardData.stock !== undefined) {
        transaction.update(rewardRef, {
          stock: rewardData.stock - 1,
          updatedAt: redeemedAt,
        });
      }

      const historyRef = userRef.collection("pointHistory").doc();
      transaction.set(historyRef, {
        type: "reward",
        rewardId,
        description: `${rewardData.name}と交換`,
        amount: -cost,
        seasonId: getSeasonId(redeemedAt.toDate()),
        createdAt: redeemedAt,
      });

      return {
        points: currentPoints - cost,
        historyItem: {
          ...historyItem,
          date: redeemedAt.toDate().toISOString(),
        },
      };
    });

    return Response.json(result);
  } catch (error) {
    console.error("景品交換APIエラー:", error);
    const status = error instanceof RedeemError ? error.status : 500;
    const message =
      error instanceof RedeemError ? error.message : "景品交換に失敗しました。";
    return Response.json({ error: message }, { status });
  }
}

function getSeasonId(date) {
  const japanDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const month = japanDate.getUTCMonth() + 1;
  const calendarYear = japanDate.getUTCFullYear();
  const dateId = `${calendarYear}-${String(month).padStart(2, "0")}-${String(japanDate.getUTCDate()).padStart(2, "0")}`;
  if (dateId >= "2026-03-30" && dateId <= "2026-09-02") return "2026_1";
  if (dateId >= "2026-09-03" && dateId <= "2026-12-26") return "2026_2";
  if (dateId >= "2026-12-28" && dateId <= "2027-03-27") return "2026_3";
  const year = month <= 3 ? calendarYear - 1 : calendarYear;
  const term = month >= 4 && month <= 8 ? 1 : month >= 9 ? 2 : 3;
  return `${year}_${term}`;
}
