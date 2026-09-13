'use client';
import { useUnsavedChanges } from '@/lib/useUnsavedChanges';
import { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/firebaseConfig';
import { useAcademicContext } from '@/lib/useAcademicContext';

const EXAMS = [
  ['private','私立入試'],
  ['recommendation','公立推薦'],
  ['general','公立一般'],
];

export default function ExamSettings() {
  const edits=useUnsavedChanges('.exam-settings-panel');
  const academic = useAcademicContext();
  const [year,setYear]=useState(''),[years,setYears]=useState({}),[dates,setDates]=useState({}),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  useEffect(()=>{ if(academic.current&&!year)setYear(String(academic.current.year)); },[academic.current,year]);
  useEffect(()=>{ getDoc(doc(db,'admin_data','examDates')).then(snap=>{const value=snap.data()?.years||{};setYears(value);const selected=year||String(academic.current?.year||'');setDates(value[selected]||{});}).catch(()=>setNotice('入試日を読み込めませんでした。')); },[]);
  useEffect(()=>{ if(year)setDates(years[year]||{}); },[year,years]);
  const save=async()=>{if(!year||EXAMS.some(([id])=>!dates[id]))return setNotice('3種類の入試日を入力してください。');setSaving(true);try{const next={...years,[year]:dates};await setDoc(doc(db,'admin_data','examDates'),{years:next,updatedAt:serverTimestamp(),updatedBy:auth.currentUser?.uid||null},{merge:true});setYears(next);edits.markSaved();setNotice(`${year}年度の入試日を保存しました。`);}catch{setNotice('入試日を保存できませんでした。');}finally{setSaving(false)}};
  return <section className="exam-settings-panel"><header><span>EXAM COUNTDOWN</span><h2>中学3年生の入試日</h2><p>年度ごとに3つの日程を設定します。タグがない中3生には、すべてのカウントダウンを表示します。</p></header>
    {notice&&<p role="status">{notice}</p>}
    <label className="exam-year">対象年度<select value={year} onChange={e=>setYear(e.target.value)}>{[...new Set([...(academic.settings||[]).map(item=>String(item.year)),year].filter(Boolean))].sort().map(value=><option key={value} value={value}>{value}年度</option>)}</select></label>
    <div className="exam-date-grid">{EXAMS.map(([id,label],index)=><label key={id}><span><i>{index+1}</i>{label}</span><input type="date" value={dates[id]||''} onChange={e=>setDates(old=>({...old,[id]:e.target.value}))}/></label>)}</div>
    <div className="exam-save-row"><small>変更は保存後、生徒のマイページに反映されます。</small><button type="button" disabled={saving} onClick={save}>{saving?'保存中…':'3つの入試日を保存'}</button></div>
  </section>;
}
