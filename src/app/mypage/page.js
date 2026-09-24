"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../firebaseConfig";
import { doc, getDoc, getDocFromCache, updateDoc } from "firebase/firestore";
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
import { studentIdentityForCurrentUser } from '@/lib/studentClientIdentity';

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
  const [identityKey, setIdentityKey] = useState('');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAvatar, setShowAvatar] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [examDates, setExamDates] = useState({});
  const [studentEvents,setStudentEvents]=useState([]);

  const [levelUpVisible, setLevelUpVisible] = useState(false);

  /* ---------- 出禁自動解除 ---------- */
  const autoUnbanIfExpired = async (profileRef, userData) => {
    if (!userData.banUntil) return;

    const now = new Date();
    const end = userData.banUntil.toDate
      ? userData.banUntil.toDate()
      : userData.banUntil;

    if (now > end) {
      await updateDoc(profileRef, {
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

      let identity;
      try { identity = await studentIdentityForCurrentUser(); } catch (error) { console.error(error); setLoading(false); return; }
      setIdentityKey(identity.studentKey);
      const profileRef = doc(db, identity.collectionName, identity.studentId);
      const cacheKey = `student-home:${identity.studentKey}`;
      const showCachedProfile = (value) => {
        if (!value) return false;
        setData(value);
        setLoading(false);
        return true;
      };

      // 前回表示した安全な概要を先に出し、最新値は直後にバックグラウンド更新する。
      try {
        const saved = JSON.parse(localStorage.getItem(cacheKey) || "null");
        showCachedProfile(saved);
      } catch {
        localStorage.removeItem(cacheKey);
      }
      try {
        const cachedSnap = await getDocFromCache(profileRef);
        if (cachedSnap.exists()) showCachedProfile(cachedSnap.data());
      } catch {}

      currentUser.getIdToken().then(token=>fetch('/api/student/events',{headers:{Authorization:`Bearer ${token}`}})).then(response=>response.ok?response.json():null).then(result=>result&&setStudentEvents(result.items||[])).catch(()=>{});

      try {
          // キャッシュを利用できる端末では先に表示し、弱い回線でもホームを開きやすくする。
          const snap = await getDoc(profileRef);
          if (snap.exists()) {
            const d = snap.data();
          autoUnbanIfExpired(profileRef, d).catch(console.error);
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
          localStorage.setItem(cacheKey, JSON.stringify({
            displayName: d.displayName || '', grade: d.grade || 0, points: d.points || 0,
            termPoints: d.termPoints || 0, totalEarnedPoints: d.totalEarnedPoints || 0,
            experience: d.experience || 0, level: d.level || 1, avatarUrl: d.avatarUrl || '',
            avatarVersion: d.avatarVersion || 0, courseTags: d.courseTags || [], tags: d.tags || [],
          }));
          if (Number(d.grade) === 9) {
            const month = new Date().getMonth() + 1;
            const academicYear = month <= 3 ? new Date().getFullYear() - 1 : new Date().getFullYear();
            getDoc(doc(db, 'admin_data', 'examDates')).then(value => setExamDates(value.data()?.years?.[academicYear] || {})).catch(()=>{});
          }

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
  const exp = data.experience ?? 0;
  const expNeeded = 100 + (level - 1) * 10;
  const expPercent = Math.min((exp / expNeeded) * 100, 100);
  const avatarRenderUrl = getAvatarDisplayUrl(data.avatarUrl);
  const examTypes = [
    ['exam_private','private','私立入試'],
    ['exam_recommendation','recommendation','公立推薦'],
    ['exam_general','general','公立一般'],
  ];
  const assignedExamTags = examTypes.filter(([tag]) => data.courseTags?.includes(tag));
  const visibleExams = (assignedExamTags.length ? assignedExamTags : examTypes).filter(([,id])=>examDates[id]).map(([tag,id,label])=>({tag,id,label,date:examDates[id],days:Math.max(0,Math.ceil((new Date(`${examDates[id]}T00:00:00+09:00`).getTime()-Date.now())/86400000))}));
  const menuItems = [
    { icon: "▦", label: "授業カレンダー", note: "授業・講習・行事", path: "/calendar", tone: "blue" },
    { icon: "◷", label: "自習を記録", note: "入退室・学習時間", path: "/checkin", tone: "blue" },
    { icon: "◇", label: "景品交換", note: "ポイントを使う", path: "/rewards", tone: "green" },
    ...(data?.grade >= 7 && data?.grade <= 9 ? [{ icon: "↗", label: "ランキング", note: "今学期の中学生トップ3", path: "/ranking", tone: "purple" }] : []),
    ...(data?.grade >= 10 && data?.grade <= 12
      ? []
      : [
          { icon: "✓", label: "成績・志望校", note: "テスト結果を記録", path: "/student/scores", tone: "pink" },
          ...(data?.tags?.includes("模試受験") ? [{ icon: "◎", label: "模試成績", note: "受験結果を確認", path: "/student/mock-scores", tone: "purple" }] : []),
          { icon: "◎", label: "生活態度", note: "日々の振り返り", path: "/behavior", tone: "teal" },
        ]),
    ...(data?.courseTags?.includes("summer_course")
      ? [{ icon: "☀", label: "夏期イベント", note: "期間限定イベント", path: "/summer", tone: "gold" }]
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

      <section className="student-user-section" aria-label="ユーザー情報">
        <header className="dashboard-header">
          <div className="dashboard-profile-info">
            <h1>{data.displayName || "生徒"}さん</h1>
            <div className="dashboard-profile-badges">
              <span className="dashboard-level">Lv. {level}</span>
              <span className="dashboard-points">所持 {points.toLocaleString()} pt</span>
            </div>
          </div>
          <button
            type="button"
            className="header-logout"
            aria-label="ログアウト"
            title="ログアウト"
            onClick={async () => {
              await signOut(getAuth());
              localStorage.removeItem("lastLevel");
              localStorage.removeItem(`student-home:${identityKey || `user_${user.uid}`}`);
              router.replace("/login");
            }}
          >
            退出
          </button>
        </header>

        <div className="student-user-content">
          <div className="avatar-panel">
            <div
              className="avatar-frame"
              style={{ backgroundImage: `url(${getSeasonImage()})` }}
            >
              {showAvatar && !avatarFailed && (
                <AvatarCanvas
                  key={`${avatarRenderUrl}:${data.avatarVersion || "legacy"}`}
                  url={avatarRenderUrl}
                  height={205}
                  onError={handleAvatarError}
                  onLoad={handleAvatarLoad}
                />
              )}
              {avatarFailed && (
                <div className="avatar-empty">
                  <span>アバターを表示できませんでした</span>
                  <button type="button" onClick={() => router.push("/settings")}>再設定する</button>
                </div>
              )}
              {!data.avatarUrl && (
                <div className="avatar-empty">
                  <span>アバター未設定</span>
                  <button type="button" onClick={() => router.push("/settings")}>設定する</button>
                </div>
              )}
            </div>
            <span className="avatar-caption">マイアバター</span>
          </div>

          <div className="progress-panel">
            <h2>次のレベルまで</h2>
            <strong>あと {Math.max(expNeeded - exp, 0)} XP</strong>
            <div
              className="exp-bar"
              role="progressbar"
              aria-label="次のレベルまでの経験値"
              aria-valuenow={Math.min(Math.max(exp, 0), expNeeded)}
              aria-valuemin={0}
              aria-valuemax={expNeeded}
            >
              <div className="exp-fill" style={{ width: `${expPercent}%` }} />
            </div>
            <p>XPをためてレベルアップ</p>
            {Number(data.grade) === 9 && visibleExams.length > 0 && (
              <div className="progress-exams" aria-label="入試までの日数">
                {visibleExams.map((exam) => (
                  <div className="progress-exam" key={exam.id}>
                    <span>{exam.label}</span>
                    <strong>あと {exam.days}日</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {(data.isBanned || data.yellowCard > 0) && (
          <div className="dashboard-alerts" aria-label="重要なお知らせ">
            {data.isBanned && data.banUntil && (
              <div className="dashboard-alert danger">
                <strong>自習室の利用停止中</strong>
                <span>解除予定：{new Date(data.banUntil.toDate?.() || data.banUntil).toLocaleDateString()}</span>
              </div>
            )}
            {data.yellowCard > 0 && (
              <div className="dashboard-alert warning">
                <strong>イエローカードがあります</strong>
                <span>次回の利用時はルールを確認してください。</span>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="menu-section">
        <div className="section-heading">
          <div>
            <h2>メニュー</h2>
          </div>
        </div>
        <div className="menu-grid">
          {menuItems.map((item) => (
            <button
              type="button"
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

      <aside className="beta-notice" role="note"><b>BETA</b><span>現在開発中です。仕様・機能・画面は予告なく変更される場合があります。</span></aside>

      {studentEvents.length>0&&<section className="dashboard-alerts" aria-label="教室からの予定">{studentEvents.slice(0,3).map(event=><div key={event.id} className="dashboard-alert"><strong>{event.name}</strong><span>{event.startDate.replaceAll('-',' / ')}{event.endDate!==event.startDate?`〜${event.endDate.replaceAll('-',' / ')}`:''}{event.startTime?`　${event.startTime}${event.endTime?`〜${event.endTime}`:''}`:''}</span></div>)}</section>}

    </main>
  );
}
