"use client";

import { useState } from "react";
import { db } from "../../firebaseConfig";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import "../auth.css";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [realName, setRealName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (submitting) return;
    if (!email || !realName || !password) {
      alert("メール・本名・パスワードは必須です。");
      return;
    }

    setSubmitting(true);
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
        createdAt: serverTimestamp(),
      });

      await signOut(auth);
      alert("登録が完了しました！ログインしてください。");
      router.replace("/login");
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">＋</div>
        <p className="auth-eyebrow">Create account</p>
        <h1 className="auth-title">新規登録</h1>
        <p className="auth-copy">必要な情報を入力して始めましょう。</p>

        <div className="auth-form">
          <label className="auth-field">
          <span className="auth-label">メールアドレス</span>
          <input
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="example@email.com"
          />
          </label>

          <label className="auth-field">
          <span className="auth-label">本名（管理者のみ確認）</span>
          <input
            className="auth-input"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            autoComplete="name"
            placeholder="山田 太郎"
          />
          </label>

          <label className="auth-field">
          <span className="auth-label">表示名（ニックネーム）</span>
          <input
            className="auth-input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="たろー"
          />
          </label>

          <label className="auth-field">
          <span className="auth-label">パスワード</span>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="6文字以上"
          />
          </label>

          <button
            onClick={handleRegister}
            className="auth-button primary"
            disabled={submitting}
          >
            {submitting ? "登録中…" : "登録する"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/login")}
            className="auth-link"
          >
            ログインへ戻る
          </button>
        </div>
      </section>
    </main>
  );
}
