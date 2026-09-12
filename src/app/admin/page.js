"use client";
import { useAcademicContext } from '@/lib/useAcademicContext';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
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
        title: "自習管理",
        desc: "入室状況、自習履歴、不正記録をまとめて確認",
        icon: "◷",
        path: "/admin/study-log",
        tone: "cyan",
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
        title: "教室・授業設定",
        desc: "通塾曜日・開始日・学期期間・年間授業日を設定",
        icon: "▦",
        path: "/admin/settings",
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
        title: "成績・志望校",
        desc: "成績の確認・入力、志望校比較、印刷",
        icon: "△",
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
        title: "生徒ポイント履歴",
        desc: "生徒ごとの獲得・利用・減点理由を確認",
        icon: "P",
        path: "/admin/point-history",
        tone: "sky",
      },
      {
        title: "景品・交換管理",
        desc: "在庫、通常交換、ガチャの引き渡しを一元管理",
        icon: "◇",
        path: "/admin/rewards",
        tone: "mint",
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
  const academic = useAcademicContext();
  const currentSeason = academic.current;
  const termLabel = currentSeason ? `${currentSeason.year}年度 ${currentSeason.term}学期` : '学期未設定';

  const startNewSeason = async () => {
    if (!currentSeason) return window.alert(academic.error || '学期設定を読み込み中です。');
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
    if (!currentSeason) return window.alert(academic.error || '学期設定を読み込み中です。');
    if (rebuildingPoints) return;
    if (!window.confirm(`${termLabel}のポイントを履歴から再集計しますか？`)) return;
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
      console.error("学期ポイント同期に失敗しました:", error);
      window.alert("再集計に失敗しました。データは変更されていません。");
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
          <button type="button" className="student-preview-button" onClick={() => router.push('/teacher')}><span>TEACHER VIEW</span><strong>講師ページを確認</strong><i>→</i></button>
          <button type="button" className="student-preview-button" onClick={() => router.push('/parent')}><span>PARENT VIEW</span><strong>保護者ページを確認</strong><i>→</i></button>
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
          <button type="button" onClick={() => router.push("/admin/study-log")}>
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
