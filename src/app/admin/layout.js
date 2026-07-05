"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

export default function AdminLayout({ children }) {
  const router = useRouter();
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const adminSnap = await getDoc(doc(db, "admins", user.uid));
        if (!active) return;

        if (!adminSnap.exists()) {
          router.replace("/mypage");
          return;
        }

        setStatus("authorized");
      } catch (error) {
        console.error("管理者権限の確認に失敗しました:", error);
        if (active) setStatus("error");
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [router]);

  if (status === "checking") {
    return (
      <main
        role="status"
        style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}
      >
        管理者権限を確認しています…
      </main>
    );
  }

  if (status === "error") {
    return (
      <main
        role="alert"
        style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}
      >
        <div>
          <p>管理者権限を確認できませんでした。</p>
          <button type="button" onClick={() => window.location.reload()}>
            再試行
          </button>
        </div>
      </main>
    );
  }

  return children;
}
