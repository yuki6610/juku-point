import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { buildGachaPool, serializeGachaReward } from "@/lib/gacha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

async function requireAdmin(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new ApiError("ログインしてください。", 401);
  const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
  const admin = await adminDb.collection("admins").doc(decoded.uid).get();
  if (!admin.exists) throw new ApiError("管理者権限がありません。", 403);
  return { uid: decoded.uid, name: admin.data().displayName || decoded.name || "管理者" };
}

const iso = (value) => value?.toDate ? value.toDate().toISOString() : value || null;

export async function GET(request) {
  try {
    await requireAdmin(request);
    const [snapshot, rewardsSnapshot] = await Promise.all([
      adminDb.collection("gachaDraws").orderBy("createdAt", "desc").limit(500).get(),
      adminDb.collection("rewards").get(),
    ]);
    const draws = snapshot.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...data, createdAt: iso(data.createdAt), deliveredAt: iso(data.deliveredAt), canceledAt: iso(data.canceledAt) };
    });
    const active = draws.filter((item) => item.status !== "canceled");
    const japanDate = (value) => new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 10);
    const today = japanDate(new Date());
    return Response.json({
      draws,
      inventory: buildGachaPool(rewardsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))).map(serializeGachaReward),
      summary: {
        today: active.filter((item) => item.createdAt && japanDate(item.createdAt) === today).length,
        pending: active.filter((item) => item.status === "pending").length,
        delivered: active.filter((item) => item.status === "delivered").length,
        pointsUsed: active.reduce((sum, item) => sum + Number(item.pointsUsed || 0), 0),
        mealCount: active.filter((item) => item.rewardKind === "meal").length,
        mealPoints: active.reduce((sum, item) => sum + Number(item.mealPoint || 0), 0),
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("ガチャ管理取得エラー:", error);
    return Response.json({ error: error.message || "抽選結果を取得できませんでした。" }, { status: error.status || 500 });
  }
}

export async function PATCH(request) {
  try {
    const admin = await requireAdmin(request);
    const body = await request.json();
    const drawId = String(body.drawId || "");
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(drawId)) throw new ApiError("抽選結果が正しくありません。");
    if (!['deliver', 'reopen', 'cancel'].includes(body.action)) throw new ApiError("操作が正しくありません。");
    const drawRef = adminDb.collection("gachaDraws").doc(drawId);
    const now = Timestamp.now();

    await adminDb.runTransaction(async (transaction) => {
      const draw = await transaction.get(drawRef);
      if (!draw.exists) throw new ApiError("抽選結果が見つかりません。", 404);
      const data = draw.data();
      if (body.action === "deliver") {
        if (data.status !== "pending") throw new ApiError("この景品は引き渡し待ちではありません。");
        transaction.update(drawRef, {
          status: "delivered", deliveredAt: now, deliveredBy: admin.uid, deliveredByName: admin.name,
          adminNote: String(body.note || "").trim(), updatedAt: now,
          audit: FieldValue.arrayUnion({ action: "deliver", adminUid: admin.uid, at: now }),
        });
        return;
      }
      if (body.action === "reopen") {
        if (data.status !== "delivered") throw new ApiError("引き渡し済みの記録だけ戻せます。");
        transaction.update(drawRef, {
          status: "pending", deliveredAt: FieldValue.delete(), deliveredBy: FieldValue.delete(), deliveredByName: FieldValue.delete(),
          updatedAt: now, audit: FieldValue.arrayUnion({ action: "reopen", adminUid: admin.uid, at: now }),
        });
        return;
      }
      if (!String(body.reason || "").trim()) throw new ApiError("取消理由を入力してください。");
      if (data.status === "canceled") throw new ApiError("すでに取り消されています。");
      const userRef = adminDb.collection("users").doc(data.userId);
      const rewardRef = adminDb.collection("rewards").doc(data.rewardId);
      const [user, reward] = await Promise.all([transaction.get(userRef), transaction.get(rewardRef)]);
      if (!user.exists || !reward.exists) throw new ApiError("生徒または景品が見つからないため取り消せません。", 409);
      transaction.update(userRef, {
        points: Number(user.data().points || 0) + Number(data.pointsUsed || 500),
        ...(Number(data.mealPoint || 0) ? { summerExchangePoint: Math.max(0, Number(user.data().summerExchangePoint || 0) - Number(data.mealPoint || 0)) } : {}),
        updatedAt: now,
      });
      transaction.update(rewardRef, { stock: Number(reward.data().stock || 0) + 1, updatedAt: now });
      transaction.update(drawRef, {
        status: "canceled", cancelReason: String(body.reason).trim(), canceledAt: now, canceledBy: admin.uid,
        canceledByName: admin.name, updatedAt: now,
        audit: FieldValue.arrayUnion({ action: "cancel", adminUid: admin.uid, at: now, reason: String(body.reason).trim() }),
      });
      transaction.set(userRef.collection("pointHistory").doc(), {
        type: "gacha_cancel", description: `ガチャ取消（${data.rewardName}）`, amount: Number(data.pointsUsed || 500),
        affectsEarnedPoints: false, drawId, createdAt: now,
      });
    });
    return Response.json({ ok: true });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("ガチャ管理更新エラー:", error);
    return Response.json({ error: error.message || "更新できませんでした。" }, { status: error.status || 500 });
  }
}
