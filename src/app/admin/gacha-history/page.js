"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../../firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  orderBy,
  query,
} from "firebase/firestore";

import "./gacha-history.css";

export default function GachaHistoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [groupedLogs, setGroupedLogs] = useState({});
  const [openUid, setOpenUid] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      const adminSnap = await getDoc(doc(db, "admins", user.uid));
      if (!adminSnap.exists()) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      await loadLogs();
      setLoading(false);
    });

    return () => unsub();
  }, [router]);

  // 🎯 ログ取得＆生徒ごとにまとめる
  const loadLogs = async () => {
    const q = query(
      collection(db, "admin_gacha_logs"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);

    const temp = {};

    for (const d of snap.docs) {
      const data = d.data();
      if (!data.uid) continue;

      // 生徒名取得
      let name = "不明";
      const userSnap = await getDoc(doc(db, "users", data.uid));
      if (userSnap.exists()) {
        const u = userSnap.data();
        name = u.realName || u.displayName || "名前未登録";
      }

      if (!temp[data.uid]) {
        temp[data.uid] = {
          uid: data.uid,
          name,
          logs: [],
        };
      }

      temp[data.uid].logs.push({
        id: d.id,
        prizeName: data.prizeName,
        rarity: data.rarity,
        createdAt: data.createdAt?.toDate(),
      });
    }

    setGroupedLogs(temp);
  };

  if (loading) return <div className="gh-loading">読み込み中...</div>;
  if (!isAdmin) return <div className="gh-error">管理者のみ閲覧できます。</div>;

  return (
    <div className="gh-container">
      <h1 className="gh-title">🎰 ガチャ当選履歴（生徒別）</h1>

      {Object.keys(groupedLogs).length === 0 ? (
        <p className="gh-empty">まだ当選履歴がありません。</p>
      ) : (
        <div className="gh-student-list">
          {Object.values(groupedLogs).map((student) => (
            <div key={student.uid} className="gh-student-box">
              <button
                className="gh-student-header"
                onClick={() =>
                  setOpenUid(openUid === student.uid ? null : student.uid)
                }
              >
                <span>{student.name}</span>
                <span className="gh-count">
                  {student.logs.length} 回
                </span>
              </button>

              {openUid === student.uid && (
                <table className="gh-table">
                  <thead>
                    <tr>
                      <th>景品</th>
                      <th>レア</th>
                      <th>日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.logs.map((l) => (
                      <tr
                        key={l.id}
                        className={l.rarity === "ur" ? "gh-ur" : ""}
                      >
                        <td>{l.prizeName}</td>
                        <td>{l.rarity || "-"}</td>
                        <td>
                          {l.createdAt
                            ? l.createdAt.toLocaleString("ja-JP")
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        className="gh-back-btn"
        onClick={() => router.push("/admin")}
      >
        ← 管理ページへ戻る
      </button>
    </div>
  );
}
