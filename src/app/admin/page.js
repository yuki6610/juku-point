"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { getCurrentSeason } from "../utils/season";
import { resetSeason } from "../utils/resetSeason";
import "./admin.css";

const menuGroups = [
  {
    id: "daily",
    eyebrow: "DAILY WORK",
    title: "毎日の入力・確認",
    description: "授業日に最もよく使う機能です。",
    items: [
      {
        title: "学習記録",
        desc: "宿題・単語テスト・出欠・生活態度をまとめて入力",
        icon: "✓",
        path: "/admin/lesson-records",
        tone: "violet",
        featured: true,
      },
      {
        title: "自習中の生徒",
        desc: "現在の入室状況と強制退出",
        icon: "◷",
        path: "/admin/qr",
        tone: "cyan",
      },
      {
        title: "自習履歴",
        desc: "生徒ごとの入退室・学習時間",
        icon: "≡",
        path: "/admin/study-log",
        tone: "blue",
      },
      {
        title: "高校生の出席",
        desc: "通常授業の出席確認とポイント付与",
        icon: "○",
        path: "/admin/attend",
        tone: "orange",
      },
    ],
  },
  {
    id: "students",
    eyebrow: "STUDENTS & SCORES",
    title: "生徒・成績",
    description: "生徒情報、成績、志望校判定を管理します。",
    items: [
      {
        title: "授業・振替管理",
        desc: "小中学生の欠席、振替、授業回数を照合",
        icon: "▦",
        path: "/admin/lesson-attendance",
        tone: "violet",
      },
      {
        title: "生徒管理",
        desc: "学年・コース・ポイント・レベル",
        icon: "◎",
        path: "/admin/students",
        tone: "indigo",
      },
      {
        title: "小学生登録",
        desc: "アカウントを持たない小学生を登録",
        icon: "＋",
        path: "/admin/elementary-students",
        tone: "sky",
      },
      {
        title: "志望校判定",
        desc: "成績と高校の基準点を比較",
        icon: "△",
        path: "/admin/judge",
        tone: "green",
      },
      {
        title: "成績確認・入力",
        desc: "生徒が入力した成績の確認と管理者側からの記録",
        icon: "+",
        path: "/admin/score",
        tone: "sky",
      },
    ],
  },
  {
    id: "rewards",
    eyebrow: "POINTS & OPERATIONS",
    title: "ポイント・運用",
    description: "景品とアプリ運用に関する管理です。",
    items: [
      {
        title: "景品管理",
        desc: "景品・必要ポイント・在庫を設定",
        icon: "◇",
        path: "/admin/rewards",
        tone: "mint",
      },
      {
        title: "景品交換履歴",
        desc: "生徒ごとの交換状況を確認",
        icon: "↺",
        path: "/admin/rewardHistory",
        tone: "amber",
      },
      {
        title: "不正検知",
        desc: "位置情報と不正な入退室記録",
        icon: "!",
        path: "/admin/illegal",
        tone: "red",
      },
      {
        title: "大学情報取込",
        desc: "大学・入試情報のデータ更新",
        icon: "U",
        path: "/admin/import-universities",
        tone: "slate",
      },
    ],
  },
];

