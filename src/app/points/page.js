"use client";

import { useEffect, useState } from "react";
import { db } from "../../firebaseConfig";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import "./points.css";

export default function PointHistoryPage() {
  const [grouped, setGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [openDates, setOpenDates] = useState({});

  useEffect(() => {
    const auth = getAuth();

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      const ref = collection(db, `users/${user.uid}/pointHistory`);
      const qd = query(ref, orderBy("createdAt", "desc"));
      const snap = await getDocs(qd);

      const list = snap.docs.map((d) => {
        const data = d.data();

        let createdAt = null;

        if (data.createdAt && typeof data.createdAt.toDate === "function") {
          createdAt = data.createdAt.toDate();
        } else if (data.timestamp && typeof data.timestamp.toDate === "function") {
          createdAt = data.timestamp.toDate();
        } else if (data.createdAt instanceof Date) {
          createdAt = data.createdAt;
        } else if (typeof data.createdAt === "string") {
          createdAt = new Date(data.createdAt);
        } else {
          createdAt = null;
        }

        return { id: d.id, ...data, createdAt };
      });

      setGrouped(groupByDate(list));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const groupByDate = (list) => {
    const groups = {};

    list.forEach((item) => {
      const d = item.createdAt
        ? item.createdAt.toISOString().split("T")[0]
        : "不明";

      if (!groups[d]) groups[d] = [];
      groups[d].push(item);
    });

    return groups;
  };

  const typeLabel = {
    selfstudy: "⏱ 自習",
    wordtest: "✏️ 単語テスト",
    homework: "📘 宿題提出",
    reward: "🎁 景品交換（ポイント消費）",
    undo_homework: "❌ 宿題取消",
    undotest: "❌ 単語テスト取消",
  };

  const toggle = (date) => {
    setOpenDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  return (
    <div className="points-container">
      <h1 className="points-title">💰 ポイント履歴</h1>

      {loading ? (
        <p>読み込み中...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p>まだ履歴がありません。</p>
      ) : (
        Object.keys(grouped).map((date) => {
          const isOpen = openDates[date];

          return (
            <div key={date} className="date-section">
              <div className="date-header" onClick={() => toggle(date)}>
                <h2>{date}</h2>
                <span>{isOpen ? "▲" : "▼"}</span>
              </div>

              {isOpen && (
                <div className="date-body">
                  {grouped[date].map((h) => (
                    <div key={h.id} className="point-item">
                      <div className="point-left">
                        <div className="point-type">
                          {typeLabel[h.type] || "その他"}
                        </div>
                        <div className="point-desc">
                          {h.description || h.note || "(説明なし)"}
                        </div>
                      </div>

                      <div
                        className={
                          "point-amount " + (h.amount >= 0 ? "plus" : "minus")
                        }
                      >
                        {h.amount >= 0 ? `+${h.amount}` : h.amount} pt
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
