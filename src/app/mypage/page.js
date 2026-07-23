"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../firebaseConfig";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import dynamic from "next/dynamic";
const AvatarCanvas = dynamic(
  () => import("@/components/VRMAvatarCanvas"),
  {
    ssr: false,
    loading: () => <p className="avatar-loading">アバターを準備中…</p>,
  }
);
import "./mypage.css";

/* ---------------- 共通関数 ---------------- */

const getSeasonBackground = () =>
  "radial-gradient(circle at 20% 20%, #e0f2fe 0%, #f8fafc 100%)";

const getSeasonImage = () => {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return "/season/spring.jpg";
  if (m >= 6 && m <= 8) return "/season/summer.jpg";
  if (m >= 9 && m <= 11) return "/season/autumn.jpg";
  return "/season/winter.jpg";
};

const getAvatarDisplayUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return url;
  return `/api/avatar?url=${encodeURIComponent(url)}`;
};

/* ---------------- コンポーネント ---------------- */

export default function MyPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAvatar, setShowAvatar] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [gachaAccess, setGachaAccess] = useState({ eligible: false, pendingCount: 0 });

  const [levelUpVisible, setLevelUpVisible] = useState(false);

  /* ---------- 出禁自動解除 ---------- */
  const autoUnbanIfExpired = async (uid, userData) => {
    if (!userData.banUntil) return;

    const now = new Date();
    const end = userData.banUntil.toDate
      ? userData.banUntil.toDate()
      : userData.banUntil;

    if (now > end) {
      await updateDoc(doc(db, "users", uid), {
        isBanned: false,
        banUntil: null,
      });
    }
  };

  /* ---------- 初期処理 ---------- */
  useEffect(() => {
    const auth = getAuth();

    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      clearTimeout(timeoutId);

      if (!currentUser) {
        setLoading(false);
        router.push("/login");
        return;
      }

      setUser(currentUser);

      try {
          // キャッシュを利用できる端末では先に表示し、弱い回線でもホームを開きやすくする。
          const snap = await getDoc(doc(db, "users", currentUser.uid));
          if (snap.exists()) {
            const d = snap.data();
          autoUnbanIfExpired(currentUser.uid, d).catch(console.error);
          let avatarOverride = null;
          try {
            avatarOverride = JSON.parse(
              localStorage.getItem(`avatar:${currentUser.uid}`) || "null"
            );
          } catch {
            localStorage.removeItem(`avatar:${currentUser.uid}`);
          }
          const useLocalAvatar =
            avatarOverride?.avatarUrl &&
            Number(avatarOverride.avatarVersion || 0) >=
              Number(d.avatarVersion || 0);
          setData(useLocalAvatar ? { ...d, ...avatarOverride } : d);

          currentUser.getIdToken().then((token) =>
            fetch("/api/gacha/eligibility", { headers: { Authorization: `Bearer ${token}` } })
          ).then((response) => response.ok ? response.json() : null)
            .then((result) => result && setGachaAccess(result))
            .catch(() => {});


          const lastLevel = parseInt(localStorage.getItem("lastLevel") || "0");
          if ((d.level ?? 1) > lastLevel) {
            setLevelUpVisible(true);
            setTimeout(() => setLevelUpVisible(false), 1800);
          }
          localStorage.setItem("lastLevel", d.level ?? 1);
        }
      } catch (e) {
        console.error(e);
      }

      setLoading(false);
    });

    return () => {
      clearTimeout(timeoutId);
      unsub();
    };
  }, [router]);

  useEffect(() => {
    setShowAvatar(false);
    setAvatarFailed(false);
    if (!data.avatarUrl) return;
    // 3DライブラリとVRMの読込は、ホーム本体の描画が終わってから開始する。
    const start = () => setShowAvatar(true);
    const idleId = window.requestIdleCallback?.(start, { timeout: 1800 });
    const timeoutId = idleId == null ? window.setTimeout(start, 700) : null;
    return () => {
      if (idleId != null) window.cancelIdleCallback?.(idleId);
      if (timeoutId != null) window.clearTimeout(timeoutId);
    };
  }, [data.avatarUrl, data.avatarVersion]);

  const handleAvatarError = useCallback(() => setAvatarFailed(true), []);
  const handleAvatarLoad = useCallback(() => setAvatarFailed(false), []);

  if (loading) return <p className="loading-text">読み込み中...</p>;
  if (!user) return null;

  const level = data.level ?? 1;
  const points = data.points ?? 0;
  const termPoints = data.termPoints ?? 0;
  const totalEarnedPoints = data.totalEarnedPoints ?? 0;
  const exp = data.experience ?? 0;
  const expNeeded = 100 + (level - 1) * 10;
  const expPercent = Math.min((exp / expNeeded) * 100, 100);
  const avatarRenderUrl = getAvatarDisplayUrl(data.avatarUrl);
  const menuItems = [
    { icon: "◷", label: "自習を記録", note: "入退室・学習時間", path: "/checkin", tone: "blue" },
    { icon: "◇", label: "景品交換", note: "ポイントを使う", path: "/rewards", tone: "green" },
    { icon: "↗", label: "ランキング", note: "みんなの成長を見る", path: "/ranking", tone: "purple" },
    ...(data?.grade >= 10 && data?.grade <= 12
      ? []
      : [
          { icon: "✓", label: "成績・志望校", note: "テスト結果を記録", path: "/student/scores", tone: "pink" },
          { icon: "◎", label: "生活態度", note: "日々の振り返り", path: "/behavior", tone: "teal" },
        ]),
    ...(data?.courseTags?.includes("summer_course")
      ? [{ icon: "☀", label: "夏期イベント", note: "期間限定イベント", path: "/summer", tone: "gold" }]
      : []),
    ...(gachaAccess.eligible
      ? [{
          icon: "☆",
          label: "ガチャ",
          note: gachaAccess.pendingCount > 0
            ? `受け取り待ち ${gachaAccess.pendingCount}件`
            : gachaAccess.adminPreview
              ? "管理者の動作確認"
              : "500ptで必ず当たる",
          path: "/gacha",
          tone: "gold",
        }]
      : []),
    { icon: "P", label: "ポイント履歴", note: "獲得・利用履歴", path: "/points", tone: "cyan" },
    { icon: "⚙", label: "設定", note: "名前・アバター", path: "/settings", tone: "gray" },
    { icon: "?", label: "使い方", note: "操作ガイド", path: "/guide", tone: "orange" },
  ];

  return (
    <main className="dashboard-shell" style={{ background: getSeasonBackground() }}>
      {levelUpVisible && (
        <div className="levelup-banner">🎉 LEVEL UP!</div>
      )}

      <header className="dashboard-header">
        <div>
          <p className="dashboard-eyebrow">TODAY</p>
          <h1>{data.displayName || "生徒"}さんのホーム</h1>
          <p>今日やることを、ここから始めましょう。</p>
        </div>
        <button
          className="header-logout"
          onClick={async () => {
            await signOut(getAuth());
            localStorage.removeItem("lastLevel");
            router.replace("/login");
          }}
        >
          ログアウト
        </button>
      </header>

      {(data.isBanned || data.yellowCard > 0) && (
        <section className="dashboard-alerts" aria-label="重要なお知らせ">
          {data.isBanned && data.banUntil && (
            <div className="dashboard-alert danger">
              <strong>自習室の利用停止中</strong>
              <span>
                解除予定：{new Date(data.banUntil.toDate?.() || data.banUntil).toLocaleDateString()}
              </span>
            </div>
          )}
          {data.yellowCard > 0 && (
            <div className="dashboard-alert warning">
              <strong>イエローカードがあります</strong>
              <span>次回の利用時はルールを確認してください。</span>
            </div>
          )}
        </section>
      )}

      <section className="home-focus" aria-label="今日の学習">
        <div className="home-focus-copy">
          <span>TODAY&apos;S ACTION</span>
          <h2>今日の学習を記録しよう</h2>
          <p>教室に着いたら、入室PINを入力して自習を始めます。</p>
          <button type="button" onClick={() => router.push("/checkin")}>
            自習を記録する
            <span>→</span>
          </button>
        </div>
        <div className="home-term-summary">
          <span>今学期の学習</span>
          <strong>{Math.round((data.termStudyMinutes || 0) / 60 * 10) / 10}<small>時間</small></strong>
          <p>{data.termSelfStudyCount || 0}回の自習を記録</p>
        </div>
      </section>

      <section className="dashboard-stats" aria-label="学習状況">
        <article className="stat-tile">
          <span className="stat-label">LEVEL</span>
          <strong>{level}</strong>
          <small>現在のレベル</small>
        </article>
        <article className="stat-tile">
          <span className="stat-label">POINTS</span>
          <strong>{points.toLocaleString()}</strong>
          <small>利用可能ポイント</small>
        </article>
        <article className="stat-tile">
          <span className="stat-label">TERM POINTS</span>
          <strong>{termPoints.toLocaleString()}</strong>
          <small>今学期の獲得</small>
        </article>
        <article className="stat-tile">
          <span className="stat-label">TOTAL POINTS</span>
          <strong>{totalEarnedPoints.toLocaleString()}</strong>
          <small>これまでの累計獲得</small>
        </article>
        <article className="stat-tile">
          <span className="stat-label">EXPERIENCE</span>
          <strong>{Math.round(expPercent)}%</strong>
          <small>次のレベルまで</small>
        </article>
      </section>

      <section className="dashboard-hero">
        <div className="avatar-panel">
          <div className="avatar-panel-heading">
            <div>
              <span>YOUR AVATAR</span>
              <strong>{data.displayName || "未設定"}</strong>
            </div>
            <button onClick={() => router.push("/settings")}>編集</button>
          </div>
          <div
            className="avatar-frame"
            style={{ backgroundImage: `url(${getSeasonImage()})` }}
          >
            {showAvatar && !avatarFailed && (
              <AvatarCanvas
                key={`${avatarRenderUrl}:${data.avatarVersion || "legacy"}`}
                url={avatarRenderUrl}
                height={250}
                onError={handleAvatarError}
                onLoad={handleAvatarLoad}
              />
            )}
            {avatarFailed && (
              <div className="avatar-empty">
                <span>アバターを表示できませんでした</span>
                <button onClick={() => router.push("/settings")}>再設定する</button>
              </div>
            )}
            {!data.avatarUrl && (
              <div className="avatar-empty">
                <span>アバター未設定</span>
                <button onClick={() => router.push("/settings")}>設定する</button>
              </div>
            )}
          </div>
        </div>

        <div className="progress-panel">
          <span className="panel-kicker">LEVEL PROGRESS</span>
          <h2>次のレベルまで</h2>
          <div className="progress-copy">
            <strong>{exp}</strong>
            <span>/ {expNeeded} XP</span>
          </div>
          <div className="exp-bar" aria-label={`経験値 ${Math.round(expPercent)}%`}>
            <div className="exp-fill" style={{ width: `${expPercent}%` }} />
          </div>
          <p>あと {Math.max(expNeeded - exp, 0)} XPでレベルアップ</p>
          <button className="primary-action" onClick={() => router.push("/points")}>
            ポイント履歴を見る
          </button>
        </div>
      </section>

      <section className="menu-section">
        <div className="section-heading">
          <div>
            <span>MENU</span>
            <h2>何をしますか？</h2>
          </div>
        </div>
        <div className="menu-grid">
          {menuItems.map((item) => (
            <button
              key={item.path}
              className={`menu-tile ${item.tone}`}
              onClick={() => router.push(item.path)}
            >
              <span className="menu-icon">{item.icon}</span>
              <span className="menu-text">
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </span>
              <span className="menu-arrow">→</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
