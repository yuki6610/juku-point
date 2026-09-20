"use client";
import { useEffect, useState } from "react";
import { auth } from "@/firebaseConfig";
import "./lesson-report-settings.css";

const ITEMS = [
  ["understanding", "理解度"], ["focus", "集中"], ["effort", "取り組み方"],
  ["questions", "質問"], ["retry", "直し"], ["attitude", "学習態度"],
];

async function api(options) {
  const token=await auth.currentUser?.getIdToken();
  const response=await fetch("/api/admin/lesson-report-settings", { ...options, headers:{ "Content-Type":"application/json", Authorization:`Bearer ${token}` } });
  const data=await response.json();
  if(!response.ok) throw new Error(data.error || "通信に失敗しました。");
  return data;
}

export default function LessonReportSettings() {
  const [texts,setTexts]=useState(null),[selected,setSelected]=useState("understanding"),[notice,setNotice]=useState(""),[saving,setSaving]=useState(false);
  useEffect(()=>{api().then(data=>setTexts(data.ratingTexts)).catch(error=>setNotice(error.message))},[]);
  const update=(index,value)=>setTexts(old=>({...old,[selected]:old[selected].map((text,n)=>n===index?value:text)}));
  const save=async()=>{setSaving(true);setNotice("");try{const data=await api({method:"POST",body:JSON.stringify({ratingTexts:texts})});setTexts(data.ratingTexts);setNotice("授業報告の評価文章を保存しました。次回のAPI生成から反映されます。")}catch(error){setNotice(error.message)}finally{setSaving(false)}};
  return <section className="report-rating-settings"><div><small>LESSON REPORT API</small><h2>授業報告の評価文章</h2><p>講師が選択した評価と一緒にAPIへ送る表現を編集します。生成済み・保存済みの授業報告は変更されません。</p></div>{notice&&<p role="status" className="report-settings-notice">{notice}</p>}{!texts?<p>評価文章を読み込んでいます…</p>:<><nav aria-label="評価項目">{ITEMS.map(([id,label])=><button type="button" key={id} className={selected===id?"active":""} onClick={()=>setSelected(id)}>{label}</button>)}</nav><div className="report-rating-fields">{texts[selected].map((value,index)=><label key={index}><span>{index+1} / 5</span><input maxLength={80} value={value} onChange={event=>update(index,event.target.value)} /></label>)}</div><button type="button" className="report-rating-save" disabled={saving} onClick={save}>{saving?"保存中…":"評価文章を保存"}</button></>}</section>;
}
