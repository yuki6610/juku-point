'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import CourseOperations from './CourseOperations';
import './course-lessons.css';
import './course-redesign.css';

export default function CourseLessonsPage() {
  const [programs, setPrograms] = useState([]), [programId, setProgramId] = useState(''), [name, setName] = useState(''), [startDate, setStartDate] = useState(''), [endDate, setEndDate] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const api = async body => { const response = await fetch('/api/admin/course-programs', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); const value = await response.json(); if (!response.ok) throw new Error(value.error || '通信に失敗しました。'); return value; };
  const load = async () => { const value = await api(); setPrograms(value.programs || []); setProgramId(old => old || value.programs?.[0]?.id || ''); };
  useEffect(() => onAuthStateChanged(auth, user => { if (user) load().catch(error => setNotice(error.message)); }), []);
  const create = async () => { setBusy(true); try { const result = await api({ action: 'createProgram', name, startDate, endDate }); await load(); setProgramId(result.id); setName(''); setStartDate(''); setEndDate(''); setNotice('講習を作成しました。'); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  return <main className="course-lessons-page"><header><div><small>授業の準備</small><h1>講習管理</h1><p>申込、受講コマ数、日程調整、確定までを順番に進めます。</p></div></header>{notice && <p role="status">{notice}</p>}
    <section className="course-card"><h2>講習を選択</h2><select value={programId} onChange={event => setProgramId(event.target.value)}><option value="">講習を選択</option>{programs.map(item => <option key={item.id} value={item.id}>{item.name}（{item.startDate}〜{item.endDate}）</option>)}</select><details><summary>新しい講習を作成</summary><div className="session-form"><input placeholder="講習名" value={name} onChange={event => setName(event.target.value)}/><label>開始日<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)}/></label><label>終了日<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)}/></label><button disabled={busy} onClick={create}>講習を作成</button></div></details></section>
    {programId && <CourseOperations key={programId} programId={programId}/>}
  </main>;
}
