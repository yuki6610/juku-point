'use client';
import { useEffect, useMemo, useState } from 'react';
import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { auth } from '@/firebaseConfig';
import './student-notes.css';

const gradeLabel = value => value <= 6 ? `小${value}` : value <= 9 ? `中${value-6}` : `高${value-9}`;
const fields = [
  ['schoolName','学校名'],['targetSchool','志望校'],['memo','生徒メモ'],['materials','教材'],
  ['courseMaterials','講習教材'],
];

export default function StudentNotesPage(){
  const edits=useUnsavedChanges('.student-sheet');
  const [rows,setRows]=useState([]),[search,setSearch]=useState(''),[grade,setGrade]=useState('all'),[notice,setNotice]=useState(''),[saving,setSaving]=useState('');
  const token=async()=>auth.currentUser?.getIdToken();
  const load=async()=>{if(!edits.confirmDiscard())return;edits.markSaved();setNotice('');try{const response=await fetch('/api/admin/student-notes',{headers:{Authorization:`Bearer ${await token()}`}}),data=await response.json();if(!response.ok)throw new Error(data.error);setRows(data.rows||[])}catch(error){setNotice(error.message)}};
  useEffect(()=>{load()},[]);
  const shown=useMemo(()=>rows.filter(row=>(grade==='all'||String(row.grade)===grade)&&(!search||`${row.name} ${row.schoolName} ${row.targetSchool} ${row.memo} ${row.teacherMemo}`.toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>a.grade-b.grade||a.name.localeCompare(b.name,'ja')),[rows,search,grade]);
  const update=(key,field,value)=>setRows(old=>old.map(row=>row.key===key?{...row,[field]:value}:row));
  const save=async row=>{setSaving(row.key);setNotice('');try{const response=await fetch('/api/admin/student-notes',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await token()}`},body:JSON.stringify(row)}),data=await response.json();if(!response.ok)throw new Error(data.error);setRows(old=>old.map(item=>item.key===row.key?{...item,version:data.version}:item));setNotice(`${row.name}さんのメモを保存しました。`)}catch(error){setNotice(error.message)}finally{setSaving('')}};
  return <main className="notes-page">
    <header className="notes-head"><div><span>STUDENT SHEET</span><h1>生徒メモ</h1><p>一覧を見ながら直接編集できます。講師が学習記録へ入力した教室内メモも右端に反映されます。</p></div><button onClick={load}>最新に更新</button></header>
    <section className="notes-tools"><input type="search" placeholder="名前・学校・メモを検索" value={search} onChange={e=>setSearch(e.target.value)}/><select value={grade} onChange={e=>setGrade(e.target.value)}><option value="all">全学年</option>{Array.from({length:12},(_,i)=>i+1).map(value=><option key={value} value={value}>{gradeLabel(value)}</option>)}</select><strong>{shown.length}人</strong></section>
    {notice&&<p className="notes-notice" role="status">{notice}</p>}
    <div className="sheet-wrap"><table className="student-sheet"><thead><tr><th>No.</th><th>氏名</th><th>学年</th>{fields.map(([,label])=><th key={label}>{label}</th>)}<th>講師の教室内メモ</th><th>保存</th></tr></thead><tbody>{shown.map((row,index)=><tr key={row.key}><td>{index+1}</td><th>{row.name}</th><td>{gradeLabel(row.grade)}</td>{fields.map(([field])=><td key={field}><textarea disabled={saving===row.key} aria-label={`${row.name} ${field}`} rows={field==='memo'?3:2} value={row[field]||''} onChange={e=>update(row.key,field,e.target.value)}/></td>)}<td className="teacher-note"><p>{row.teacherMemo||'記録なし'}</p>{row.teacherMemoDate&&<small>{row.teacherMemoDate}</small>}</td><td><button disabled={saving===row.key} onClick={()=>save(row)}>{saving===row.key?'保存中':'保存'}</button></td></tr>)}</tbody></table></div>
  </main>
}
