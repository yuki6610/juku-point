"use client";
import { useAcademicContext } from '@/lib/useAcademicContext';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";
import { resetSeason } from "../utils/resetSeason";
import "./admin.css";
import "./dashboard-improvements.css";

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
      { title:"講習授業管理",desc:"講習申込・受講コマ数・日程を管理",icon:"季",path:"/admin/course-lessons",tone:"sky" },
      { title:"講師シフト",desc:"週ごとのシフト作成・コピー・確定",icon:"表",path:"/admin/shifts",tone:"indigo" },
      { title:"講師のシフト希望",desc:"出勤可能日時・対応教科と学年を確認",icon:"時",path:"/admin/teacher-preferences",tone:"mint" },
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
      { title:"生徒メモ",desc:"授業方針・共有事項・教材を一覧編集",icon:"表",path:"/admin/student-notes",tone:"slate" },
      { title:"本アカウント紐付け・進級",desc:"生徒IDを維持して本人アカウントを管理",icon:"鍵",path:"/admin/student-accounts",tone:"indigo" },
      { title:"保護者管理",desc:"保護者の紐付け・招待・タグを管理",icon:"家",path:"/admin/parents",tone:"mint" },
      { title:"タグ一括管理",desc:"生徒・保護者へタグを一括設定",icon:"#",path:"/admin/tags",tone:"violet" },
      { title:"模試成績",desc:"生徒ごとの模試結果を登録・確認",icon:"模",path:"/admin/mock-scores",tone:"indigo" },
      { title:"高校情報",desc:"高校の通学・部活動・進路情報を管理",icon:"校",path:"/admin/schools",tone:"sky" },
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
        desc: "在庫と通常交換の引き渡しを一元管理",
        icon: "◇",
        path: "/admin/rewards",
        tone: "mint",
      },
      { title:"友人紹介管理",desc:"紹介から特典引き渡しまでを管理",icon:"紹",path:"/admin/referrals",tone:"mint" },
      { title:"バグ報告",desc:"生徒・保護者から届いた報告を確認",icon:"!",path:"/admin/feedback",tone:"violet" },
      { title:"ログイン復旧",desc:"本人に渡す一回限りの再設定リンクを発行",icon:"鍵",path:"/admin/account-recovery",tone:"indigo" },
      { title:"アプリ運用費",desc:"AI利用量と実請求額を比較",icon:"¥",path:"/admin/operations-costs",tone:"sky" },
    ],
  },
];
const allMenuItems = menuGroups.flatMap(group => group.items).filter((item,index,list)=>list.findIndex(value=>value.path===item.path)===index);

export default function AdminPage() {
  const router = useRouter();
  const [switchingSeason, setSwitchingSeason] = useState(false);
  const [daily,setDaily]=useState(null);
  const academic = useAcademicContext();
  const currentSeason = academic.current;
  const termLabel = currentSeason ? `${currentSeason.year}年度 ${currentSeason.term}学期` : '学期未設定';
  useEffect(()=>{if(!currentSeason||!auth.currentUser)return;const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date());auth.currentUser.getIdToken().then(token=>Promise.all([fetch(`/api/teacher/context?date=${date}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()),fetch(`/api/admin/score-submissions?term=${currentSeason.id}`,{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json()),fetch('/api/admin/parent-portal',{headers:{Authorization:`Bearer ${token}`}}).then(r=>r.json())])).then(([lesson,submission,portal])=>{const scheduled=(lesson.students||[]).filter(item=>item.scheduled),done=scheduled.filter(item=>lesson.inputStatus?.[item.key]).length;setDaily({scheduled:scheduled.length,done,missingInput:Math.max(0,scheduled.length-done),missingScores:(submission.students||[]).filter(item=>!item.examReceived||!item.internalReceived).length,announcements:(portal.announcements||[]).length})}).catch(()=>{})},[currentSeason?.id]);

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

      <section className="admin-today-section"><div className="admin-section-title"><div><span>TODAY</span><h2>今日の業務</h2></div><p>未対応の項目から確認できます。</p></div><div className="admin-today-grid"><button onClick={()=>router.push('/admin/lesson-records')}><span>本日の授業予定</span><strong>{daily?.scheduled??'—'}<small>人</small></strong></button><button onClick={()=>router.push('/admin/lesson-records')} className={daily?.missingInput?'needs-action':''}><span>学習記録の未入力</span><strong>{daily?.missingInput??'—'}<small>人</small></strong><small>入力済み {daily?.done??'—'}人</small></button><button onClick={()=>router.push('/admin/score?tab=submissions')} className={daily?.missingScores?'needs-action':''}><span>成績資料の未提出</span><strong>{daily?.missingScores??'—'}<small>人</small></strong></button><button onClick={()=>router.push('/admin/settings')}><span>公開中のお知らせ</span><strong>{daily?.announcements??'—'}<small>件</small></strong></button></div></section>

        <section className="admin-menu-section">
          <div className="admin-section-title">
            <div>
              <span>ALL TOOLS</span>
              <h2>管理機能</h2>
            </div>
            <p>ページを細かく分類せず、必要な機能を一覧から選べます。</p>
          </div>
          <div className="admin-menu-grid">
            {allMenuItems.map((item) => (
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

      <section className="admin-system-section">
        <div>
          <span>TERM MANAGEMENT</span>
          <h2>学期の切り替え</h2>
          <p>
            学期終了時のみ使用します。ランキング保存と学期集計のリセットを行います。
          </p>
        </div>
        <div className="admin-term-actions">
          <button type="button" onClick={startNewSeason} disabled={switchingSeason}>
            {switchingSeason ? "切り替えています…" : "新学期を開始"}
          </button>
        </div>
      </section>
    </main>
  );
}
