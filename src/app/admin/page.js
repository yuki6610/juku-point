"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/firebaseConfig";
import { useAcademicContext } from "@/lib/useAcademicContext";
import "./admin-dashboard-redesign.css";

const todayId = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
const todayLabel = () => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short" }).format(new Date());

export default function AdminPage() {
  const router = useRouter();
  const academic = useAcademicContext();
  const [tab, setTab] = useState("tasks");
  const [summary, setSummary] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!academic.current || !auth.currentUser) return;
    let active = true;
    const load = async () => {
      const token = await auth.currentUser.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const request = async (url) => {
        const response = await fetch(url, { headers });
        if (!response.ok) throw new Error("取得できませんでした");
        return response.json();
      };
      const results = await Promise.allSettled([
        request(`/api/teacher/context?date=${todayId()}`),
        request(`/api/admin/score-submissions?term=${academic.current.id}`),
        request("/api/admin/lesson-reports"),
        request("/api/admin/family-services"),
        request("/api/admin/parent-portal"),
      ]);
      if (!active) return;
      const [lesson, scores, reports, family, portal] = results.map(result => result.status === "fulfilled" ? result.value : null);
      const scheduled = (lesson?.students || []).filter(item => item.scheduled);
      setSummary({
        scheduled: lesson ? scheduled.length : null,
        missingInput: lesson ? scheduled.filter(item => !lesson.inputStatus?.[item.key]).length : null,
        approvals: reports ? (reports.items || []).length : null,
        interviews: family ? (family.reservations || []).filter(item => item.status === "pending").length : null,
        missingScores: scores ? (scores.students || []).filter(item => !item.examReceived || !item.internalReceived).length : null,
        announcements: portal ? (portal.announcements || []).length : null,
      });
      setErrors(Object.fromEntries(results.map((result, index) => [index, result.status === "rejected"])));
    };
    load().catch(() => { if (active) setErrors({ all: true }); });
    return () => { active = false; };
  }, [academic.current?.id]);

  const tasks = [
    { key: "approvals", title: "授業報告の承認待ち", note: "内容を確認して保護者へ公開", path: "/admin/lesson-records?tab=approval" },
    { key: "missingInput", title: "授業記録の未入力", note: "授業内容と宿題の入力状況を確認", path: "/admin/lesson-records?tab=learning" },
    { key: "interviews", title: "面談の申請待ち", note: "日時を承認または却下", path: "/admin/family?tab=interviews" },
    { key: "missingScores", title: "成績資料の未提出", note: "テスト・通知表の提出状況を確認", path: "/admin/academics?tab=submissions" },
  ];
  return <main className="admin-work-home">
    <header className="admin-work-heading"><div><span>今日の業務</span><h1>対応が必要なこと</h1><p>件数を選ぶと、該当する画面を開きます。</p></div><time>{todayLabel()}</time></header>
    <nav className="admin-work-tabs" aria-label="今日の業務の表示">
      {[['tasks','対応が必要'],['schedule','今日の授業'],['news','お知らせ']].map(([id,label]) => <button type="button" key={id} className={tab===id?'active':''} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}
    </nav>
    {tab === "tasks" && <div className="admin-work-task-list">
      {tasks.map(item => <button type="button" key={item.key} onClick={()=>router.push(item.path)}><span className={`admin-work-count ${summary[item.key] === 0 ? 'zero' : ''}`}>{summary[item.key] == null ? '—' : summary[item.key]}</span><span><strong>{item.title}</strong><small>{summary[item.key] === 0 ? '現在、対応はありません' : item.note}</small></span><b>確認する →</b></button>)}
      {(errors.all || Object.values(errors).some(Boolean)) && <p role="alert">一部の件数を取得できませんでした。「—」は0件ではありません。各画面で内容を確認してください。</p>}
    </div>}
    {tab === "schedule" && <section className="admin-work-simple"><h2>今日の授業</h2><p>予定 {summary.scheduled ?? '—'}件・記録待ち {summary.missingInput ?? '—'}件</p><button type="button" onClick={()=>router.push('/admin/lesson-records')}>授業・出欠を開く →</button></section>}
    {tab === "news" && <section className="admin-work-simple"><h2>公開中のお知らせ</h2><p>{summary.announcements ?? '—'}件</p><button type="button" onClick={()=>router.push('/admin/family?tab=announcements')}>お知らせ・資料を開く →</button></section>}
    <div className="admin-work-shortcuts"><section><h2>今日の授業</h2><p>予定 {summary.scheduled ?? '—'}件・記録待ち {summary.missingInput ?? '—'}件</p><button type="button" onClick={()=>router.push('/admin/lesson-records')}>授業・出欠を開く →</button></section><section><h2>今週の準備</h2><p>次週のシフトを確認できます。</p><button type="button" onClick={()=>router.push('/admin/shift-management')}>シフト管理を開く →</button></section></div>
    <details className="admin-work-previews"><summary>利用者画面を確認</summary><div><button onClick={()=>router.push('/mypage')}>生徒画面</button><button onClick={()=>router.push('/teacher')}>講師画面</button><button onClick={()=>router.push('/parent')}>保護者画面</button></div></details>
  </main>;
}
