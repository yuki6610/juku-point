'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/firebaseConfig';
import './parent.css';

async function parentApi(path) { const token = await auth.currentUser?.getIdToken(); const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } }); const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; }
const attendanceLabel = { present: '出席', absent: '欠席', makeup: '振替' };
const SUBJECTS = ['国語','社会','数学','理科','英語'];
const gradeLabel = value => Number(value)<=6?`小${Number(value)}`:Number(value)<=9?`中${Number(value)-6}`:Number(value)<=12?`高${Number(value)-9}`:'学年未設定';

export default function ParentPage() {
  const [data,setData]=useState(null),[student,setStudent]=useState(''),[tab,setTab]=useState('overview'),[lessons,setLessons]=useState(null),[report,setReport]=useState(null),[term,setTerm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(() => onAuthStateChanged(auth, user => { if (!user) location.href='/parent/login'; else parentApi('/api/parent/context').then(value => { setData(value); setStudent(value.children[0]?.key || ''); }).catch(error => setError(error.message)); }), []);
  useEffect(() => {
    if (!student) return undefined;
    let active = true; setError(''); setBusy(true);
    if (['overview','lessons','homework'].includes(tab)) {
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
  const more=async()=>{if(!lessons?.next)return;setBusy(true);try{const next=await parentApi(`/api/parent/lessons?student=${encodeURIComponent(student)}&after=${encodeURIComponent(lessons.next)}`);setLessons(old=>({...old,lessons:[...old.lessons,...next.lessons],next:next.next}))}catch(error){setError(error.message)}finally{setBusy(false)}};
  const child=data?.children.find(item=>item.key===student), summary=report?.summary;
  return <main className="parent-shell">
    <header><div><small>PARENT PORTAL</small><h1>保護者ページ</h1><p>{data?`${data.parent.displayName} 様`:'情報を確認しています…'}</p></div><button onClick={()=>signOut(auth).then(()=>location.href='/parent/login')}>ログアウト</button></header>
    {error&&<p className="parent-alert" role="alert">{error}</p>}
    {data&&<>{data.adminPreview&&<p className="parent-alert">管理者プレビューです。小学生・中学生の保護者表示を確認できます。</p>}{data.children.length===0?<section><p>紐付けられた生徒がいません。教室へお問い合わせください。</p></section>:<>
      <nav className="parent-child-switch">{data.children.map(item=><button key={item.key} className={student===item.key?'active':''} onClick={()=>setStudent(item.key)}>{item.name}<small>{gradeLabel(item.grade)}</small></button>)}</nav>
      <nav className="parent-tabs"><button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>概要</button><button className={tab==='homework'?'active':''} onClick={()=>setTab('homework')}>宿題</button><button className={tab==='lessons'?'active':''} onClick={()=>setTab('lessons')}>授業記録</button><button className={tab==='report'?'active':''} onClick={()=>setTab('report')}>学期レポート</button></nav>
      {tab==='overview'&&<ParentOverview child={child} lessons={lessons} busy={busy} go={setTab}/>}
      {tab==='homework'&&<HomeworkRecords child={child} homework={lessons?.homework} busy={busy}/>}
      {tab==='lessons'&&<LessonRecords child={child} lessons={lessons} busy={busy} more={more}/>}
      {tab==='report'&&<TermReport child={child} report={report} term={term} setTerm={setTerm} busy={busy}/>}
    </>}</>}
  </main>;
}

const homeworkStatus = { submitted:'すべて提出', partial:'一部未完了', missed:'未提出', absent:'欠席・未確認', laterCompleted:'後日完了' };
function ParentOverview({child,lessons,busy,go}) {
  const homework=lessons?.homework||[], pending=homework.filter(item=>!item.review||['pending','absent'].includes(item.review.status)), latest=lessons?.lessons?.[0];
  return <section className="parent-overview"><div className="parent-section-heading"><div><small>OVERVIEW</small><h2>{child?.name}さんの学習状況</h2></div><span>最新情報</span></div>{busy&&!lessons?<p>読み込み中…</p>:<><div className="parent-overview-grid"><article><span>確認待ちの宿題</span><strong>{pending.length}<small>件</small></strong><button onClick={()=>go('homework')}>宿題を確認</button></article><article><span>最新の授業記録</span><strong className="overview-date">{latest?.date?.replaceAll('-',' / ')||'記録なし'}</strong><button onClick={()=>go('lessons')}>授業記録を見る</button></article><article><span>学期の成績・態度</span><strong className="overview-date">学期別に集計</strong><button onClick={()=>go('report')}>レポートを見る</button></article></div><div className="parent-guide"><strong>このページで確認できること</strong><p>今回の宿題、前回の提出状況、授業中の様子、学期ごとの成績と学習状況を確認できます。</p></div></>}</section>;
}

function HomeworkRecords({child,homework,busy}) {
  return <section><div className="parent-section-heading"><div><small>HOMEWORK</small><h2>{child?.name}さんの宿題</h2></div><span>新しい順</span></div>{busy&&!homework?<p>読み込み中…</p>:homework&&!homework.length?<p>公開された宿題はまだありません。</p>:<div className="parent-homework-list">{(homework||[]).map(item=><article key={item.id} className={!item.review||['pending','absent'].includes(item.review.status)?'pending':''}><header><div><small>指示日 {item.assignedDate||'—'}</small><strong>確認予定 {item.dueDate||'未設定'}</strong></div><span>{homeworkStatus[item.laterCompletion?.status||item.review?.status]||'確認待ち'}</span></header><div>{(item.items||[]).map(row=><p key={row.id}><strong>{row.materialLabel}</strong><span>{row.range}</span></p>)}</div>{item.review?.text&&<footer>{item.review.text}</footer>}</article>)}</div>}</section>;
}

function LessonRecords({child,lessons,busy,more}) { return <section><div className="parent-section-heading"><div><small>LESSON RECORDS</small><h2>{child?.name}さんの授業日の記録</h2></div><span>新しい順</span></div>{busy&&!lessons&&<p>読み込み中…</p>}{lessons&&!lessons.lessons.length&&<p>公開された授業記録はまだありません。</p>}<div className="parent-lessons">{(lessons?.lessons||[]).map(item=><article key={item.date}><header><div><time>{item.date.replaceAll('-',' / ')}</time><strong>{attendanceLabel[item.attendance]||'授業記録'}</strong></div><span>{item.termId?item.termId.replace('_','年度 第')+'学期':''}</span></header><div className="parent-statuses">{item.late&&<span>遅刻</span>}{item.forgot&&<span>忘れ物</span>}{item.wordTest&&['completed','makeup'].includes(item.wordTest.status)&&<span>単語テスト {item.wordTest.correct}/{item.wordTest.total}</span>}</div>{item.reviewedHomework.length>0&&<div className="parent-record-block"><h3>前回の宿題状況</h3>{item.reviewedHomework.map(homework=><div key={homework.id}><p>{homework.review?.date===item.date?homework.review.text:homework.laterCompletion?.text}</p>{homework.items.map(row=><small key={row.id}>{row.materialLabel}：{row.range}</small>)}</div>)}</div>}{item.assignedHomework.length>0&&<div className="parent-record-block current"><h3>今回出された宿題</h3>{item.assignedHomework.map(homework=><div key={homework.id}><p>確認予定日：{homework.dueDate}</p>{homework.items.map(row=><small key={row.id}>{row.materialLabel}：{row.range}</small>)}</div>)}</div>}{item.comments.length>0&&<div className="parent-record-block comment"><h3>授業の様子</h3>{item.comments.map(comment=><p key={comment.id}>{comment.text}</p>)}</div>}</article>)}</div>{lessons?.next&&<button className="parent-more" disabled={busy} onClick={more}>{busy?'読み込み中…':'以前の授業記録を表示'}</button>}</section>; }

function TermReport({child,report,term,setTerm,busy}) { const summary=report?.summary; return <section><div className="parent-section-heading"><div><small>TERM REPORT</small><h2>{child?.name}さんの学期レポート</h2></div><select value={term} onChange={e=>setTerm(e.target.value)}>{(report?.terms||[]).map(item=><option key={item.id} value={item.id}>{item.year}年度 {item.term}学期</option>)}</select></div>{busy&&!summary?<p>集計中…</p>:summary&&<><div className="parent-summary-grid"><Summary title="宿題提出率" value={summary.homework.rate} unit="%" note={`提出 ${summary.homework.submitted}／一部 ${summary.homework.partial}／未実施 ${summary.homework.missed}`}/><Summary title="単語テスト平均" value={summary.wordTest.rate} unit="%" note={`${summary.wordTest.count}回・${summary.wordTest.correct}/${summary.wordTest.total}問`}/><Summary title="授業実施" value={summary.lessons} unit="回" note={`出席 ${summary.attendance.present}／振替 ${summary.attendance.makeup}`}/><Summary title="学習態度" value={summary.attendance.late+summary.forgot} unit="件" note={`遅刻 ${summary.attendance.late}／忘れ物 ${summary.forgot}／欠席 ${summary.attendance.absent}`}/></div><h3 className="parent-score-title">成績</h3>{!report.scores.length?<p>この学期の公開できる成績はありません。</p>:<div className="parent-scores">{report.scores.map(score=><article key={score.id}><header><strong>{score.type==='exam'?score.testType:'内申点'}</strong><span>{score.total}点</span></header><div>{score.type==='exam'?SUBJECTS.map(subject=><span key={subject}>{subject}<strong>{score.subjects[subject]??'—'}</strong></span>):[...Object.entries(score.main),...Object.entries(score.sub)].map(([subject,value])=><span key={subject}>{subject}<strong>{value}</strong></span>)}</div></article>)}</div>}</>}</section>; }
function Summary({title,value,unit,note}) { return <article><span>{title}</span><strong>{value??'—'}<small>{value===null?'':unit}</small></strong><p>{note}</p></article>; }
