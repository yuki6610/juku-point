'use client';
import { useState } from 'react';
import LessonAttendanceManager from '../lesson-attendance/LessonAttendanceManager';
import HomeworkTemplates from './HomeworkTemplates';
import TeacherManager from './TeacherManager';
import ParentManager from './ParentManager';
import ExamSettings from './ExamSettings';

export default function AdminSettingsPage() {
  const [tab, setTab] = useState('lessons');
  const tabs = [['lessons','授業・年度'],['exam','入試日'],['homework','教材・定型文'],['accounts','講師・保護者']];
  return <main className="admin-settings-page">
    <header className="admin-page-heading"><span>CLASSROOM SETTINGS</span><h1>教室・授業設定</h1><p>設定する内容をタブで切り替えます。</p></header>
    <nav className="attendance-tabs" aria-label="教室設定">{tabs.map(([id,label])=><button type="button" key={id} className={tab===id?'active':''} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==='lessons'&&<LessonAttendanceManager settingsOnly />}
    {tab==='exam'&&<ExamSettings />}
    {tab==='homework'&&<HomeworkTemplates />}
    {tab==='accounts'&&<><TeacherManager /><ParentManager /></>}
  </main>;
}