export default function AdminPage() {
  const router = useRouter();
  const [switchingSeason, setSwitchingSeason] = useState(false);
  const [rebuildingPoints, setRebuildingPoints] = useState(false);
  const currentSeason = getCurrentSeason();
  const termLabel = `${currentSeason.year}年度 ${currentSeason.term}学期`;

  const startNewSeason = async () => {
    if (switchingSeason) return;
    if (
      !window.confirm(
        "新学期を開始しますか？\n今学期のランキングを保存し、学期集計をリセットします。この操作は元に戻せません。",
      )
    ) {
      return;
    }

    setSwitchingSeason(true);
    try {
      const seasonRef = doc(db, "admin_data", "season");
      const seasonSnap = await getDoc(seasonRef);

      if (!seasonSnap.exists()) {
        window.alert("学期設定データがありません。");
        return;
      }

      const lastResetSeason = seasonSnap.data().lastResetSeason;
      if (currentSeason.id === lastResetSeason) {
        window.alert("現在の学期はすでに開始済みです。");
        return;
      }

      await resetSeason(currentSeason, lastResetSeason);
      window.alert("新学期へ切り替えました。");
    } catch (error) {
      console.error("学期切替に失敗しました:", error);
      window.alert("学期切替に失敗しました。");
    } finally {
      setSwitchingSeason(false);
    }
  };

  const rebuildTermPoints = async () => {
    if (rebuildingPoints) return;
    if (!window.confirm("2026年度1学期の学期ポイントを累計ポイントへ同期しますか？")) return;
    setRebuildingPoints(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("/api/admin/rebuild-term-points", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "APIで再集計できませんでした。");
      window.alert(`${result.updated}人分の学期ポイントを再集計しました。`);
    } catch (error) {
      try {
        const [usersSnapshot, adminsSnapshot] = await Promise.all([
          getDocs(collection(db, "users")),
          getDocs(collection(db, "admins")),
        ]);
        const adminIds = new Set(adminsSnapshot.docs.map((item) => item.id));
        const batch = writeBatch(db);
        let updated = 0;
        usersSnapshot.docs.forEach((item) => {
          if (adminIds.has(item.id)) return;
          batch.update(item.ref, {
            totalEarnedPoints: Math.max(0, Number(item.data().termPoints || 0)),
            termPointsSeason: "2026_1",
            termPointsRebuiltAt: serverTimestamp(),
          });
          updated += 1;
        });
        await batch.commit();
        window.alert(`${updated}人分を直接同期しました。`);
      } catch (fallbackError) {
        console.error("学期ポイント同期に失敗しました:", error, fallbackError);
        window.alert("再集計に失敗しました。管理者権限と通信状態を確認してください。");
      }
    } finally {
      setRebuildingPoints(false);
    }
  };

  return (
    <main className="admin-dashboard">
      <header className="admin-dashboard-hero">
        <div className="admin-hero-copy">
          <span>ADMIN CONSOLE</span>
          <h1>管理ダッシュボード</h1>
          <p>今日の入力から生徒・成績・ポイント管理まで、ここから始められます。</p>
        </div>
        <div className="admin-hero-actions">
          <button
            type="button"
            className="student-preview-button"
            onClick={() => router.push("/mypage")}
          >
            <span>STUDENT VIEW</span>
            <strong>生徒マイページを確認</strong>
            <i>→</i>
          </button>
          <div className="current-term-card">
            <span>現在の学期</span>
            <strong>{termLabel}</strong>
          </div>
        </div>
      </header>

      <section className="admin-quick-section">
        <div className="admin-section-title">
          <div>
            <span>QUICK START</span>
            <h2>まず使う機能</h2>
          </div>
          <p>授業日の入力をすぐに始められます。</p>
        </div>
        <div className="admin-quick-grid">
          <button type="button" onClick={() => router.push("/admin/lesson-records")}>
            <span className="quick-number">01</span>
            <div>
              <strong>学習記録を入力</strong>
              <small>宿題・単語・出欠・生活態度</small>
            </div>
            <i>→</i>
          </button>
          <button type="button" onClick={() => router.push("/admin/qr")}>
            <span className="quick-number">02</span>
            <div>
              <strong>自習中の生徒を確認</strong>
              <small>現在の入室状況</small>
            </div>
            <i>→</i>
          </button>
        </div>
      </section>

      {menuGroups.map((group) => (
        <section className="admin-menu-section" key={group.id}>
          <div className="admin-section-title">
            <div>
              <span>{group.eyebrow}</span>
              <h2>{group.title}</h2>
            </div>
            <p>{group.description}</p>
          </div>
          <div className="admin-menu-grid">
            {group.items.map((item) => (
              <button
                type="button"
                key={item.path}
                className={`admin-tool-card ${item.tone} ${item.featured ? "featured" : ""}`}
                onClick={() => router.push(item.path)}
              >
                <span className="admin-tool-icon">{item.icon}</span>
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.desc}</small>
                </div>
                <i>→</i>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="admin-system-section">
        <div>
          <span>TERM MANAGEMENT</span>
          <h2>学期の切り替え</h2>
          <p>
            学期終了時のみ使用します。ランキング保存と学期集計のリセットを行います。
          </p>
        </div>
        <div className="admin-term-actions">
          <button type="button" className="rebuild" onClick={rebuildTermPoints} disabled={rebuildingPoints}>
            {rebuildingPoints ? "再集計中…" : "学期ポイントを再集計"}
          </button>
          <button type="button" onClick={startNewSeason} disabled={switchingSeason}>
            {switchingSeason ? "切り替えています…" : "新学期を開始"}
          </button>
        </div>
      </section>
    </main>
  );
}
