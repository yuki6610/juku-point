"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import AdminHubTabs from "../AdminHubTabs";
import RewardHistory from "../rewards/RewardHistory";
import RewardCatalog from "../rewards/RewardCatalog";
import PointHistory from "../point-history/page";
import "../rewards/rewards.css";
import "../admin-hubs.css";
import "../admin-workflow-pages.css";
const tabs=[{id:"exchange",label:"交換対応",note:"引き渡しを確認"},{id:"catalog",label:"景品・在庫",note:"登録・在庫調整"},{id:"history",label:"ポイント履歴",note:"獲得・利用の理由"}];
export default function PointsPage(){const params=useSearchParams();const[tab,setTab]=useState("exchange");useEffect(()=>{const value=params.get("tab");if(tabs.some(item=>item.id===value))setTab(value)},[params]);const select=value=>{setTab(value);window.history.replaceState(null,"",`/admin/points?tab=${value}`)};return <main className="admin-hub-page admin-workflow-page"><header className="admin-hub-heading"><span>生徒・保護者</span><h1>ポイント・景品</h1><p>景品の引き渡しを先に確認し、必要に応じて在庫やポイントの履歴を調べます。</p></header><AdminHubTabs label="ポイント・景品メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">{tab==="exchange"&&<RewardHistory/>}{tab==="catalog"&&<RewardCatalog/>}{tab==="history"&&<PointHistory/>}</div></main>}
