"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDoc, getDocs, limit, orderBy, query, startAfter, doc } from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import "./point-history.css";

const PAGE_SIZE = 50;
const gradeLabel = (grade) => ({7:"中1",8:"中2",9:"中3",10:"高1",11:"高2",12:"高3"}[Number(grade)] || "学年未設定");
const pointValue = (item) => Number(item.amount ?? item.point ?? 0) || 0;
const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const typeLabel = (item) => ({
  selfstudy:"自習", classAttendance:"授業出席", wordtest:"単語テスト",
  wordtest_undo:"単語テスト取消", homework:"宿題提出", homework_missed:"宿題未提出",
  homework_undo:"宿題提出取消", undo_homework:"宿題提出取消", reward:"景品交換",
  adjustment:"管理者調整", penalty:"不正による没収", score:"成績",
}[item.type] || "その他");
const itemDescription = (item) => {
  if (item.description || item.note || item.reason || item.message) return item.description || item.note || item.reason || item.message;
  if (["wordtest","wordtest_undo"].includes(item.type) && Number.isFinite(item.correct) && Number.isFinite(item.total)) return `${item.correct}/${item.total}問正解`;
  return typeLabel(item);
};

export default function AdminPointHistoryPage() {
  const [students,setStudents]=useState([]);
  const [uid,setUid]=useState("");
  const [grade,setGrade]=useState("all");
  const [search,setSearch]=useState("");
  const [items,setItems]=useState([]);
  const [lastDoc,setLastDoc]=useState(null);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [loadingHistory,setLoadingHistory]=useState(false);
  const [filter,setFilter]=useState("all");
  const [error,setError]=useState("");

  useEffect(()=>onAuthStateChanged(auth,async user=>{
    if(!user){setLoading(false);return;}
    try{
      const adminSnap=await getDoc(doc(db,"admins",user.uid));
      if(!adminSnap.exists()) throw new Error("管理者権限がありません。");
      const snap=await getDocs(collection(db,"users"));
      setStudents(snap.docs.map(d=>({uid:d.id,...d.data()})).filter(s=>Number(s.grade)>=7&&Number(s.grade)<=12).sort((a,b)=>Number(a.grade)-Number(b.grade)||String(a.realName||a.displayName||"").localeCompare(String(b.realName||b.displayName||""),"ja")));
    }catch(e){setError(e.message||"生徒一覧を取得できませんでした。");}
    finally{setLoading(false);}
  }),[]);

  const fetchHistory=async(selectedUid,after=null)=>{
    const constraints=[orderBy("createdAt","desc"),limit(PAGE_SIZE)];
    if(after) constraints.push(startAfter(after));
    const snap=await getDocs(query(collection(db,"users",selectedUid,"pointHistory"),...constraints));
    return {list:snap.docs.map(d=>({id:d.id,...d.data()})),last:snap.docs.at(-1)||null,more:snap.docs.length===PAGE_SIZE};
  };

  useEffect(()=>{
    if(!uid){setItems([]);setLastDoc(null);setHasMore(false);return;}
    let active=true;
    setLoadingHistory(true);setError("");
    fetchHistory(uid).then(result=>{if(active){setItems(result.list);setLastDoc(result.last);setHasMore(result.more);}}).catch(()=>active&&setError("ポイント履歴を取得できませんでした。")).finally(()=>active&&setLoadingHistory(false));
    return()=>{active=false;};
  },[uid]);

  const loadMore=async()=>{
    if(!uid||!lastDoc||loadingHistory)return;
    setLoadingHistory(true);
    try{const result=await fetchHistory(uid,lastDoc);setItems(v=>[...v,...result.list]);setLastDoc(result.last);setHasMore(result.more);}catch{setError("追加の履歴を取得できませんでした。");}finally{setLoadingHistory(false);}
  };

  const filteredStudents=useMemo(()=>students.filter(s=>(grade==="all"||Number(s.grade)===Number(grade))&&`${s.realName||""} ${s.displayName||""}`.toLowerCase().includes(search.trim().toLowerCase())),[students,grade,search]);
  const visibleItems=useMemo(()=>items.filter(item=>filter==="all"||(filter==="earned"?pointValue(item)>0:pointValue(item)<0)),[items,filter]);
  const selected=students.find(s=>s.uid===uid);
  const earned=items.reduce((sum,item)=>sum+Math.max(pointValue(item),0),0);
  const used=items.reduce((sum,item)=>sum+Math.abs(Math.min(pointValue(item),0)),0);

  if(loading)return <main className="aph-state">生徒情報を読み込んでいます…</main>;
  return <main className="aph-page">
    <header><span>POINT AUDIT</span><h1>生徒ポイント履歴</h1><p>生徒ごとの獲得・利用・減点の理由を確認できます。</p></header>
    {error&&<p className="aph-error">{error}</p>}
    <section className="aph-picker">
      <select value={grade} onChange={e=>setGrade(e.target.value)}><option value="all">全学年</option>{[7,8,9,10,11,12].map(g=><option key={g} value={g}>{gradeLabel(g)}</option>)}</select>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="生徒名で検索" />
      <select value={uid} onChange={e=>setUid(e.target.value)}><option value="">生徒を選択</option>{filteredStudents.map(s=><option key={s.uid} value={s.uid}>{gradeLabel(s.grade)}　{s.realName||s.displayName||"名前未登録"}</option>)}</select>
    </section>
    {!uid?<section className="aph-empty">生徒を選択してください。</section>:<>
      <section className="aph-summary"><article><span>対象</span><strong>{selected?.realName||selected?.displayName}</strong><small>{gradeLabel(selected?.grade)}</small></article><article><span>表示中の獲得</span><strong className="plus">+{earned.toLocaleString()}pt</strong></article><article><span>表示中の利用・減点</span><strong className="minus">-{used.toLocaleString()}pt</strong></article><article><span>読込済み</span><strong>{items.length}件</strong></article></section>
      <div className="aph-filters">{[["all","すべて"],["earned","獲得"],["used","利用・減点"]].map(([v,l])=><button key={v} className={filter===v?"active":""} onClick={()=>setFilter(v)}>{l}</button>)}</div>
      <section className="aph-list">
        {loadingHistory&&items.length===0?<p className="aph-empty">履歴を読み込んでいます…</p>:visibleItems.length===0?<p className="aph-empty">該当する履歴はありません。</p>:visibleItems.map(item=>{const value=pointValue(item);const date=toDate(item.createdAt);return <article key={item.id}><div className={`aph-sign ${value>=0?"plus":"minus"}`}>{value>=0?"＋":"−"}</div><div className="aph-detail"><strong>{typeLabel(item)}</strong><p>{itemDescription(item)}</p><small>{date?new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date):"日時不明"}{item.week?` ・ ${item.week}`:""}</small></div><b className={value>=0?"plus":"minus"}>{value>0?"+":""}{value.toLocaleString()}pt</b></article>})}
      </section>
      {hasMore&&<button className="aph-more" onClick={loadMore} disabled={loadingHistory}>{loadingHistory?"読み込み中…":"さらに50件読み込む"}</button>}
    </>}
  </main>;
}
