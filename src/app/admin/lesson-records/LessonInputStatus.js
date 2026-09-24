'use client';
import { useEffect,useMemo,useState } from 'react';
import { auth } from '@/firebaseConfig';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(new Date());
export default function LessonInputStatus(){
  const[date,setDate]=useState(today()),[data,setData]=useState(null),[filter,setFilter]=useState('action'),[showList,setShowList]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;setData(null);setError('');setShowList(false);auth.currentUser?.getIdToken().then(token=>fetch(`/api/teacher/context?date=${date}`,{headers:{Authorization:`Bearer ${token}`}})).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.error);if(active)setData(value)}).catch(error=>{if(active)setError(error.message)});return()=>{active=false}},[date]);
  const rows=useMemo(()=>{if(!data)return[];return data.students.filter(item=>item.scheduled).map(item=>{const saved=data.inputStatus?.[item.key],draft=data.draftStatus?.[item.key],missingFields=saved?.missingFields?.length?saved.missingFields:draft?.missingFields||[],state=saved?(missingFields.length?'incomplete':'saved'):draft?.missingFields?.length?'incomplete':draft?'draft':'missing';return{...item,state,missingFields}}).filter(item=>filter==='all'||filter==='action'&&item.state!=='saved'||filter===item.state)},[data,filter]);
  const counts=useMemo(()=>{const rows=(data?.students||[]).filter(item=>item.scheduled).map(item=>{const saved=data.inputStatus?.[item.key],draft=data.draftStatus?.[item.key];return saved?(saved.missingFields?.length?'incomplete':'saved'):draft?(draft.missingFields?.length?'incomplete':'draft'):'missing'});return{all:rows.length,saved:rows.filter(value=>value==='saved').length,draft:rows.filter(value=>value==='draft').length,missing:rows.filter(value=>value==='missing').length,incomplete:rows.filter(value=>value==='incomplete').length}},[data]);
  const selectFilter=value=>{setFilter(value);setShowList(true)};
  return <section className="lesson-input-status">
    <header>
      <div><small>DAILY INPUT STATUS</small><h2>授業の入力状況</h2></div>
      <div className="lesson-status-header-actions">
        <input type="date" aria-label="入力状況の日付" value={date} onChange={e=>setDate(e.target.value)}/>
        <button type="button" className="lesson-status-toggle" aria-expanded={showList} onClick={()=>{setFilter('all');setShowList(value=>!value)}}>{showList?'一覧を閉じる':`全${counts.all}件を見る`}</button>
      </div>
    </header>
    {error&&<p role="alert" className="lesson-status-error">{error}</p>}
    <div className="lesson-status-counts">
      {[
        ['action',counts.missing+counts.draft+counts.incomplete,'要対応'],
        ['missing',counts.missing,'未入力'],
        ['draft',counts.draft,'一時保存'],
        ['incomplete',counts.incomplete,'必須不足'],
        ['saved',counts.saved,'保存済み'],
      ].map(([key,count,label])=><button key={key} type="button" aria-pressed={showList&&filter===key} onClick={()=>selectFilter(key)}><strong>{count}</strong><span>{label}</span></button>)}
    </div>
    {!data&&!error&&<p>入力状況を読み込み中…</p>}
    {showList&&data&&<div className="lesson-status-list">{rows.map(item=><button key={item.key} type="button" onClick={()=>location.assign(`/admin/lesson-records?student=${encodeURIComponent(item.key)}&date=${date}${item.state==='draft'||item.state==='incomplete'?'&draft=1':''}`)}><span><strong>{item.name}</strong><small>{item.lessonStartTime||'時刻未設定'}{item.lessonSubject?`・${item.lessonSubject}`:''}</small></span><b data-state={item.state}>{item.state==='saved'?'保存済み':item.state==='missing'?'未入力':item.state==='incomplete'?`不足：${item.missingFields.join('・')}`:'一時保存'}</b></button>)}{!rows.length&&<p>{counts.all?'この条件に該当する授業はありません。':'この日に予定されている授業はありません。'}</p>}</div>}
  </section>;
}
