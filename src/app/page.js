"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const user = localStorage.getItem("user");
    if (user) router.push("/mypage");
  }, [router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #e8f5e9 0%, #f9fbe7 100%)",
        padding: "20px",
      }}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          padding: "40px 30px",
          borderRadius: "16px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          maxWidth: "400px",
          width: "100%",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: "1.4rem",
            color: "#2e7d32",
            marginBottom: "12px",
            fontWeight: "bold",
          }}
        >
          千鳥が丘ポイントアプリ
        </h1>
        <p
          style={{
            color: "#555",
            marginBottom: "28px",
            fontSize: "1rem",
          }}
        >
          ログインして学習を始めよう！
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <button
            style={{
              backgroundColor: "#2e7d32",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "12px",
              fontWeight: "bold",
              fontSize: "1rem",
              cursor: "pointer",
              transition: "0.3s",
            }}
            onClick={() => router.push("/login")}
          >
            ログイン
          </button>

          <button
            style={{
              backgroundColor: "#fff",
              color: "#2e7d32",
              border: "2px solid #2e7d32",
              borderRadius: "8px",
              padding: "12px",
              fontWeight: "bold",
              fontSize: "1rem",
              cursor: "pointer",
              transition: "0.3s",
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = "#f1f8e9")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "#fff")}
            onClick={() => router.push("/signup")}
          >
            新規登録
          </button>
        </div>
      </div>
    </main>
  );
}
