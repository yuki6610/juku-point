"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./admin-navigation.css";

const groups = [
  { label: "毎日の業務", items: [
    { path: "/admin", icon: "⌂", label: "今日の業務", exact: true },
    { path: "/admin/lesson-records", icon: "✓", label: "授業・出欠" },
    { path: "/admin/study-log", icon: "◷", label: "自習管理" },
  ] },
  { label: "授業の準備", items: [
    { path: "/admin/shift-management", icon: "表", label: "シフト管理", related: ["/admin/shifts", "/admin/teacher-preferences"] },
    { path: "/admin/course-lessons", icon: "季", label: "講習管理" },
  ] },
  { label: "生徒・保護者", items: [
    { path: "/admin/student-management", icon: "◎", label: "生徒管理", related: ["/admin/students", "/admin/student-notes", "/admin/tags"] },
    { path: "/admin/academics", icon: "△", label: "成績・進路", related: ["/admin/score", "/admin/mock-scores", "/admin/schools"] },
    { path: "/admin/family", icon: "家", label: "保護者対応", related: ["/admin/referrals"] },
    { path: "/admin/points", icon: "◇", label: "ポイント・景品", related: ["/admin/rewards", "/admin/point-history"] },
  ] },
  { label: "管理設定", items: [
    { path: "/admin/settings", icon: "▦", label: "教室設定" },
    { path: "/admin/accounts", icon: "鍵", label: "アカウント管理", related: ["/admin/student-accounts", "/admin/account-recovery"] },
    { path: "/admin/operations", icon: "!", label: "運用・保守", related: ["/admin/feedback", "/admin/operations-costs"] },
  ] },
];

const titles = Object.fromEntries(
  groups.flatMap((group) => group.items.flatMap((item) => [item.path, ...(item.related || [])].map((path) => [path, item.label]))),
);

export default function AdminNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const navigate = (path) => {
    setOpen(false);
    if (path !== pathname) router.push(path);
  };

  const currentTitle =
    titles[pathname] ||
    Object.entries(titles).find(
      ([path]) => path !== "/admin" && pathname.startsWith(`${path}/`),
    )?.[1] ||
    "管理画面";
  const visibleGroups = groups;

  const sidebar = (
    <aside className="admin-sidebar" aria-label="管理メニュー">
      <div className="admin-brand">
        <span>C</span>
        <div>
          <strong>教室管理</strong>
          <small>管理者画面</small>
        </div>
      </div>

      <nav className="admin-nav">
        {visibleGroups.map((group) => (
          <section key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) => {
              const active = item.exact
                ? pathname === item.path
                : [item.path, ...(item.related || [])].some(path => pathname === path || pathname.startsWith(`${path}/`));
              return (
                <button
                  type="button"
                  key={item.path}
                  className={active ? "active" : ""}
                  onClick={() => navigate(item.path)}
                  aria-current={active ? "page" : undefined}
                >
                  <span>{item.icon}</span>
                  <strong>{item.label}</strong>
                </button>
              );
            })}
          </section>
        ))}
      </nav>

      <div className="admin-student-switch">
        <p>PREVIEW</p><strong>利用者画面を確認</strong><small>管理者のまま表示できます</small>
        <button type="button" onClick={() => navigate("/mypage")}>生徒 <span>→</span></button>
        <button type="button" onClick={() => navigate("/teacher")}>講師 <span>→</span></button>
        <button type="button" onClick={() => navigate("/parent")}>保護者 <span>→</span></button>
      </div>
    </aside>
  );

  return (
    <>
      <header className="admin-mobile-header">
        <button
          type="button"
          className="admin-menu-trigger"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-label="管理メニューを開く"
        >
          <span />
          <span />
          <span />
        </button>
        <div>
          <small>ADMIN</small>
          <strong>{currentTitle}</strong>
        </div>
        <button
          type="button"
          className="admin-student-shortcut"
          onClick={() => navigate("/mypage")}
          aria-label="生徒マイページを開く"
        >
          生徒
        </button>
      </header>

      <div className="admin-desktop-sidebar">{sidebar}</div>

      {open && (
        <div className="admin-nav-overlay" onClick={() => setOpen(false)}>
          <div
            className="admin-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="管理メニュー"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="admin-drawer-close"
              onClick={() => setOpen(false)}
              aria-label="閉じる"
            >
              ×
            </button>
            {sidebar}
          </div>
        </div>
      )}
    </>
  );
}
