'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import './lesson-hub.css';
const LearningRecordForm = dynamic(() => import('./LearningRecordForm'), { loading: () => <p>学習記録を読み込み中…</p> });
const Attendance = dynamic(() => import('../lesson-attendance/LessonAttendanceManager'), { loading: () => <p>出欠情報を読み込み中…</p> });
const HomeworkManager = dynamic(() => import('./HomeworkManager'), { loading: () => <p>宿題を読み込み中…</p> });
export default function LessonRecordsPage() {
  const [tab, setTab] = useState('learning');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const switchTab = next => {
    if (next === tab || busy) return;
    if (dirty && !window.confirm('未保存の入力があります。内容を破棄して切り替えますか？')) return;
    setDirty(false); setTab(next);
  };
  return <div className="lesson-hub">
    <header><h1>学習記録・出欠管理</h1><p>小学生・中学生・高校生の学習記録と、出欠・振替をまとめて確認できます。</p></header>
    <nav className="lesson-hub-tabs" aria-label="学習記録メニュー">
      <button disabled={busy} aria-pressed={tab === 'learning'} onClick={() => switchTab('learning')}>学習内容を入力</button>
      <button disabled={busy} aria-pressed={tab === 'attendance'} onClick={() => switchTab('attendance')}>出欠確認・照合・履歴修正</button>
      <button disabled={busy} aria-pressed={tab === 'homework'} onClick={() => switchTab('homework')}>次回の宿題を登録</button>
      <a href="/admin/settings" onClick={event => { if (busy || (dirty && !window.confirm('未保存の入力があります。設定ページへ移動しますか？'))) event.preventDefault(); }}>曜日・授業設定</a>
    </nav>
    {tab === 'learning' ? <LearningRecordForm onDirtyChange={setDirty} onBusyChange={setBusy} /> : tab === 'homework' ? <HomeworkManager onDirtyChange={setDirty} onBusyChange={setBusy} /> : <Attendance recordsOnly onDirtyChange={setDirty} onBusyChange={setBusy} />}
  </div>;
}
