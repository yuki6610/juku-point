'use client';
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
  const academic = useAcademicContext();
  const [year,setYear]=useState(''),[years,setYears]=useState({}),[dates,setDates]=useState({}),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  useEffect(()=>{ if(academic.current&&!year)setYear(String(academic.current.year)); },[academic.current,year]);
  useEffect(()=>{ getDoc(doc(db,'admin_data','examDates')).then(snap=>{const value=snap.data()?.years||{};setYears(value);const selected=year||String(academic.current?.year||'');setDates(value[selected]||{});}).catch(()=>setNotice('入試日を読み込めませんでした。')); },[]);
  useEffect(()=>{ if(year)setDates(years[year]||{}); },[year,years]);
  const save=async()=>{if(!year||EXAMS.some(([id])=>!dates[id]))return setNotice('3種類の入試日を入力してください。');setSaving(true);try{const next={...years,[year]:dates};await setDoc(doc(db,'admin_data','examDates'),{years:next,updatedAt:serverTimestamp(),updatedBy:auth.currentUser?.uid||null},{merge:true});setYears(next);setNotice(`${year}年度の入試日を保存しました。`);}catch{setNotice('入試日を保存できませんでした。');}finally{setSaving(false)}};
  return <section className="homework-template-panel"><h2>中学3年生の入試日</h2><p>生徒管理で入試タグを設定すると、対象の日程だけが生徒のホームに表示されます。タグがない中3生には3種類すべて表示します。</p>
    {notice&&<p role="status">{notice}</p>}
    <label>対象年度<select value={year} onChange={e=>setYear(e.target.value)}>{[...new Set([...(academic.settings||[]).map(item=>String(item.year)),year].filter(Boolean))].sort().map(value=><option key={value} value={value}>{value}年度</option>)}</select></label>
    {EXAMS.map(([id,label])=><label key={id}>{label}<input type="date" value={dates[id]||''} onChange={e=>setDates(old=>({...old,[id]:e.target.value}))}/></label>)}
    <button type="button" disabled={saving} onClick={save}>{saving?'保存中…':'入試日を保存'}</button>
  </section>;
}
