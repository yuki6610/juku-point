"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/firebaseConfig";
import "./student-navigation.css";

const primaryItems = [
  { path: "/mypage", icon: "⌂", label: "ホーム" },
  { path: "/checkin", icon: "◷", label: "学習" },
  { path: "/rewards", icon: "◇", label: "景品" },
  { path: "/points", icon: "P", label: "ポイント" },
];

const moreItems = [
  { path: "/ranking", label: "ランキング", note: "みんなの学習成果" },
  { path: "/student/scores", label: "成績・志望校", note: "成績入力と高校比較", middleOnly: true },
  { path: "/behavior", label: "生活態度", note: "学期の記録", middleOnly: true },
  { path: "/summer", label: "夏期イベント", note: "期間限定イベント", requiredTag: "summer_course" },
  { path: "/settings", label: "設定", note: "プロフィールとアバター" },
  { path: "/guide", label: "使い方", note: "操作ガイド" },
];

export default function StudentNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const isHighSchool = Number(profile?.grade) >= 10 && Number(profile?.grade) <= 12;
  const visibleMoreItems = moreItems.filter((item) => {
    if (item.middleOnly && (!profile || isHighSchool)) return false;
    if (item.requiredTag && !profile?.courseTags?.includes(item.requiredTag)) return false;
    return true;
  });
  const moreActive = visibleMoreItems.some(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  );

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setProfile(null);
        return;
      }
      try {
        const snapshot = await getDoc(doc(db, "users", currentUser.uid));
        setProfile(snapshot.exists() ? snapshot.data() : null);
      } catch (error) {
        console.error("生徒メニューのプロフィール取得に失敗しました:", error);
        setProfile(null);
      }
    });
    return unsubscribe;
  }, []);

  const hidden =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/admin");
  if (hidden) return null;

  const navigate = (path) => {
    setOpen(false);
    router.push(path);
  };

  return (
    <>
      {open && (
        <div className="student-menu-overlay" onClick={() => setOpen(false)}>
          <section
            className="student-menu-sheet"
            aria-label="その他のメニュー"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="student-menu-heading">
              <div>
                <span>ALL MENU</span>
                <h2>その他のメニュー</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="閉じる">×</button>
            </div>
            <div className="student-menu-grid">
              {visibleMoreItems.map((item) => (
                <button type="button" key={item.path} onClick={() => navigate(item.path)}>
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                  <span>→</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <nav className="student-bottom-nav" aria-label="生徒メニュー">
        {primaryItems.map((item) => {
          const active = pathname === item.path || pathname.startsWith(`${item.path}/`);
          return (
            <button
              type="button"
              key={item.path}
              className={active ? "active" : ""}
              onClick={() => navigate(item.path)}
              aria-current={active ? "page" : undefined}
            >
              <span>{item.icon}</span>
              <small>{item.label}</small>
            </button>
          );
        })}
        <button
          type="button"
          className={open || moreActive ? "active" : ""}
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-current={moreActive ? "page" : undefined}
        >
          <span>•••</span>
          <small>その他</small>
        </button>
      </nav>
      <div className="student-nav-spacer" aria-hidden="true" />
    </>
  );
}
