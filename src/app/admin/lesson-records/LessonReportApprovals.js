'use client';
import { useEffect,useState } from 'react';
import { auth } from '@/firebaseConfig';

const api=async(options={})=>{const response=await fetch('/api/admin/lesson-reports',{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser?.getIdToken()}`}}),data=await response.json();if(!response.ok)throw new Error(data.error);return data};
export default function LessonReportApprovals(){
  const[items,setItems]=useState([]),[notice,setNotice]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(''),[loading,setLoading]=useState(true);
  const load=()=>{setLoading(true);setError('');return api().then(data=>setItems(data.items||[])).catch(value=>setError(value.message)).finally(()=>setLoading(false))};
  useEffect(()=>{load()},[]);
  const update=(id,text)=>setItems(old=>old.map(item=>`${item.studentKey}_${item.date}`===id?{...item,text}:item));
  const approve=async item=>{const id=`${item.studentKey}_${item.date}`;setBusy(id);setNotice('');try{await api({method:'PATCH',body:JSON.stringify({studentKey:item.studentKey,date:item.date,text:item.text})});setItems(old=>old.filter(row=>`${row.studentKey}_${row.date}`!==id));setNotice(`${item.name}さんの授業報告を承認し、保護者ページへ公開しました。`)}catch(value){setError(value.message)}finally{setBusy('')}};
  return <section className="lesson-report-approvals"><header><div><small>REPORT APPROVAL</small><h2>未承認の授業報告</h2><p>講師が送信した文章を確認・修正してから保護者へ公開します。</p></div><strong>{items.length}<span>件</span></strong></header>{notice&&<p className="approval-notice" role="status">{notice}</p>}{error&&<div className="approval-error" role="alert"><p>{error}</p><button type="button" onClick={load}>再読み込み</button></div>}{loading&&<p className="approval-empty">未承認報告を読み込んでいます…</p>}{!loading&&!error&&items.map(item=>{const id=`${item.studentKey}_${item.date}`;return <article key={id}><header><div><b>{item.name}</b><small>{item.studentKey.startsWith('elementary_')?'小学生':'中学生・高校生'}</small></div><time dateTime={item.date}>{item.date.replaceAll('-',' / ')}</time></header><label>保護者へ公開する授業報告<textarea rows="8" maxLength="2000" value={item.text||''} onChange={event=>update(id,event.target.value)}/><small>{(item.text||'').length} / 2000文字</small></label><footer><span>内容を編集してから承認できます</span><button type="button" disabled={busy===id||!item.text?.trim()} onClick={()=>approve(item)}>{busy===id?'公開中…':'この内容で承認・公開'}</button></footer></article>})}{!loading&&!error&&!items.length&&<div className="approval-empty"><strong>現在、未承認の授業報告はありません</strong><p>講師が授業報告を送信すると、ここに表示されます。</p></div>}</section>;
}
