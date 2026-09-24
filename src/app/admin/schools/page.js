'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';
import './schools.css';

async function api(options={}){const response=await fetch('/api/admin/schools',{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser?.getIdToken()}`}}),data=await response.json();if(!response.ok)throw new Error(data.error);return data}

export default function SchoolsAdmin(){
 const[items,setItems]=useState([]),[query,setQuery]=useState(''),[draftIds,setDraftIds]=useState([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState('');
 const load=()=>api().then(data=>setItems(data.items)).catch(error=>setNotice(error.message));
 useEffect(()=>{load()},[]);
 const patch=(id,value)=>setItems(rows=>rows.map(row=>row.id===id?{...row,...value}:row));
 const add=()=>{const item={id:crypto.randomUUID(),name:'',commuteTime:'',access:'',clubs:'',features:'',website:'',extra:{}};setDraftIds(old=>[...old,item.id]);setItems(old=>[item,...old])};
 const save=async item=>{setBusy(item.id);try{await api({method:'POST',body:JSON.stringify(item)});setDraftIds(old=>old.filter(id=>id!==item.id));setNotice(`${item.name}を保存しました。`);await load()}catch(error){setNotice(error.message)}finally{setBusy('')}};
 const visible=items.filter(item=>draftIds.includes(item.id)||`${item.name||''} ${item.features||''}`.toLocaleLowerCase('ja').includes(query.trim().toLocaleLowerCase('ja')));
 return <main className="schools-admin"><header><small>高校情報</small><h1>高校情報管理</h1><p>志望校判定で使う学校を探し、通学・部活動・特徴を確認または編集します。</p></header>
  {notice&&<p role="status">{notice}</p>}
  <div className="schools-tools"><label>高校名で探す<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="高校名を入力" /></label><button type="button" disabled={draftIds.length>0} onClick={add}>＋ 高校を追加</button></div>
  <section>{visible.map(item=><details key={item.id} defaultOpen={draftIds.includes(item.id)}><summary>{item.name||'新しい高校'}<small>{item.commuteTime||'通学時間未設定'}</small></summary><div><label>高校名<input value={item.name||''} onChange={e=>patch(item.id,{name:e.target.value})}/></label><label>通学時間<input value={item.commuteTime||''} onChange={e=>patch(item.id,{commuteTime:e.target.value})} placeholder="例：教室から約40分"/></label><label>アクセス<textarea value={item.access||''} onChange={e=>patch(item.id,{access:e.target.value})}/></label><label>部活動<textarea value={item.clubs||''} onChange={e=>patch(item.id,{clubs:e.target.value})}/></label><label>特徴<textarea value={item.features||''} onChange={e=>patch(item.id,{features:e.target.value})}/></label><label>Webサイト<input value={item.website||''} onChange={e=>patch(item.id,{website:e.target.value})}/></label><button type="button" disabled={busy===item.id} onClick={()=>save(item)}>{busy===item.id?'保存中…':'この高校を保存'}</button></div></details>)}{!visible.length&&<p>該当する高校はありません。</p>}</section>
 </main>;
}
