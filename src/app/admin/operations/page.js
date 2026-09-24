"use client";

import { useEffect,useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminHubTabs from "../AdminHubTabs";
import Feedback from "../feedback/page";
import OperationsCosts from "../operations-costs/page";
import "../admin-hubs.css";

const tabs=[{id:"feedback",label:"バグ報告"},{id:"costs",label:"アプリ運用費"}];
export default function OperationsPage(){
  const params=useSearchParams();
  const[tab,setTab]=useState("feedback");
  useEffect(()=>{const value=params.get("tab");if(tabs.some(item=>item.id===value))setTab(value)},[params]);
  const select=value=>{setTab(value);window.history.replaceState(null,"",`/admin/operations?tab=${value}`)};
  return <main className="admin-hub-page"><header className="admin-hub-heading"><span>管理設定</span><h1>運用・保守</h1><p>不具合への対応とアプリの運用費を確認します。</p></header><AdminHubTabs label="運用・保守メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">{tab==="feedback"?<Feedback/>:<OperationsCosts/>}</div></main>;
}
