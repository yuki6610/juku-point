'use client';
import { useEffect,useMemo,useState } from 'react';
import { auth } from '@/firebaseConfig';
import { SCORE_TEST_TYPES } from '@/lib/scoreSubmissionPlan.mjs';

const gradeLabel=value=>`中${Number(value)-6}`;
const empty=year=>({id:'',termId:`${year}_1`,schoolName:'',grade:7,kind:'exam',testType:'中間',date:`${year}-04-01`});

export default function ScoreSubmissionCalendar({academic,onChanged}){
  const [year,setYear]=useState(''),[entries,setEntries]=useState([]),[schools,setSchools]=useState([]),[draft,setDraft]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[month,setMonth]=useState('');
  const years=academic.settings.map(item=>String(item.year)).sort((a,b)=>b.localeCompare(a));
  useEffect(()=>{if(!year&&academic.current)setYear(String(academic.current.year))},[academic.current,year]);
  const api=async(path,options={})=>{const token=await auth.currentUser?.getIdToken(),response=await fetch(path,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}}),result=await response.json();if(!response.ok)throw new Error(result.error);return result};
  const load=async()=>{if(!year)return;setBusy(true);try{const value=await api(`/api/admin/score-submission-calendar?year=${year}`);setEntries(value.entries);setSchools(value.schools);setDraft(current=>current&&String(current.termId).startsWith(`${year}_`)?current:empty(year));if(!month)setMonth(academic.current?.year===Number(year)?academic.date.slice(0,7):`${year}-04`)}catch(error){setNotice(error.message)}finally{setBusy(false)}};
  useEffect(()=>{load()},[year]);
  const save=async()=>{if(!draft||busy)return;setBusy(true);try{await api('/api/admin/score-submission-calendar',{method:'POST',body:JSON.stringify({year,...draft})});setNotice('提出予定を保存しました。');setDraft(empty(year));await load();onChanged?.()}catch(error){setNotice(error.message)}finally{setBusy(false)}};
  const disable=async entry=>{if(busy||!window.confirm('この提出予定を一覧から外しますか？'))return;setBusy(true);try{await api('/api/admin/score-submission-calendar',{method:'POST',body:JSON.stringify({year,id:entry.id,action:'disable'})});await load();onChanged?.()}catch(error){setNotice(error.message)}finally{setBusy(false)}};
  const months=useMemo(()=>Array.from({length:12},(_,i)=>{const base=Number(year),calendarMonth=i+4;return calendarMonth<=12?`${base}-${String(calendarMonth).padStart(2,'0')}`:`${base+1}-${String(calendarMonth-12).padStart(2,'0')}`}),[year]);
  const monthEntries=entries.filter(item=>item.date?.startsWith(month));
  return <section className="submission-calendar-manager"><div className="submission-heading"><div><h2>学校別・学年別 提出カレンダー</h2><p>テストと通知表の提出予定日を登録すると、該当する生徒の提出チェックと保護者画面へ反映されます。</p></div><select value={year} onChange={e=>{setYear(e.target.value);setMonth(`${e.target.value}-04`)}}>{years.map(value=><option key={value}>{value}</option>)}</select></div>
    {notice&&<p role="status">{notice}</p>}
    {draft&&<div className="submission-plan-form"><label>学期<select value={draft.termId} onChange={e=>setDraft({...draft,termId:e.target.value})}>{[1,2,3].map(term=><option key={term} value={`${year}_${term}`}>{term}学期</option>)}</select></label><label>学校<input list="submission-schools" placeholder="空欄なら全学校" value={draft.schoolName} onChange={e=>setDraft({...draft,schoolName:e.target.value})}/><datalist id="submission-schools">{schools.map(value=><option key={value} value={value}/>)}</datalist></label><label>学年<select value={draft.grade} onChange={e=>setDraft({...draft,grade:Number(e.target.value)})}>{[7,8,9].map(value=><option key={value} value={value}>{gradeLabel(value)}</option>)}</select></label><label>資料<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value,testType:e.target.value==='exam'?'中間':''})}><option value="exam">テスト</option><option value="internal">通知表</option></select></label>{draft.kind==='exam'&&<label>テスト種類<select value={draft.testType} onChange={e=>setDraft({...draft,testType:e.target.value})}>{SCORE_TEST_TYPES.map(value=><option key={value}>{value}</option>)}</select></label>}<label>提出予定日<input type="date" value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label><button disabled={busy} onClick={save}>{draft.id?'変更を保存':'予定を追加'}</button>{draft.id&&<button onClick={()=>setDraft(empty(year))}>編集をやめる</button>}</div>}
    <div className="submission-month-tabs">{months.map(value=><button key={value} className={month===value?'active':''} onClick={()=>setMonth(value)}>{Number(value.slice(5))}月</button>)}</div>
    {busy&&!entries.length?<p>読み込み中…</p>:<div className="submission-calendar-list">{monthEntries.length?monthEntries.map(item=><article key={item.id}><time>{item.date.replaceAll('-',' / ')}</time><div><strong>{item.kind==='exam'?item.testType:'通知表'}</strong><span>{item.schoolName||'全学校'}・{gradeLabel(item.grade)}・{item.termId.split('_')[1]}学期</span></div><button onClick={()=>setDraft({...item})}>編集</button><button className="danger" onClick={()=>disable(item)}>削除</button></article>):<p>この月の提出予定はありません。</p>}</div>}
  </section>;
}
