'use client';
import { useEffect,useState } from 'react';import { auth } from '@/firebaseConfig';import './referrals.css';
const LABELS={applied:'申込',trial:'体験授業',enrolled:'入会',benefitPending:'特典付与待ち',delivered:'商品券付与済み'};async function api(options={}){const response=await fetch('/api/admin/referrals',{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser?.getIdToken()}`}}),data=await response.json();if(!response.ok)throw new Error(data.error);return data}
export default function Referrals(){
 const[items,setItems]=useState([]),[filter,setFilter]=useState('active'),[notice,setNotice]=useState(''),[busy,setBusy]=useState('');
 const load=()=>api().then(data=>setItems(data.items.map(item=>({...item,savedStatus:item.status})))).catch(error=>setNotice(error.message));
 useEffect(()=>{load()},[]);
 const patch=(id,value)=>setItems(rows=>rows.map(row=>row.id===id?{...row,...value}:row));
 const save=async item=>{setBusy(item.id);try{await api({method:'PATCH',body:JSON.stringify(item)});setNotice('紹介状況を保存しました。');await load()}catch(error){setNotice(error.message)}finally{setBusy('')}};
 const visible=items.filter(item=>filter==='all'||filter==='active'&&item.savedStatus!=='delivered'||item.savedStatus===filter);
 return <main className="referrals-admin"><header><small>友人紹介</small><h1>紹介の進捗</h1><p>申込・体験・入会を確認し、商品券の付与まで管理します。</p></header>
  {notice&&<p role="status">{notice}</p>}
  <nav aria-label="紹介の状態で絞り込み">{[['active','対応中'],['benefitPending','特典付与待ち'],['delivered','付与済み'],['all','すべて']].map(([id,label])=><button type="button" key={id} className={filter===id?'active':''} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}（{items.filter(item=>id==='all'||id==='active'&&item.savedStatus!=='delivered'||item.savedStatus===id).length}）</button>)}</nav>
  <section>{visible.map(item=><article key={item.id}><header><div><strong>{item.friendName}</strong><small>紹介者：{item.referrerName}</small></div><b>{LABELS[item.status]}</b></header><p>連絡先：{item.contact}</p>{item.note&&<p>{item.note}</p>}<div><label>状態<select value={item.status} onChange={e=>patch(item.id,{status:e.target.value})}>{Object.entries(LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>入会日<input type="date" value={item.enrolledAt||''} onChange={e=>patch(item.id,{enrolledAt:e.target.value})}/></label><label>管理メモ<input value={item.adminNote||''} onChange={e=>patch(item.id,{adminNote:e.target.value})}/></label></div>{item.benefitDueDate&&<p>特典付与予定：<strong>{item.benefitDueDate}</strong></p>}<button type="button" disabled={busy===item.id} onClick={()=>save(item)}>{busy===item.id?'保存中…':'この案件を保存'}</button></article>)}{!visible.length&&<p>該当する紹介案件はありません。</p>}</section>
 </main>;
}
