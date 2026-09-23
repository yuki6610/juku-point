'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import './lesson-hub.css';
import './lesson-hub-improvements.css';
const SharedLessonInput = dynamic(() => import('../../teacher/page'), { loading: () => <p>学習記録を読み込み中…</p> });
const Attendance = dynamic(() => import('../lesson-attendance/LessonAttendanceManager'), { loading: () => <p>出欠情報を読み込み中…</p> });
const LessonInputStatus = dynamic(() => import('./LessonInputStatus'), { loading: () => <p>入力状況を読み込み中…</p> });
const LessonReportApprovals = dynamic(() => import('./LessonReportApprovals'), { loading: () => <p>未承認報告を読み込み中…</p> });
export default function LessonRecordsPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') === 'attendance' ? 'attendance' : 'learning');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!dirty && !busy) return undefined;
    const beforeUnload = (event) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    const beforeNavigate = (event) => {
      const target=event.target instanceof Element?event.target:event.target?.parentElement;
      if (!target?.closest('.admin-nav button,.admin-student-switch button') || !dirty && !busy) return;
      if (busy || !window.confirm('未保存の入力があります。内容を破棄して移動しますか？')) {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      } else setDirty(false);
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', beforeNavigate, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', beforeNavigate, true); };
  }, [dirty, busy]);
  useEffect(()=>{ if(params.get('student')&&params.get('date')) setTab('learning'); else if(params.get('tab')==='attendance')setTab('attendance'); },[params]);
  const switchTab = next => {
    if (next === tab || busy) return;
    if (dirty && !window.confirm('未保存の入力があります。内容を破棄して切り替えますか？')) return;
    setDirty(false); setTab(next);
  };
  return <div className="lesson-hub">
    <header><h1>学習記録・出欠管理</h1><p>小学生・中学生・高校生の学習記録と、出欠・振替をまとめて確認できます。</p></header>
    <nav className="lesson-hub-tabs" aria-label="学習記録メニュー">
      <button disabled={busy} aria-pressed={tab === 'learning'} onClick={() => switchTab('learning')}>学習内容・次回の宿題を入力</button>
      <button disabled={busy} aria-pressed={tab === 'attendance'} onClick={() => switchTab('attendance')}>出欠確認・照合・履歴修正</button>
      <a href="/admin/settings" onClick={event => { if (busy || (dirty && !window.confirm('未保存の入力があります。設定ページへ移動しますか？'))) event.preventDefault(); }}>曜日・授業設定</a>
    </nav>
    {tab === 'learning' ? <><LessonReportApprovals/><LessonInputStatus/><SharedLessonInput /></> : <Attendance recordsOnly onDirtyChange={setDirty} onBusyChange={setBusy} />}
  </div>;
}
