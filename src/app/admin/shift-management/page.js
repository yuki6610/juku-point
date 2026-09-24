"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import {shiftWeekStart} from "@/lib/weeklyShifts";
import AdminHubTabs from "../AdminHubTabs";
import ShiftsView from "../shifts/ShiftsView";
import TeacherPreferencesView from "../teacher-preferences/TeacherPreferencesView";
import "../admin-hubs.css";

const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo"}).format(new Date());
const tabs=[{id:"week",label:"週シフト"},{id:"preferences",label:"講師の希望"}];
export default function ShiftManagementPage(){
  const params=useSearchParams();
  const[tab,setTab]=useState("week");
  const[week,setWeek]=useState(shiftWeekStart(today()));
  useEffect(()=>{const value=params.get("tab");if(tabs.some(item=>item.id===value))setTab(value);const requestedWeek=params.get("week");if(/^\d{4}-\d{2}-\d{2}$/.test(requestedWeek||""))setWeek(shiftWeekStart(requestedWeek))},[params]);
  const select=value=>{setTab(value);window.history.replaceState(null,"",`/admin/shift-management?tab=${value}&week=${week}`)};
  const changeWeek=value=>{setWeek(value);window.history.replaceState(null,"",`/admin/shift-management?tab=${tab}&week=${value}`)};
  return <main className="admin-hub-page"><header className="admin-hub-heading"><span>授業の準備</span><h1>シフト管理</h1><p>週のシフトを作成し、講師の希望を確認します。</p></header><AdminHubTabs label="シフト管理メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">{tab==="week"?<ShiftsView selectedWeek={week} onWeekChange={changeWeek}/>:<TeacherPreferencesView selectedWeek={week} onWeekChange={changeWeek}/>}</div></main>;
}
