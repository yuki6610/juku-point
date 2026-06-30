import {
  collection,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebaseConfig";

export async function resetSeason(currentSeason, lastResetSeason) {
  const batch = writeBatch(db);

  // -------------------------
  // 全ユーザー取得
  // -------------------------
  const snap = await getDocs(collection(db, "users"));
  let users = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  // -------------------------
  // 管理者除外
  // -------------------------
  const admins = await getDocs(collection(db, "admins"));
  const adminIds = new Set(admins.docs.map((d) => d.id));

  users = users.filter((u) => !adminIds.has(u.id));

    // -------------------------
    // hallOfFame保存データ作成
    // -------------------------

    const makeTop3 = (list, getValue) =>
      [...list]
        .sort((a, b) => getValue(b) - getValue(a))
        .slice(0, 3)
        .map((u, index) => ({
          rank: index + 1,
          uid: u.id,
          displayName: u.displayName ?? "",
          points: getValue(u),
          level: u.level ?? 1,
        }));

    const hallRef = doc(db, "hallOfFame", lastResetSeason);

    batch.set(hallRef, {
      season: lastResetSeason,

      points: {
        top3: makeTop3(users, (u) => u.termPoints ?? 0),
      },

      studyHours: {
        top3: makeTop3(users, (u) => u.termStudyMinutes ?? 0),
      },

      wordTotal: {
        top3: makeTop3(users, (u) => u.termWordScore ?? 0),
      },

      selfStudyCount: {
        top3: makeTop3(users, (u) => u.termSelfStudyCount ?? 0),
      },

      homeworkCount: {
        top3: makeTop3(users, (u) => u.termHomeworkCount ?? 0),
      },

      rewardsCount: {
        top3: makeTop3(
          users,
          (u) => Array.isArray(u.rewardHistory)
            ? u.rewardHistory.length
            : 0
        ),
      },

      createdAt: serverTimestamp(),
    });

  // -------------------------
  // 学期データリセット
  // -------------------------
  users.forEach((u) => {
    batch.update(doc(db, "users", u.id), {
      termPoints: 0,

      termHomeworkCount: 0,

      termWordScore: 0,

      termWordTestCount: 0,

      termSelfStudyCount: 0,

      termStudyMinutes: 0,
    });
  });

  // -------------------------
  // 学期更新
  // -------------------------
  batch.update(doc(db, "admin_data", "season"), {
    lastResetSeason: currentSeason.id,
    updatedAt: serverTimestamp(),
  });

  // -------------------------
  // 実行
  // -------------------------
  await batch.commit();
}
