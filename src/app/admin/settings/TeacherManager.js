'use client';
import { useEffect, useState } from 'react';
import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { auth } from '@/firebaseConfig';

async function api(options) {
  const token=await auth.currentUser?.getIdToken();
  const response=await fetch('/api/admin/teachers',{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}});
  const result=await response.json();if(!response.ok)throw new Error(result.error);return result;
}
export default function TeacherManager(){
  const edits=useUnsavedChanges('.teacher-settings');
  const [data,setData]=useState(null),[selected,setSelected]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState('');
  const load=()=>api().then(setData).catch(error=>setNotice(error.message));useEffect(()=>{load()},[]);
  const teacher=data?.teachers.find(item=>item.uid===selected);
  const update=async body=>{setBusy(body.uid);try{await api({method:'PATCH',body:JSON.stringify(body)});edits.markSaved();setNotice(body.action==='approve'?'講師申請を承認しました。':body.action==='reject'?'講師申請を却下しました。':'講師アカウントの状態を保存しました。');await load()}catch(error){setNotice(error.message)}finally{setBusy('')}};
  return <section className="teacher-settings"><h2>講師アカウント</h2><p>講師本人が講師ログイン画面の「講師アカウントを申請」から登録します。申請内容を確認して承認してください。</p>{notice&&<p role="status">{notice}</p>}{data?.pending?.length>0&&<div className="teacher-pending"><h3>承認待ち</h3>{data.pending.map(item=><article key={item.uid}><div><strong>{item.displayName}</strong><small>{item.email}</small></div><button disabled={busy===item.uid} onClick={()=>update({uid:item.uid,action:'approve'})}>承認</button><button disabled={busy===item.uid} onClick={()=>update({uid:item.uid,action:'reject'})}>却下</button></article>)}</div>}{data&&<><label>登録済み講師<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">選択してください</option>{data.teachers.map(item=><option key={item.uid} value={item.uid}>{item.displayName}{item.active===false?'（停止中）':''}</option>)}</select></label>{teacher&&<div><label><input type="checkbox" checked={teacher.active!==false} onChange={e=>setData(current=>({...current,teachers:current.teachers.map(item=>item.uid===selected?{...item,active:e.target.checked}:item)}))}/>ログインを有効にする</label><button disabled={busy===teacher.uid} onClick={()=>update({uid:teacher.uid,active:teacher.active})}>アカウント状態を保存</button></div>}</>}</section>;
}
