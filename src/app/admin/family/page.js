"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AdminHubTabs from "../AdminHubTabs";
import InterviewSettings from "../settings/InterviewSettings";
import ParentPortalSettings from "../settings/ParentPortalSettings";
import ParentEventSettings from "../settings/ParentEventSettings";
import Referrals from "../referrals/page";
import "../admin-hubs.css";
import "../admin-workflow-pages.css";

const tabs = [
  { id: "interviews", label: "面談予約", note: "申請の承認・枠の設定" },
  { id: "announcements", label: "お知らせ・資料", note: "保護者への公開" },
  { id: "events", label: "カレンダー予定", note: "予定を追加" },
  { id: "referrals", label: "友人紹介", note: "進捗・特典" },
];
export default function FamilyPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState("interviews");
  useEffect(() => { const value = params.get("tab"); if (tabs.some(item => item.id === value)) setTab(value); }, [params]);
  const select = value => { setTab(value); window.history.replaceState(null, "", `/admin/family?tab=${value}`); };
  return <main className="admin-hub-page admin-workflow-page"><header className="admin-hub-heading"><span>生徒・保護者</span><h1>保護者対応</h1><p>面談申請を確認し、保護者へ公開するお知らせや予定を管理します。</p></header><AdminHubTabs label="保護者対応メニュー" tabs={tabs} active={tab} onChange={select}/><div className="admin-hub-content">
    {tab === "interviews" && <InterviewSettings/>}
    {tab === "announcements" && <ParentPortalSettings/>}
    {tab === "events" && <ParentEventSettings/>}
    {tab === "referrals" && <Referrals/>}
  </div></main>;
}
