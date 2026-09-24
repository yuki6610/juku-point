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
const tabs=[{id:"submissions",label:"提出状況"},{id:"records",label:"成績入力・履歴"},{id:"mock",label:"模試"},{id:"judge",label:"志望校判定"},{id:"schools",label:"高校情報"}];
export default function AcademicsPage(){const params=useSearchParams();const[tab,setTab]=useState("submissions");useEffect(()=>{const value=params.get("tab");if(tabs.some(item=>item.id===value))setTab(value)},[params]);const select=value=>{setTab(value);window.history.replaceState(null,"",`/admin/academics?tab=${value}`)};return <main className="admin-hub-page"><header className="admin-hub-heading"><span>生徒・保護者</span><h1>成績・進路</h1><p>提出状況から確認し、成績入力や志望校判定へ進みます。</p></header><AdminHubTabs label="成績・進路メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">{tab==="submissions"&&<ScoreSubmissions/>}{tab==="records"&&<ScoreManager/>}{tab==="mock"&&<MockScores/>}{tab==="judge"&&<SchoolJudge/>}{tab==="schools"&&<Schools/>}</div></main>}
