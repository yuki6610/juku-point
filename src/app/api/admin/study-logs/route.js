import { datedHistoryPage } from "@/lib/datedHistoryServer";
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from "@/lib/firebaseAdmin";
import { studentRef } from '@/lib/studentIdentity';

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
    if (searchParams.get('current') === '1') {
      const active = await adminDb.collectionGroup('checkins').where('currentSessionActive', '==', true).get();
      const rows = await Promise.all(active.docs.map(async snapshot => {
        const uid = snapshot.ref.parent.parent?.id;
        if (!uid) return null;
        try {
          const key = snapshot.ref.parent.parent.parent.id === 'adminStudents' ? `elementary_${uid}` : `user_${uid}`;
          const profile = await studentRef(key).get();
          if (!profile.exists || profile.data().active === false || profile.data().enrollmentStatus === 'withdrawn') return null;
          const data = snapshot.data();
          return { uid:key.startsWith('elementary_')?key:uid, date:snapshot.id, name:profile.data().realName||profile.data().name||profile.data().displayName||data.userName||'名前未登録', grade:Number(profile.data().grade||data.grade||0), enterAt:toIso(data.enterAt||data.lastEnterAt) };
        } catch { return null; }
      }));
      return Response.json({ students: rows.filter(Boolean).sort((a,b)=>String(a.enterAt||'').localeCompare(String(b.enterAt||''))) });
    }

    if (!uid) {
      const [usersSnap, elementarySnap] = await Promise.all([adminDb.collection('users').get(),adminDb.collection('adminStudents').get()]);
      const students = [...usersSnap.docs.map(snapshot=>({snapshot,id:snapshot.id})),...elementarySnap.docs.map(snapshot=>({snapshot,id:`elementary_${snapshot.id}`}))]
        .map(({snapshot,id}) => {
          const data = snapshot.data();
          return {
            id,
            name: data.realName || data.name || data.displayName || "名前未登録",
            grade: Number(data.grade || 0),
          };
        })
        .filter((student) => student.grade >= 7 && student.grade <= 12)
        .sort((a, b) => a.grade - b.grade || a.name.localeCompare(b.name, "ja"));
      return Response.json({ students });
    }

    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
      throw new ApiError("生徒IDが正しくありません。", 400);
    }

    const before=searchParams.get('before');if(before&&!/^\d{4}-\d{2}-\d{2}$/.test(before))throw new ApiError('取得位置を確認してください。',400);
    const ref=studentRef(uid.startsWith('elementary_')?uid:`user_${uid}`).collection('checkins');
    const logsSnap=await datedHistoryPage(ref,before);

    const logs = logsSnap.docs.slice(0,50)
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

    return Response.json({ logs,next:logsSnap.next });
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

export async function POST(request) {
  try {
    await requireAdmin(request);
    const { action, uid, date } = await request.json();
    if (action !== 'force-exit' || !/^[A-Za-z0-9_-]{6,128}$/.test(uid||'') || !/^\d{4}-\d{2}-\d{2}$/.test(date||'')) throw new ApiError('操作内容が正しくありません。',400);
    const ref=studentRef(uid.startsWith('elementary_')?uid:`user_${uid}`).collection('checkins').doc(date);
    await adminDb.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists||snap.data().currentSessionActive!==true)throw new ApiError('すでに退出済みか、入室記録がありません。',409);const data=snap.data(),now=Date.now(),enterAt=Number(data.lastEnterAt||data.enterAt||0);tx.update(ref,{currentSessionActive:false,exitAt:now,sessions:[...(Array.isArray(data.sessions)?data.sessions:[]),{enterAt,exitAt:now,forced:true,minutes:0}],updatedAt:FieldValue.serverTimestamp()});});
    return Response.json({saved:true});
  } catch(error) { return Response.json({error:error.message||'強制退出できませんでした。'},{status:error.status||500}); }
}
