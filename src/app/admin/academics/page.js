"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import AdminHubTabs from "../AdminHubTabs";
import ScoreSubmissions from "../score/ScoreSubmissions";
import ScoreManager from "../score/ScoreManager";
import MockScores from "../mock-scores/page";
import SchoolJudge from "../score/SchoolJudge";
import Schools from "../schools/page";
import "../score/score.css";
import "../score/score-hub.css";
import "../judge/judge.css";
import "../admin-hubs.css";
import "../admin-workflow-pages.css";
const tabs=[{id:"submissions",label:"提出状況",note:"未提出を確認"},{id:"records",label:"成績入力・履歴",note:"登録・修正"},{id:"mock",label:"模試",note:"結果を入力"},{id:"judge",label:"志望校判定",note:"比較・印刷"},{id:"schools",label:"高校情報",note:"学校データ"}];
export default function AcademicsPage(){const params=useSearchParams();const[tab,setTab]=useState("submissions");useEffect(()=>{const value=params.get("tab");if(tabs.some(item=>item.id===value))setTab(value)},[params]);const select=value=>{setTab(value);window.history.replaceState(null,"",`/admin/academics?tab=${value}`)};return <main className="admin-hub-page admin-workflow-page"><header className="admin-hub-heading"><span>生徒・保護者</span><h1>成績・進路</h1><p>まず提出状況を確認し、足りない成績を入力します。志望校判定と高校情報もここにまとめています。</p></header><AdminHubTabs label="成績・進路メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">{tab==="submissions"&&<ScoreSubmissions/>}{tab==="records"&&<ScoreManager/>}{tab==="mock"&&<MockScores/>}{tab==="judge"&&<SchoolJudge/>}{tab==="schools"&&<Schools/>}</div></main>}
