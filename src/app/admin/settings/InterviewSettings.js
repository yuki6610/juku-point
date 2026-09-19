'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';
import './interview-settings.css';

const blankPeriod={name:'保護者面談',startDate:'',endDate:'',active:true};
const blankSlot={periodId:'',date:'',startTime:'',endTime:''};

export default function InterviewSettings(){
  const [data,setData]=useState(null),[period,setPeriod]=useState(blankPeriod),[slot,setSlot]=useState(blankSlot),[notice,setNotice]=useState('');
  const api=async(options={})=>{const response=await fetch('/api/admin/family-services',{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser?.getIdToken()}`}}),result=await response.json();if(!response.ok)throw new Error(result.error);return result};
  const load=()=>api().then(value=>{setData(value);if(!slot.periodId&&value.periods[0])setSlot(old=>({...old,periodId:value.periods[0].id}))}).catch(error=>setNotice(error.message));
  useEffect(()=>{load()},[]);
  const save=async body=>{try{await api({method:'POST',body:JSON.stringify(body)});setNotice('保存しました。');await load()}catch(error){setNotice(error.message)}};
  const remove=async(type,id)=>{if(!confirm('削除しますか？'))return;const token=await auth.currentUser?.getIdToken(),response=await fetch(`/api/admin/family-services?type=${type}&id=${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}}),result=await response.json();setNotice(response.ok?'削除しました。':result.error);if(response.ok)load()};
  const name=key=>data?.students.find(item=>item.key===key)?.name||key;
  return <section className="interview-settings"><header><div><small>INTERVIEW BOOKING</small><h2>保護者面談予約</h2></div><p>予約枠は保護者が選択した瞬間に排他確保されます。</p></header>{notice&&<p role="status">{notice}</p>}
    <div className="interview-admin-grid"><form onSubmit={e=>{e.preventDefault();save({action:'saveInterviewPeriod',...period})}}><h3>面談期間</h3><label>名称<input value={period.name} onChange={e=>setPeriod({...period,name:e.target.value})}/></label><label>開始日<input type="date" value={period.startDate} onChange={e=>setPeriod({...period,startDate:e.target.value})}/></label><label>終了日<input type="date" value={period.endDate} onChange={e=>setPeriod({...period,endDate:e.target.value})}/></label><button>期間を追加</button></form><form onSubmit={e=>{e.preventDefault();save({action:'saveInterviewSlot',...slot})}}><h3>予約可能枠</h3><label>面談期間<select value={slot.periodId} onChange={e=>setSlot({...slot,periodId:e.target.value})}><option value="">選択</option>{(data?.periods||[]).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>日付<input type="date" value={slot.date} onChange={e=>setSlot({...slot,date:e.target.value})}/></label><div><label>開始<input type="time" value={slot.startTime} onChange={e=>setSlot({...slot,startTime:e.target.value})}/></label><label>終了<input type="time" value={slot.endTime} onChange={e=>setSlot({...slot,endTime:e.target.value})}/></label></div><button>予約枠を追加</button></form></div>
    <div className="interview-periods">{(data?.periods||[]).sort((a,b)=>a.startDate.localeCompare(b.startDate)).map(item=><article key={item.id}><header><div><strong>{item.name}</strong><small>{item.startDate}〜{item.endDate}</small></div><button onClick={()=>remove('period',item.id)}>期間を削除</button></header><div>{(data?.slots||[]).filter(row=>row.periodId===item.id).sort((a,b)=>`${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)).map(row=><p key={row.id}><time>{row.date} {row.startTime}〜{row.endTime}</time><b>{row.reservationId?`${name(row.studentKey)} 予約済み`:'空き'}</b>{!row.reservationId&&<button onClick={()=>remove('slot',row.id)}>削除</button>}</p>)}</div></article>)}</div>
  </section>;
}
