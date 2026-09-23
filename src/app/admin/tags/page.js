'use client';
import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/firebaseConfig';
import './tags.css';

const LABELS={spring_course:'春期講習',summer_course:'夏期講習',winter_course:'冬期講習',past_exam:'公立過去問',exam_private:'私立入試',exam_recommendation:'公立推薦',exam_general:'公立一般'};
async function api(options={}){const response=await fetch('/api/admin/tags',{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser?.getIdToken()}`}}),data=await response.json();if(!response.ok)throw new Error(data.error);return data}

export default function Tags(){
  const [data,setData]=useState(null),[target,setTarget]=useState('students'),[tag,setTag]=useState('垂水中'),[ids,setIds]=useState([]),[grade,setGrade]=useState('all'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>api().then(setData).catch(error=>setNotice(error.message));
  useEffect(()=>{load()},[]);
  useEffect(()=>setIds([]),[target,tag,grade]);
  const available=(data?.presets||[]).filter(value=>target==='students'||!(data?.courseTags||[]).includes(value));
  useEffect(()=>{if(available.length&&!available.includes(tag))setTag(available[0])},[target,data]);
  const grades=useMemo(()=>[...new Set((data?.students||[]).map(row=>row.grade).filter(Boolean))].sort((a,b)=>a-b),[data]);
  const rows=useMemo(()=>{const source=data?.[target]||[];return target==='students'&&grade!=='all'?source.filter(row=>String(row.grade)===grade):source},[data,target,grade]);
  const selectTag=value=>{const next=value.trim();if(!next)return;setTag(next);if(!available.includes(next))setData(old=>old?{...old,presets:[...(old.presets||[]),next]}:old)};
  const save=async enabled=>{setBusy(true);try{await api({method:'POST',body:JSON.stringify({target,tag,ids,enabled})});setNotice(`${ids.length}人のタグを更新しました。`);setIds([]);await load()}catch(error){setNotice(error.message)}finally{setBusy(false)}};
  return <main className="tag-admin"><header><small>GROUP TAGS</small><h1>タグ一括管理</h1><p>学年で絞り込んだ生徒・保護者に、タグをまとめて付与または解除します。任意タグはタグマスターへ保存されます。</p></header>{notice&&<p role="status">{notice}</p>}<div className="tag-controls"><select value={target} onChange={e=>setTarget(e.target.value)}><option value="students">生徒</option><option value="parents">保護者</option></select>{target==='students'&&<select aria-label="学年で絞り込み" value={grade} onChange={e=>setGrade(e.target.value)}><option value="all">全学年</option>{grades.map(value=><option key={value} value={value}>{value<=6?`小${value}`:value<=9?`中${value-6}`:`高${value-9}`}</option>)}</select>}<select value={tag} onChange={e=>selectTag(e.target.value)}>{available.map(value=><option key={value} value={value}>{LABELS[value]||value}</option>)}</select><input aria-label="任意タグ" placeholder="任意タグを直接入力" onBlur={e=>selectTag(e.target.value)}/></div><div className="tag-people">{rows.map(row=><label className={row.tags.includes(tag)?'has-tag':''} key={row.id}><input type="checkbox" checked={ids.includes(row.id)} onChange={()=>setIds(old=>old.includes(row.id)?old.filter(id=>id!==row.id):[...old,row.id])}/><span><strong>{row.name}</strong><small>{row.tags.length?row.tags.map(value=>LABELS[value]||value).join('・'):'タグなし'}</small></span></label>)}{!rows.length&&<p>該当する対象者はいません。</p>}</div><footer><span>{ids.length}人選択中</span><button disabled={busy||!ids.length} onClick={()=>save(true)}>まとめて付与</button><button disabled={busy||!ids.length} onClick={()=>save(false)}>まとめて解除</button></footer></main>;
}
