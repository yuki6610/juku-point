import { randomInt } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { buildGachaPool, GACHA_COST, serializeGachaReward } from "@/lib/gacha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class GachaError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

async function currentUser(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new GachaError("ログインしてください。", 401);
  return adminAuth.verifyIdToken(authorization.slice(7));
}

async function participation(uid) {
  const snapshot = await adminDb.collection("coursePrograms").where("participantIds", "array-contains", uid).limit(1).get();
  return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function adminAccess(uid) {
  const snapshot = await adminDb.collection("admins").doc(uid).get();
  return snapshot.exists;
}

function iso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return new Date(value).toISOString();
}

async function stateFor(uid) {
  const [user, program, isAdmin, rewards, history] = await Promise.all([
    adminDb.collection("users").doc(uid).get(),
    participation(uid),
    adminAccess(uid),
    adminDb.collection("rewards").get(),
    adminDb.collection("gachaDraws").where("userId", "==", uid).limit(50).get(),
  ]);
  if (!user.exists) throw new GachaError("ユーザーが見つかりません。", 404);
  const pool = buildGachaPool(rewards.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  const histories = history.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
    .slice(0, 50)
    .map((item) => ({ ...item, createdAt: iso(item.createdAt), deliveredAt: iso(item.deliveredAt), canceledAt: iso(item.canceledAt) }));
  return {
    eligible: isAdmin || (Boolean(program) && Number(user.data().grade) === 9),
    adminPreview: isAdmin,
    program: program ? { id: program.id, name: program.name || "講習" } : isAdmin ? { id: "admin-preview", name: "管理者確認" } : null,
    points: Number(user.data().points || 0),
    cost: GACHA_COST,
    rewards: pool.map(serializeGachaReward),
    history: histories,
    pendingCount: histories.filter((item) => item.status === "pending").length,
  };
}

export async function GET(request) {
  try {
    const decoded = await currentUser(request);
    return Response.json(await stateFor(decoded.uid));
  } catch (error) {
    if (!(error instanceof GachaError)) console.error("ガチャ取得エラー:", error);
    return Response.json({ error: error.message || "ガチャ情報を取得できませんでした。" }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  try {
    const decoded = await currentUser(request);
    const [registeredProgram, isAdmin, userForEligibility] = await Promise.all([
      participation(decoded.uid),
      adminAccess(decoded.uid),
      adminDb.collection("users").doc(decoded.uid).get(),
    ]);
    const isEligibleStudent = registeredProgram && Number(userForEligibility.data()?.grade) === 9;
    if (!isEligibleStudent && !isAdmin) throw new GachaError("中3の講習参加者限定のガチャです。", 403);
    const program = registeredProgram || { id: "admin-preview", name: "管理者確認" };
    const rewardSnapshot = await adminDb.collection("rewards").get();
    const pool = buildGachaPool(rewardSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    if (!pool.length) throw new GachaError("現在抽選できる景品がありません。", 409);

    const ticketTotal = pool.reduce((sum, item) => sum + Math.round(item.probability * 100), 0);
    let ticket = randomInt(ticketTotal);
    let selected = pool[pool.length - 1];
    for (const item of pool) {
      ticket -= Math.round(item.probability * 100);
      if (ticket < 0) { selected = item; break; }
    }

    const userRef = adminDb.collection("users").doc(decoded.uid);
    const rewardRef = adminDb.collection("rewards").doc(selected.id);
    const drawRef = adminDb.collection("gachaDraws").doc();
    const now = Timestamp.now();
    const result = await adminDb.runTransaction(async (transaction) => {
      const [user, reward] = await Promise.all([transaction.get(userRef), transaction.get(rewardRef)]);
      if (!user.exists || !reward.exists) throw new GachaError("抽選データが見つかりません。", 404);
      const points = Number(user.data().points || 0);
      const stock = Number(reward.data().stock || 0);
      if (points < GACHA_COST) throw new GachaError("ポイントが足りません。");
      if (stock <= 0) throw new GachaError("選ばれた景品が在庫切れになりました。もう一度お試しください。", 409);

      const isMeal = selected.kind === "meal";
      const mealPoint = isMeal ? Number(reward.data().cost || 0) : 0;
      transaction.update(userRef, {
        points: points - GACHA_COST,
        ...(isMeal ? { summerExchangePoint: Number(user.data().summerExchangePoint || 0) + mealPoint } : {}),
        updatedAt: now,
      });
      transaction.update(rewardRef, { stock: stock - 1, updatedAt: now });
      transaction.set(drawRef, {
        userId: decoded.uid,
        userName: user.data().displayName || user.data().realName || "未登録",
        grade: Number(user.data().grade || 0),
        programId: program.id,
        programName: program.name || "講習",
        rewardId: selected.id,
        rewardName: reward.data().name || selected.name,
        rewardImage: reward.data().image || "",
        rewardKind: selected.kind,
        rewardValue: Number(reward.data().cost || 0),
        probability: selected.probability,
        pointsUsed: GACHA_COST,
        mealPoint,
        status: "pending",
        createdAt: now,
      });
      transaction.set(userRef.collection("pointHistory").doc(), {
        type: "gacha", description: `ガチャ（${reward.data().name || selected.name}）`, amount: -GACHA_COST,
        affectsEarnedPoints: false, drawId: drawRef.id, createdAt: now,
      });
      return { drawId: drawRef.id, points: points - GACHA_COST, mealPoint };
    });
    return Response.json({ ...result, reward: serializeGachaReward(selected), createdAt: now.toDate().toISOString() });
  } catch (error) {
    if (!(error instanceof GachaError)) console.error("ガチャ抽選エラー:", error);
    return Response.json({ error: error.message || "抽選できませんでした。" }, { status: error.status || 500 });
  }
}
