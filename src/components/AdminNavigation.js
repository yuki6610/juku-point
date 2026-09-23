"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import "./admin-navigation.css";

const groups = [{
    label: "管理メニュー",
    items: [
      { path: "/admin", icon: "⌂", label: "ダッシュボード", exact: true },
      { path: "/admin/lesson-records", icon: "✓", label: "学習記録・出欠", keywords: "宿題 単語テスト 出席 欠席 振替 生活態度" },
      { path: "/admin/course-lessons", icon: "季", label: "講習授業管理", keywords: "夏期 冬期 春期 宿題 単語テスト" },
      { path: "/admin/settings", icon: "▦", label: "教室・授業設定", keywords: "カレンダー 曜日 学期 年度 入試日 保護者 講師" },
      { path: "/admin/study-log", icon: "◷", label: "自習管理", keywords: "入室 退出 GPS" },
      { path: "/admin/students", icon: "◎", label: "生徒管理", keywords: "生徒登録 学年 退塾 ポイント タグ" },
      { path: "/admin/student-notes", icon: "表", label: "生徒メモ", keywords: "教室内メモ 講師メモ" },
      { path: "/admin/tags", icon: "#", label: "タグ一括管理" },
      { path: "/admin/referrals", icon: "紹", label: "友人紹介管理" },
      { path: "/admin/score", icon: "△", label: "成績・志望校", keywords: "定期テスト 通知表 内申 提出 判定 印刷" },
      { path: "/admin/mock-scores", icon: "◎", label: "模試成績" },
      { path: "/admin/schools", icon: "校", label: "高校情報" },
      { path: "/admin/point-history", icon: "P", label: "ポイント履歴", keywords: "獲得 減点 累計 学期" },
      { path: "/admin/rewards", icon: "◇", label: "景品・交換管理", keywords: "引き渡し 在庫 食事券" },
      { path: "/admin/feedback", icon: "!", label: "バグ報告" },
    ],
  }];

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
          <strong>Classroom</strong>
          <small>ADMIN CONSOLE</small>
        </div>
      </div>

      <nav className="admin-nav">
        {visibleGroups.map((group) => (
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
