"use client";
import {useState} from "react";
import {doc,getDoc} from "firebase/firestore";
import {db} from "@/firebaseConfig";
import {useAcademicContext} from "@/lib/useAcademicContext";
import {resetSeason} from "../../utils/resetSeason";

export default function StartSeasonControl(){
  const academic=useAcademicContext();
  const[busy,setBusy]=useState(false);
  const start=async()=>{
    const current=academic.current;
    if(!current)return window.alert(academic.error||"学期設定を読み込み中です。");
    if(busy||!window.confirm("新学期を開始しますか？\n今学期のランキングを保存し、学期集計をリセットします。この操作は元に戻せません。"))return;
    setBusy(true);
    try{
      const snap=await getDoc(doc(db,"admin_data","season"));
      if(!snap.exists())throw new Error("学期設定データがありません。");
      const lastResetSeason=snap.data().lastResetSeason;
      if(current.id===lastResetSeason){window.alert("現在の学期はすでに開始済みです。");return;}
      await resetSeason(current,lastResetSeason);
      window.alert("新学期へ切り替えました。");
    }catch(error){window.alert(error.message||"学期切替に失敗しました。");}
    finally{setBusy(false);}
  };
  return <section className="admin-season-control"><h2>新学期の開始</h2><p>学期終了時のみ使用します。ランキングを保存し、学期集計をリセットします。この操作は元に戻せません。</p><button type="button" disabled={busy} onClick={start}>{busy?"切り替えています…":"新学期を開始"}</button></section>;
}
