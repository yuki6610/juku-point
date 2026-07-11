"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../firebaseConfig";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import "./points.css";

const PAGE_SIZE = 50;

/* =====================
   ポイント値取得（互換）
===================== */
const getPointValue = (h) => {
  if (typeof h.amount === "number") return h.amount;
  if (typeof h.point === "number") return h.point;
  return 0;
};

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  return null;
};

export default function PointHistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openDates, setOpenDates] = useState({});
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [currentUid, setCurrentUid] = useState("");
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = async (uid, afterDoc = null) => {
    const ref = collection(db, `users/${uid}/pointHistory`);
    const constraints = [orderBy("createdAt", "desc"), limitQuery(PAGE_SIZE)];
    if (afterDoc) constraints.push(startAfter(afterDoc));
    const snap = await getDocs(query(ref, ...constraints));
    const list = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        createdAt: data.sourceDate
          ? toDate(`${data.sourceDate}T12:00:00+09:00`)
          : toDate(data.createdAt),
      };
    });
    return {
      list,
      last: snap.docs.at(-1) || null,
      hasNext: snap.docs.length === PAGE_SIZE,
    };
  };

  useEffect(() => {
    const auth = getAuth();

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setCurrentUid(user.uid);
        const { list, last, hasNext } = await fetchPage(user.uid);
        setItems(list);
        setLastDoc(last);
        setHasMore(hasNext);
        const groups = groupByDate(list);
        const newestDate = Object.keys(groups)[0];
        if (newestDate) setOpenDates({ [newestDate]: true });
      } catch (e) {
        console.error("ポイント履歴の取得に失敗しました:", e);
        setError("ポイント履歴を取得できませんでした。");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const loadMore = async () => {
    if (!currentUid || !lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const { list, last, hasNext } = await fetchPage(currentUid, lastDoc);
      setItems((current) => [...current, ...list]);
      setLastDoc(last);
      setHasMore(hasNext);
    } catch (e) {
      console.error("ポイント履歴の追加取得に失敗しました:", e);
      setError("追加のポイント履歴を取得できませんでした。");
    } finally {
      setLoadingMore(false);
    }
  };

  /* =====================
     日付ごとにグループ化
  ===================== */
  const groupByDate = (list) => {
    const groups = {};

    list.forEach((item) => {
      const key = item.createdAt
        ? new Intl.DateTimeFormat("ja-JP", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(item.createdAt)
        : "日付不明";

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
      classAttendance: "🏫 授業出席",
      wordtest: "✏️ 単語テスト",
      wordtest_undo: "↩ 単語テスト取消",
      homework: "📘 宿題提出",
      homework_missed: "⚠ 宿題未提出",
      reward: "🎁 景品交換",
      undo_homework: "↩ 宿題提出取消",
      homework_undo: "↩ 宿題提出取消",
      adjustment: "⚙ ポイント調整",
    }[h.type] || "📌 その他";
  };

  /* =====================
     説明文
  ===================== */
  const description = (h) => {
    const explicitDescription = h.description || h.note || h.reason;
    if (explicitDescription) return explicitDescription;

    if (h.type === "score") {
      if (h.scoreType === "exam") {
        return "五教科テストの成績が承認されました";
      }
      return "内申点が承認されました";
    }

    if (h.type === "wordtest" || h.type === "wordtest_undo") {
      const result =
        Number.isFinite(h.correct) && Number.isFinite(h.total)
          ? `${h.correct}/${h.total}問正解`
          : "受験記録";
      const week = h.week ? `・${h.week}` : "";
      return h.type === "wordtest_undo"
        ? `単語テスト ${result}${week} のポイント取消`
        : `単語テスト ${result}${week}`;
    }

    return {
      selfstudy: "自習時間に応じて獲得",
      classAttendance: "通常授業への出席",
      homework: "宿題を提出",
      homework_missed: "宿題未提出による減点",
      undo_homework: "宿題提出記録の取消",
      homework_undo: "宿題提出記録の取消",
      reward: "景品との交換に利用",
      adjustment: "管理者によるポイント調整",
    }[h.type] || "ポイントの増減";
  };

  const toggle = (date) => {
    setOpenDates((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const grouped = useMemo(() => groupByDate(items), [items]);
  const allItems = items;
  const earnedTotal = useMemo(
    () => allItems.reduce((sum, item) => sum + Math.max(getPointValue(item), 0), 0),
    [allItems]
  );
  const spentTotal = useMemo(
    () => allItems.reduce((sum, item) => sum + Math.abs(Math.min(getPointValue(item), 0)), 0),
    [allItems]
  );

  return (
    <main className="points-shell">
    <div className="points-container">
      <header className="points-heading">
        <span>POINT ACTIVITY</span>
        <h1 className="points-title">ポイント履歴</h1>
        <p>獲得・利用したポイントを日付ごとに確認できます。</p>
      </header>

      <section className="points-summary" aria-label="ポイント集計">
        <article>
          <span>獲得</span>
          <strong>+{earnedTotal.toLocaleString()}<small>pt</small></strong>
        </article>
        <article>
          <span>利用</span>
          <strong>-{spentTotal.toLocaleString()}<small>pt</small></strong>
        </article>
        <article>
          <span>表示中</span>
          <strong>{allItems.length}<small>件</small></strong>
        </article>
      </section>

      <div className="points-filters" aria-label="履歴の絞り込み">
        {[
          ["all", "すべて"],
          ["earned", "獲得"],
          ["spent", "利用"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : error ? (
        <p className="points-error" role="alert">{error}</p>
      ) : Object.keys(grouped).length === 0 ? (
        <p>まだ履歴がありません。</p>
      ) : (
        Object.keys(grouped).map((date) => {
          const isOpen = openDates[date];
          const visibleItems = grouped[date].filter((item) => {
            const point = getPointValue(item);
            if (filter === "earned") return point >= 0;
            if (filter === "spent") return point < 0;
            return true;
          });
          if (visibleItems.length === 0) return null;

          return (
            <div key={date} className="date-section">
              <button className="date-header" onClick={() => toggle(date)}>
                <h2>{date}</h2>
                <span>{isOpen ? "▲" : "▼"}</span>
              </button>

              {isOpen && (
                <div className="date-body">
                  {visibleItems.map((h) => {
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
      {!loading && hasMore && (
        <button type="button" className="points-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "読み込み中..." : "もっと見る"}
        </button>
      )}
    </div>
    </main>
  );
}
