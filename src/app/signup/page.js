"use client";

import { useState } from "react";
import { db } from "../../firebaseConfig";
import { doc, setDoc } from "firebase/firestore";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [realName, setRealName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleRegister = async () => {
    if (!email || !realName || !password) {
      alert("メール・本名・パスワードは必須です。");
      return;
    }

    try {
      const auth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Firestoreにユーザー情報を保存（学年は除外）
      await setDoc(doc(db, "users", uid), {
        realName,
        displayName: displayName || realName,
        level: 1,
        experience: 0,
        points: 0,
        createdAt: new Date().toISOString(),
      });

      alert("登録が完了しました！ログインしてください。");
      router.push("/login");
    } catch (error) {
      console.error("登録エラー:", error);
      if (error.code === "auth/email-already-in-use") {
        alert("このメールアドレスはすでに登録されています。");
      } else if (error.code === "auth/invalid-email") {
        alert("メールアドレスの形式が正しくありません。");
      } else if (error.code === "auth/weak-password") {
        alert("パスワードは6文字以上にしてください。");
      } else {
        alert("登録に失敗しました。");
      }
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #e8f5e9 0%, #f9fbe7 100%)",
        padding: "20px",
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
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
            fontSize: "1.8rem",
            fontWeight: "bold",
            color: "#2e7d32",
            marginBottom: "20px",
          }}
        >
          📝 新規登録
        </h1>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={styles.label}>メールアドレス</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            type="email"
            placeholder="example@email.com"
          />

          <label style={styles.label}>本名（管理者のみ確認）</label>
          <input
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            style={styles.input}
            placeholder="山田 太郎"
          />

          <label style={styles.label}>表示名（アプリ内のニックネーム）</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={styles.input}
            placeholder="たろー"
          />

          <label style={styles.label}>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            placeholder="6文字以上"
          />

          <button onClick={handleRegister} style={styles.button}>
            登録する
          </button>
        </div>
      </div>
    </main>
  );
}

// ✅ スタイル定義
const styles = {
  label: {
    fontSize: "14px",
    fontWeight: "bold",
    color: "#555",
    textAlign: "left",
  },
  input: {
    padding: "10px",
    fontSize: "14px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    outline: "none",
    transition: "border-color 0.2s",
  },
  button: {
    marginTop: "20px",
    padding: "12px",
    fontSize: "16px",
    fontWeight: "bold",
    color: "#fff",
    backgroundColor: "#2e7d32",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "background-color 0.3s",
  },
};
