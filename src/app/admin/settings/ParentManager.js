'use client';
import {useEffect,useState} from 'react';
import {useUnsavedChanges} from '@/lib/useUnsavedChanges';
import {auth} from '@/firebaseConfig';
import InviteIssuer from '@/components/InviteIssuer';

async function api(options){const response=await fetch('/api/admin/parents',{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${await auth.currentUser?.getIdToken()}`}}),result=await response.json();if(!response.ok)throw new Error(result.error);return result}
export default function ParentManager(){
  const edits=useUnsavedChanges('.parent-settings');
  const[data,setData]=useState(null),[selected,setSelected]=useState(''),[notice,setNotice]=useState(''),[inviteChildren,setInviteChildren]=useState([]);
  const load=()=>api().then(setData).catch(error=>setNotice(error.message));useEffect(()=>{load()},[]);const parent=data?.parents.find(item=>item.uid===selected),inviteStudents=data?.inviteStudents||data?.students||[];
  const changeParent=value=>setData(current=>({...current,parents:current.parents.map(item=>item.uid===selected?{...item,...value}:item)}));
  const toggle=key=>changeParent({childKeys:parent.childKeys.includes(key)?parent.childKeys.filter(value=>value!==key):[...parent.childKeys,key]});
  const save=async()=>{try{await api({method:'PATCH',body:JSON.stringify({uid:parent.uid,active:parent.active,childKeys:parent.childKeys})});edits.markSaved();setNotice('保護者情報を個別保存しました。');await load()}catch(error){setNotice(error.message)}};
  return <section className="teacher-settings parent-settings"><h2>保護者アカウント・子どもの紐付け</h2><p>未紐付けの生徒を選び、期限付き・1回限りの招待QRを発行します。</p>{notice&&<p role="status">{notice}</p>}{data&&<><p><strong>招待に紐付ける生徒</strong></p><div className="parent-child-grid invite-children">{inviteStudents.map(student=><label key={student.key}><input type="checkbox" checked={inviteChildren.includes(student.key)} onChange={()=>setInviteChildren(old=>old.includes(student.key)?old.filter(key=>key!==student.key):[...old,student.key])}/><span>{student.name}</span></label>)}{!inviteStudents.length&&<p>未紐付けの生徒はいません。</p>}</div><InviteIssuer role="parent" title="保護者" childKeys={inviteChildren} disabled={!inviteChildren.length} onIssued={()=>setInviteChildren([])} /><label>登録済み保護者<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">選択してください</option>{data.parents.map(item=><option key={item.uid} value={item.uid}>{item.displayName}{item.active===false?'（停止中）':''}</option>)}</select></label>{parent&&<div className="parent-account-editor"><label><input type="checkbox" checked={parent.active!==false} onChange={e=>changeParent({active:e.target.checked})}/>ログインを有効にする</label><div className="parent-child-grid">{data.students.map(student=><label key={student.key}><input type="checkbox" checked={parent.childKeys.includes(student.key)} onChange={()=>toggle(student.key)}/><span>{student.name}</span></label>)}</div><button onClick={save}>この保護者だけ保存</button></div>}</>}</section>;
}
