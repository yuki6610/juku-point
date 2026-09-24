"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminHubTabs from "../AdminHubTabs";
import TeacherManager from "../settings/TeacherManager";
import ParentManager from "../settings/ParentManager";
import StudentAccounts from "../student-accounts/page";
import AccountRecovery from "../account-recovery/page";
import AdminInviteManager from "../settings/AdminInviteManager";
import "../admin-hubs.css";

const tabs = [{ id:"teachers",label:"講師" },{ id:"parents",label:"保護者" },{ id:"students",label:"生徒本人・進級" },{ id:"recovery",label:"ログイン復旧" },{ id:"admins",label:"管理者招待" }];
export default function AccountsPage(){
  const params=useSearchParams();
  const [tab,setTab]=useState("teachers");
  useEffect(()=>{const value=params.get("tab");if(tabs.some(item=>item.id===value))setTab(value)},[params]);
  const select=value=>{setTab(value);window.history.replaceState(null,"",`/admin/accounts?tab=${value}`)};
  return <main className="admin-hub-page"><header className="admin-hub-heading"><span>管理設定</span><h1>アカウント管理</h1><p>招待、子どもの紐付け、進級、ログイン復旧を行います。</p></header><AdminHubTabs label="アカウント管理メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">
    {tab==="teachers"&&<TeacherManager/>}{tab==="parents"&&<ParentManager/>}{tab==="students"&&<StudentAccounts/>}{tab==="recovery"&&<AccountRecovery/>}{tab==="admins"&&<AdminInviteManager/>}
  </div></main>;
}
