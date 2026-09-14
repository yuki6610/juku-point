"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./admin-navigation.css";

const groups = [{
    label: "管理メニュー",
    items: [
      { path: "/admin", icon: "⌂", label: "ダッシュボード", exact: true },
      { path: "/admin/lesson-records", icon: "✓", label: "学習記録・出欠" },
      { path: "/admin/course-lessons", icon: "季", label: "講習授業管理" },
      { path: "/admin/settings", icon: "▦", label: "教室・授業設定" },
      { path: "/admin/study-log", icon: "◷", label: "自習管理" },
      { path: "/admin/students", icon: "◎", label: "生徒管理" },
      { path: "/admin/student-notes", icon: "表", label: "生徒メモ" },
      { path: "/admin/score", icon: "△", label: "成績・志望校" },
      { path: "/admin/point-history", icon: "P", label: "ポイント履歴" },
      { path: "/admin/rewards", icon: "◇", label: "景品・交換管理" },
    ],
  }];

const titles = Object.fromEntries(
  groups.flatMap((group) => group.items.map((item) => [item.path, item.label])),
);

export default function AdminNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);

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

  useEffect(() => {
    const focusSearch = (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey ||
        event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

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

  const sidebar = (
    <aside className="admin-sidebar" aria-label="管理メニュー">
      <div className="admin-brand">
        <span>C</span>
        <div>
          <strong>Classroom</strong>
          <small>ADMIN CONSOLE</small>
        </div>
      </div>

      <label className="admin-nav-search">
        <span>機能を探す</span>
        <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例：宿題、成績、設定  ／" aria-label="管理機能を検索" />
      </label>
      <nav className="admin-nav">
        {groups.map((group) => (
          <section key={group.label}>
            <p>{group.label}</p>
            {group.items.filter((item) => `${item.label} ${item.path}`.toLowerCase().includes(query.trim().toLowerCase())).map((item) => {
              const active = item.exact
                ? pathname === item.path
                : pathname === item.path || pathname.startsWith(`${item.path}/`);
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
        {query && !groups.some((group) => group.items.some((item) => `${item.label} ${item.path}`.toLowerCase().includes(query.trim().toLowerCase()))) && <p className="admin-nav-empty">該当する機能はありません。</p>}
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
