"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import AdminHubTabs from "../AdminHubTabs";
import LessonAttendanceManager from "../lesson-attendance/LessonAttendanceManager";
import HomeworkTemplates from "./HomeworkTemplates";
import ExamSettings from "./ExamSettings";
import StartSeasonControl from "./StartSeasonControl";
import "../admin-hubs.css";
import "../admin-workflow-pages.css";

const tabs=[{id:"year",label:"年度・授業日",note:"学期・休校日"},{id:"schedule",label:"通塾設定",note:"曜日・時間・教科"},{id:"materials",label:"教材・宿題",note:"候補を管理"},{id:"exam",label:"入試日",note:"カウントダウン"}];
export default function AdminSettingsPage(){
  const params=useSearchParams();
  const[tab,setTab]=useState("year");
  useEffect(()=>{const value=params.get("tab");if(tabs.some(item=>item.id===value))setTab(value)},[params]);
  const select=value=>{setTab(value);window.history.replaceState(null,"",`/admin/settings?tab=${value}`)};
  return <main className="admin-hub-page admin-workflow-page admin-settings-redesign"><header className="admin-hub-heading"><span>管理設定</span><h1>教室設定</h1><p>変更したい項目を選び、各画面の保存ボタンで反映します。年度の切り替えは最後に確認します。</p></header><AdminHubTabs label="教室設定メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">
    {tab==="year"&&<><LessonAttendanceManager settingsOnly fixedTab="settings"/><StartSeasonControl/></>}
    {tab==="schedule"&&<LessonAttendanceManager settingsOnly fixedTab="students"/>}
    {tab==="materials"&&<HomeworkTemplates/>}
    {tab==="exam"&&<ExamSettings/>}
  </div></main>;
}
