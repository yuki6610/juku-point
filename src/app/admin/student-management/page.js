"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import AdminHubTabs from "../AdminHubTabs";
import Students from "../students/page";
import StudentNotes from "../student-notes/page";
import Tags from "../tags/page";
import "../admin-hubs.css";
const tabs=[{id:"list",label:"生徒一覧"},{id:"notes",label:"生徒メモ"},{id:"tags",label:"タグ一括管理"}];
export default function StudentManagementPage(){const params=useSearchParams();const[tab,setTab]=useState("list");useEffect(()=>{const value=params.get("tab");if(tabs.some(item=>item.id===value))setTab(value)},[params]);const select=value=>{setTab(value);window.history.replaceState(null,"",`/admin/student-management?tab=${value}`)};return <main className="admin-hub-page"><header className="admin-hub-heading"><span>生徒・保護者</span><h1>生徒管理</h1><p>生徒を探し、個別情報・指導メモ・タグを管理します。</p></header><AdminHubTabs label="生徒管理メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">{tab==="list"?<Students/>:tab==="notes"?<StudentNotes/>:<Tags/>}</div></main>}
