import { adminAuth, adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) return Response.json({ eligible: false }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(authorization.slice(7));
    const snapshot = await adminDb.collection("coursePrograms")
      .where("participantIds", "array-contains", decoded.uid).limit(1).get();
    if (snapshot.empty) return Response.json({ eligible: false, pendingCount: 0 });
    const draws = await adminDb.collection("gachaDraws")
      .where("userId", "==", decoded.uid).limit(50).get();
    return Response.json({ eligible: true, pendingCount: draws.docs.filter((doc) => doc.data().status === "pending").length });
  } catch (error) {
    console.error("ガチャ参加判定エラー:", error);
    return Response.json({ eligible: false, pendingCount: 0 }, { status: 500 });
  }
}
