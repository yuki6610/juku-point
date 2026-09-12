'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/firebaseConfig';
import './parent.css';

async function parentApi(path) { const token = await auth.currentUser?.getIdToken(); const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } }); const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }
const attendanceLabel = { present: '出席', absent: '欠席', makeup: '振替' };
const SUBJECTS = ['国語','社会','数学','理科','英語'];

export default function ParentPage() {
  const [data,setData]=useState(null),[student,setStudent]=useState(''),[tab,setTab]=useState('lessons'),[lessons,setLessons]=useState(null),[report,setReport]=useState(null),[term,setTerm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(() => onAuthStateChanged(auth, user => { if (!user) location.href='/parent/login'; else parentApi('/api/parent/context').then(value => { setData(value); setStudent(value.children[0]?.key || ''); }).catch(error => setError(error.message)); }), []);
  useEffect(() => {
    if (!student) return undefined;
    let active = true; setError(''); setBusy(true);
    if (tab === 'lessons') {
      setLessons(null);
      parentApi(`/api/parent/lessons?student=${encodeURIComponent(student)}`).then(value => { if (active) setLessons(value); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setBusy(false); });
    } else {
      setReport(null);
      parentApi(`/api/parent/report?student=${encodeURIComponent(student)}`).then(meta => {
        if (!active) return;
        const selected = term && meta.terms.some(item => item.id === term) ? term : (meta.currentTermId && meta.terms.some(item => item.id === meta.currentTermId) ? meta.currentTermId : meta.terms[0]?.id);
        setReport({ ...meta, summary:null, scores:[] }); setTerm(selected || '');
      }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setBusy(false); });
    }
    return () => { active = false; };
  }, [student,tab]);
  useEffect(() => {
    if (tab !== 'report' || !student || !term) return undefined;
    let active = true; setBusy(true);
    parentApi(`/api/parent/report?student=${encodeURIComponent(student)}&term=${term}`).then(value => { if (active) setReport(value); }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [student,tab,term]);
  const more=async()=>{if(!lessons?.next)return;setBusy(true);try{const next=await parentApi(`/api/parent/lessons?student=${encodeURIComponent(student)}&after=${encodeURIComponent(lessons.next)}`);setLessons(old=>({lessons:[...old.lessons,...next.lessons],next:next.next}))}catch(error){setError(error.message)}finally{setBusy(false)}};
  const child=data?.children.find(item=>item.key===student), summary=report?.summary;
  return <main className="parent-shell">
    <header><div><small>PARENT PORTAL</small><h1>保護者ページ</h1><p>{data?`${data.parent.displayName} 様`:'情報を確認しています…'}</p></div><button onClick={()=>signOut(auth).then(()=>location.href='/parent/login')}>ログアウト</button></header>
    {error&&<p className="parent-alert" role="alert">{error}</p>}
    {data&&<>{data.adminPreview&&<p className="parent-alert">管理者プレビューです。小学生・中学生の保護者表示を確認できます。</p>}{data.children.length===0?<section><p>紐付けられた生徒がいません。教室へお問い合わせください。</p></section>:<>
      <nav className="parent-child-switch">{data.children.map(item=><button key={item.key} className={student===item.key?'active':''} onClick={()=>setStudent(item.key)}>{item.name}<small>{item.grade}年</small></button>)}</nav>
      <nav className="parent-tabs"><button className={tab==='lessons'?'active':''} onClick={()=>setTab('lessons')}>授業日の記録</button><button className={tab==='report'?'active':''} onClick={()=>setTab('report')}>学期レポート</button></nav>
      {tab==='lessons'?<LessonRecords child={child} lessons={lessons} busy={busy} more={more}/>:<TermReport child={child} report={report} term={term} setTerm={setTerm} busy={busy}/>} 
    </>}</>}
  </main>;
}

function LessonRecords({child,lessons,busy,more}) { return <section><div className="parent-section-heading"><div><small>LESSON RECORDS</small><h2>{child?.name}さんの授業日の記録</h2></div><span>新しい順</span></div>{busy&&!lessons&&<p>読み込み中…</p>}{lessons&&!lessons.lessons.length&&<p>公開された授業記録はまだありません。</p>}<div className="parent-lessons">{(lessons?.lessons||[]).map(item=><article key={item.date}><header><div><time>{item.date.replaceAll('-',' / ')}</time><strong>{attendanceLabel[item.attendance]||'授業記録'}</strong></div><span>{item.termId?item.termId.replace('_','年度 第')+'学期':''}</span></header><div className="parent-statuses">{item.late&&<span>遅刻</span>}{item.forgot&&<span>忘れ物</span>}{item.wordTest&&['completed','makeup'].includes(item.wordTest.status)&&<span>単語テスト {item.wordTest.correct}/{item.wordTest.total}</span>}</div>{item.reviewedHomework.length>0&&<div className="parent-record-block"><h3>前回の宿題状況</h3>{item.reviewedHomework.map(homework=><div key={homework.id}><p>{homework.review?.date===item.date?homework.review.text:homework.laterCompletion?.text}</p>{homework.items.map(row=><small key={row.id}>{row.materialLabel}：{row.range}</small>)}</div>)}</div>}{item.assignedHomework.length>0&&<div className="parent-record-block current"><h3>今回出された宿題</h3>{item.assignedHomework.map(homework=><div key={homework.id}><p>確認予定日：{homework.dueDate}</p>{homework.items.map(row=><small key={row.id}>{row.materialLabel}：{row.range}</small>)}</div>)}</div>}{item.comments.length>0&&<div className="parent-record-block comment"><h3>授業の様子</h3>{item.comments.map(comment=><p key={comment.id}>{comment.text}</p>)}</div>}</article>)}</div>{lessons?.next&&<button className="parent-more" disabled={busy} onClick={more}>{busy?'読み込み中…':'以前の授業記録を表示'}</button>}</section>; }

function TermReport({child,report,term,setTerm,busy}) { const summary=report?.summary; return <section><div className="parent-section-heading"><div><small>TERM REPORT</small><h2>{child?.name}さんの学期レポート</h2></div><select value={term} onChange={e=>setTerm(e.target.value)}>{(report?.terms||[]).map(item=><option key={item.id} value={item.id}>{item.year}年度 {item.term}学期</option>)}</select></div>{busy&&!summary?<p>集計中…</p>:summary&&<><div className="parent-summary-grid"><Summary title="宿題提出率" value={summary.homework.rate} unit="%" note={`提出 ${summary.homework.submitted}／一部 ${summary.homework.partial}／未実施 ${summary.homework.missed}`}/><Summary title="単語テスト平均" value={summary.wordTest.rate} unit="%" note={`${summary.wordTest.count}回・${summary.wordTest.correct}/${summary.wordTest.total}問`}/><Summary title="授業実施" value={summary.lessons} unit="回" note={`出席 ${summary.attendance.present}／振替 ${summary.attendance.makeup}`}/><Summary title="学習態度" value={summary.attendance.late+summary.forgot} unit="件" note={`遅刻 ${summary.attendance.late}／忘れ物 ${summary.forgot}／欠席 ${summary.attendance.absent}`}/></div><h3 className="parent-score-title">成績</h3>{!report.scores.length?<p>この学期の公開できる成績はありません。</p>:<div className="parent-scores">{report.scores.map(score=><article key={score.id}><header><strong>{score.type==='exam'?score.testType:'内申点'}</strong><span>{score.total}点</span></header><div>{score.type==='exam'?SUBJECTS.map(subject=><span key={subject}>{subject}<strong>{score.subjects[subject]??'—'}</strong></span>):[...Object.entries(score.main),...Object.entries(score.sub)].map(([subject,value])=><span key={subject}>{subject}<strong>{value}</strong></span>)}</div></article>)}</div>}</>}</section>; }
function Summary({title,value,unit,note}) { return <article><span>{title}</span><strong>{value??'—'}<small>{value===null?'':unit}</small></strong><p>{note}</p></article>; }
