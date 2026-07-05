"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebaseConfig";
import "./auth.css";

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/mypage");
        return;
      }

      setCheckingAuth(false);
    });

    return unsubscribe;
  }, [router]);

  if (checkingAuth) {
    return (
      <main aria-live="polite" className="auth-shell">
        ログイン状態を確認しています…
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">C</div>
        <p className="auth-eyebrow">Chidorigaoka Juku</p>
        <h1 className="auth-title">
          千鳥が丘ポイントアプリ
        </h1>
        <p className="auth-copy">
          毎日の学習を記録して、成長を見える形に。
        </p>

        <div className="auth-actions">
          <button
            className="auth-button primary"
            onClick={() => router.push("/login")}
          >
            ログイン
          </button>

          <button
            className="auth-button secondary"
            onClick={() => router.push("/signup")}
          >
            新規登録
          </button>
        </div>
      </section>
    </main>
  );
}
