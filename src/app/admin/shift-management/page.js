"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
import {shiftWeekStart} from "@/lib/weeklyShifts";
import AdminHubTabs from "../AdminHubTabs";
import ShiftsView from "../shifts/ShiftsView";
import TeacherPreferencesView from "../teacher-preferences/TeacherPreferencesView";
import "../admin-hubs.css";
import "../admin-workflow-pages.css";

const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo"}).format(new Date());
const tabs=[{id:"week",label:"週シフト",note:"作成・割当・確定"},{id:"preferences",label:"講師の希望",note:"対応できる日時を確認"}];
export default function ShiftManagementPage(){
  const params=useSearchParams();
  const[tab,setTab]=useState("week");
  const[week,setWeek]=useState(shiftWeekStart(today()));
  const[shiftDirty,setShiftDirty]=useState(false);
  useEffect(()=>{const value=params.get("tab");if(tabs.some(item=>item.id===value))setTab(value);const requestedWeek=params.get("week");if(/^\d{4}-\d{2}-\d{2}$/.test(requestedWeek||""))setWeek(shiftWeekStart(requestedWeek))},[params]);
  const select=value=>{if(value!==tab&&shiftDirty&&!window.confirm('シフト表に保存していない変更があります。破棄して移動しますか？'))return;setTab(value);window.history.replaceState(null,"",`/admin/shift-management?tab=${value}&week=${week}`)};
  const changeWeek=value=>{setWeek(value);window.history.replaceState(null,"",`/admin/shift-management?tab=${tab}&week=${value}`)};
  return <main className="admin-hub-page admin-workflow-page"><header className="admin-hub-heading"><span>授業の準備</span><h1>シフト管理</h1><p>週を選び、下書きを作成・編集してから確定します。講師の希望も同じ週で確認できます。</p></header><AdminHubTabs label="シフト管理メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">{tab==="week"?<ShiftsView selectedWeek={week} onWeekChange={changeWeek} onDirtyChange={setShiftDirty}/>:<TeacherPreferencesView selectedWeek={week} onWeekChange={changeWeek}/>}</div></main>;
}
