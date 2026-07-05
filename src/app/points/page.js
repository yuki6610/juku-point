"use client";

import { useEffect, useState } from "react";
import { db } from "../../firebaseConfig";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import "./points.css";

/* =====================
   ポイント値取得（互換）
===================== */
const getPointValue = (h) => {
  if (typeof h.amount === "number") return h.amount;
  if (typeof h.point === "number") return h.point;
  return 0;
};

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

      const list = snap.docs
        .map((d) => {
          const data = d.data();
          const createdAt =
            data.createdAt?.toDate?.() ??
            (data.createdAt instanceof Date ? data.createdAt : null);

          return {
            id: d.id,
            ...data,
            createdAt,
          };
        })
        // 念のため最終ソート（createdAt がズレても安全）
        .sort((a, b) => {
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt - a.createdAt;
        });

      setGrouped(groupByDate(list));
      setLoading(false);
    });

    return () => unsub();
  }, []);

  /* =====================
     日付ごとにグループ化
  ===================== */
  const groupByDate = (list) => {
    const groups = {};

    list.forEach((item) => {
      const key = item.createdAt
        ? item.createdAt.toISOString().split("T")[0]
        : "不明";

      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return groups;
  };

  /* =====================
     種類ラベル
  ===================== */
  const typeLabel = (h) => {
    if (h.type === "score") {
      return h.scoreType === "exam"
        ? "📝 五教科テスト"
        : "📊 内申点";
    }

    return {
      selfstudy: "⏱ 自習",
      wordtest: "✏️ 単語テスト",
      homework: "📘 宿題提出",
      reward: "🎁 景品交換",
      undo_homework: "❌ 宿題取消",
      undotest: "❌ 単語テスト取消",
    }[h.type] || "その他";
  };

  /* =====================
     説明文
  ===================== */
  const description = (h) => {
    if (h.type === "score") {
      if (h.scoreType === "exam") {
        return `テスト成績承認（${h.point}pt）`;
      }
      return `内申点承認（${h.point}pt）`;
    }

    return h.description || h.note || "(説明なし)";
  };

  const toggle = (date) => {
    setOpenDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  return (
    <main className="points-shell">
    <div className="points-container">
      <header className="points-heading">
        <span>POINT ACTIVITY</span>
        <h1 className="points-title">ポイント履歴</h1>
        <p>獲得・利用したポイントを日付ごとに確認できます。</p>
      </header>

      {loading ? (
        <p>読み込み中...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p>まだ履歴がありません。</p>
      ) : (
        Object.keys(grouped).map((date) => {
          const isOpen = openDates[date];

          return (
            <div key={date} className="date-section">
              <button className="date-header" onClick={() => toggle(date)}>
                <h2>{date}</h2>
                <span>{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="date-body">
                  {grouped[date].map((h) => {
                    const point = getPointValue(h);

                    return (
                      <div key={h.id} className="point-item">
                        <div className="point-left">
                          <div className="point-type">
                            {typeLabel(h)}
                          </div>
                          <div className="point-desc">
                            {description(h)}
                          </div>
                        </div>

                        <div
                          className={
                            "point-amount " + (point >= 0 ? "plus" : "minus")
                          }
                        >
                          {point >= 0 ? `+${point}` : point} pt
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
    </main>
  );
}
