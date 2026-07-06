"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./admin-navigation.css";

const groups = [
  {
    label: "毎日の業務",
    items: [
      { path: "/admin", icon: "⌂", label: "ダッシュボード", exact: true },
      { path: "/admin/lesson-records", icon: "✓", label: "学習記録" },
      { path: "/admin/lesson-attendance", icon: "▦", label: "授業・振替管理" },
      { path: "/admin/qr", icon: "◷", label: "自習中の生徒" },
      { path: "/admin/study-log", icon: "≡", label: "自習履歴" },
      { path: "/admin/attend", icon: "○", label: "高校生の出席" },
    ],
  },
  {
    label: "生徒・成績",
    items: [
      { path: "/admin/students", icon: "◎", label: "生徒管理" },
      { path: "/admin/approve", icon: "↗", label: "成績承認" },
      { path: "/admin/judge", icon: "△", label: "志望校判定" },
      { path: "/admin/score", icon: "+", label: "成績入力" },
    ],
  },
  {
    label: "ポイント・景品",
    items: [
      { path: "/admin/rewards", icon: "◇", label: "景品管理" },
      { path: "/admin/rewardHistory", icon: "↺", label: "交換履歴" },
      { path: "/admin/illegal", icon: "!", label: "不正検知" },
    ],
  },
];

const titles = Object.fromEntries(
  groups.flatMap((group) => group.items.map((item) => [item.path, item.label])),
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
    router.push(path);
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

      <nav className="admin-nav">
        {groups.map((group) => (
          <section key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) => {
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
      </nav>

      <div className="admin-student-switch">
        <p>STUDENT VIEW</p>
        <strong>生徒画面を確認</strong>
        <small>管理者のままマイページを表示できます</small>
        <button type="button" onClick={() => navigate("/mypage")}>
          マイページを開く <span>→</span>
        </button>
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
