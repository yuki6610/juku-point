"use client";

import { useState, useEffect } from "react";
import { db } from "../../../firebaseConfig";
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  collection,
} from "firebase/firestore";
import "./selfstudy.css";

export default function SelfStudyList() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  const getTodayId = () => new Date().toISOString().slice(0, 10);

  useEffect(() => {
    loadSelfStudyStudents();
  }, []);

  async function loadSelfStudyStudents() {
    const todayId = getTodayId();
    const usersSnap = await getDocs(collection(db, "users"));
    const list = [];

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data();

      const checkSnap = await getDoc(
        doc(db, `users/${uid}/checkins/${todayId}`)
      );

      if (!checkSnap.exists()) continue;
      const c = checkSnap.data();

      // ⭐ 新方式：currentSessionActive=true なら今まさに自習中
      if (c.currentSessionActive === true) {
        const enterAt = c.enterAt || c.lastEnterAt;
        if (!enterAt) continue;

        const enterTimeText = new Date(enterAt).toLocaleTimeString("ja-JP", {
          hour: "2-digit",
          minute: "2-digit",
        });

        list.push({
          uid,
          name: userData.realName || userData.displayName || "名前未登録",
          grade: userData.grade ?? "ー",
          enterTime: enterTimeText,
        });
      }
    }

    setStudents(list);
    setLoading(false);
  }

  // ⭐ 強制退出（このままでOK）
  async function forceExit(uid) {
    const todayId = getTodayId();
    const ref = doc(db, `users/${uid}/checkins/${todayId}`);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      alert("入室記録がありません");
      return;
    }

    const data = snap.data();
    const now = Date.now();

    const sessions = Array.isArray(data.sessions) ? [...data.sessions] : [];

    // ⭐ 強制退出は「exitAt のない最終セッションを強制終了」
    sessions.push({
      enterAt: data.enterAt || data.lastEnterAt,
      exitAt: now,
      forced: true,
      minutes: Math.floor((now - (data.enterAt || data.lastEnterAt)) / 60000),
    });

    await updateDoc(ref, {
      currentSessionActive: false,
      sessions,
    });

    alert("強制退出しました");
    loadSelfStudyStudents();
  }

  if (loading)
    return <div className="ss-loading">読み込み中…</div>;

  return (
    <div className="ss-container">
      <h1 className="ss-title">📚 自習中の生徒一覧</h1>

      {students.length === 0 ? (
        <p className="ss-empty">現在自習している生徒はいません。</p>
      ) : (
        <table className="ss-table">
          <thead>
            <tr>
              <th>名前</th>
              <th>学年</th>
              <th>入室時刻</th>
              <th>強制退出</th>
            </tr>
          </thead>

          <tbody>
            {students.map((s) => (
              <tr key={s.uid}>
                <td>{s.name}</td>
                <td>{s.grade}</td>
                <td>{s.enterTime}</td>
                <td>
                  <button
                    className="ss-exit-btn"
                    onClick={() => forceExit(s.uid)}
                  >
                    強制退出
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button className="ss-refresh-btn" onClick={loadSelfStudyStudents}>
        🔄 更新
      </button>
    </div>
  );
}
