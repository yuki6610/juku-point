'use client';
import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/firebaseConfig';
import { japanDateId } from '@/lib/academicCalendar.mjs';
import { aggregateItemResults, ITEM_RESULT_LABELS } from '@/lib/homeworkModel.mjs';
import './teacher.css';

const getWeek = value => { const date = new Date(`${value}T12:00:00Z`); const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1)); return Math.ceil((((date - start) / 86400000) + start.getUTCDay() + 1) / 7); };
async function api(url, options) { const token = await auth.currentUser?.getIdToken(); const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } }); const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }

export default function TeacherPage() {
  const [date, setDate] = useState(japanDateId()), [context, setContext] = useState(null), [studentKey, setStudentKey] = useState(''), [homeworkData, setHomeworkData] = useState(null);
  const [reviewId, setReviewId] = useState(''), [itemResults, setItemResults] = useState({}), [commentIds, setCommentIds] = useState([]), [late, setLate] = useState(false), [forgot, setForgot] = useState(false), [note, setNote] = useState('');
  const [nextItems, setNextItems] = useState([{ materialId: '', range: '' }]), [dueDate, setDueDate] = useState(''), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false);
  const student = context?.students.find(item => item.key === studentKey);
  useEffect(() => onAuthStateChanged(auth, user => { if (!user) location.href = '/teacher/login'; else api(`/api/teacher/context?date=${date}`).then(value => { setContext(value); setStudentKey(''); }).catch(error => setNotice(error.message)); }), [date]);
  useEffect(() => { if (!studentKey) return setHomeworkData(null); api(`/api/admin/homework?student=${encodeURIComponent(studentKey)}&date=${date}`).then(setHomeworkData).catch(error => setNotice(error.message)); }, [studentKey, date]);
  const pending = useMemo(() => (homeworkData?.items || []).filter(item => !item.review || ['pending','absent'].includes(item.review.status)), [homeworkData]);
  const reviewAssignment = pending.find(item=>item.id===reviewId);
  const save = async () => {
    if (!student || saving) return; setSaving(true); setNotice('');
    try {
      const termId = context.term.id, weekId = `${context.term.year}-W${String(getWeek(date)).padStart(2,'0')}`;
      const reviewStatus = reviewAssignment ? aggregateItemResults(reviewAssignment.items,itemResults) : 'pending';
      if (reviewAssignment && reviewStatus === 'pending') throw new Error('各宿題を「提出・途中・未提出」から選択してください。');
      const homeworkReview = reviewId ? { assignmentId: reviewId, status: reviewStatus, itemResults } : null;
      const learningRecord = { homework: reviewId ? (reviewStatus === 'submitted' ? 'submitted' : reviewStatus) : 'none', wordTest: { status: 'notScheduled', correct: null, total: null }, late, forgot, behaviorNote: note };
      if (student.grade >= 7 && student.grade <= 9) await api('/api/admin/lesson-records', { method: 'POST', body: JSON.stringify({ uid: student.id, date, termId, weekId, homeworkReview, commentIds, record: { ...learningRecord, attendance: 'present' } }) });
      else await api('/api/admin/lesson-attendance', { method: 'POST', body: JSON.stringify({ action: 'save', student: { id: student.id, source: student.source, grade: student.grade }, date, status: 'present', note, learningRecord, homeworkReview, commentIds }) });
      const validItems = nextItems.filter(item => item.materialId && item.range.trim());
      if (validItems.length) {
        if (!dueDate) throw new Error('新しい宿題の確認予定日を入力してください。');
        await api('/api/admin/homework', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), student: student.key, assignedDate: date, dueDate, items: validItems }) });
      }
      setNotice('授業後の記録を保存しました。'); setReviewId(''); setItemResults({}); setCommentIds([]); setLate(false); setForgot(false); setNote(''); setDueDate(''); setNextItems([{ materialId: '', range: '' }]);
    } catch (error) { setNotice(error.message); } finally { setSaving(false); }
  };
  return <main className="teacher-shell"><header><div><small>TEACHER CONSOLE</small><h1>授業後の入力</h1><p>{context?.displayName || ''}　その日に担当した生徒を選択してください。</p></div><button onClick={() => signOut(auth).then(() => location.href='/teacher/login')}>ログアウト</button></header>
    {notice && <p className="teacher-notice" role="status">{notice}</p>}<section className="teacher-flow"><label><span>1. 授業日</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label><span>2. 担当生徒</span><select value={studentKey} onChange={e => setStudentKey(e.target.value)}><option value="">選択してください</option>{(context?.students || []).map(item => <option key={item.key} value={item.key}>{item.name}（{item.grade}年）</option>)}</select></label></section>
    {student && homeworkData && <><section><h2>今回の確認</h2>{pending.length ? <><label>確認する宿題<select value={reviewId} onChange={e => {setReviewId(e.target.value);setItemResults({})}}><option value="">今回は確認しない</option>{pending.map(item => <option key={item.id} value={item.id}>{item.dueDate}予定：{item.items.map(row => `${row.materialLabel} ${row.range}`).join('／')}</option>)}</select></label>{reviewAssignment&&reviewAssignment.items.map(item=><div key={item.id}><strong>{item.materialLabel} {item.range}</strong><div className="teacher-checks">{Object.entries(ITEM_RESULT_LABELS).map(([status,label])=><label key={status}><input type="radio" name={`homework-${item.id}`} checked={itemResults[item.id]===status} onChange={()=>setItemResults(old=>({...old,[item.id]:status}))}/>{label}</label>)}</div></div>)}</> : <p>確認待ちの宿題はありません。</p>}
      <div className="teacher-checks"><label><input type="checkbox" checked={late} onChange={e => setLate(e.target.checked)} />遅刻</label><label><input type="checkbox" checked={forgot} onChange={e => setForgot(e.target.checked)} />忘れ物</label></div><p>保護者向け定型コメント</p><div className="teacher-comments">{homeworkData.templates.comments.map(item => <label key={item.id}><input type="checkbox" checked={commentIds.includes(item.id)} onChange={e => setCommentIds(old => e.target.checked ? [...old,item.id] : old.filter(id => id !== item.id))} />{item.label}</label>)}</div><label>教室内メモ<textarea value={note} onChange={e => setNote(e.target.value)} placeholder="保護者には表示されません" /></label></section>
      <section><h2>今回出した宿題</h2>{nextItems.map((item,index) => <div className="teacher-homework" key={index}><select value={item.materialId} onChange={e => setNextItems(old => old.map((row,i) => i===index ? {...row,materialId:e.target.value}:row))}><option value="">教材を選択</option>{homeworkData.templates.materials.map(material => <option key={material.id} value={material.id}>{material.label}</option>)}</select><input placeholder="ページ・範囲" value={item.range} onChange={e => setNextItems(old => old.map((row,i) => i===index ? {...row,range:e.target.value}:row))} /></div>)}<button onClick={() => setNextItems(old => [...old,{materialId:'',range:''}])}>＋ 宿題を追加</button><label>確認予定日<input type="date" min={date} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label></section><button className="teacher-save" disabled={saving} onClick={save}>{saving ? '保存中…' : 'この授業記録を保存'}</button></>}
  </main>;
}
