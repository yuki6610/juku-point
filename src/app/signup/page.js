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
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(null);
  const router = useRouter();

  const handleRegister = async (event) => {
    event?.preventDefault();
    if (submitting) return;
    if (!email || !realName || !password) {
      setMessage({ tone: "error", text: "メール・本名・パスワードは必須です。" });
      return;
    }
    if (password.length < 6) {
      setMessage({ tone: "error", text: "パスワードは6文字以上にしてください。" });
      return;
    }

    setMessage(null);
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
        termPoints: 0,
        createdAt: serverTimestamp(),
      });

      await signOut(auth);
      router.replace("/login");
    } catch (error) {
      console.error("登録エラー:", error);
      if (error.code === "auth/email-already-in-use") {
        setMessage({ tone: "error", text: "このメールアドレスはすでに登録されています。" });
      } else if (error.code === "auth/invalid-email") {
        setMessage({ tone: "error", text: "メールアドレスの形式が正しくありません。" });
      } else if (error.code === "auth/weak-password") {
        setMessage({ tone: "error", text: "パスワードは6文字以上にしてください。" });
      } else {
        setMessage({ tone: "error", text: "登録に失敗しました。時間をおいてお試しください。" });
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

        <form className="auth-form" onSubmit={handleRegister}>
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
          <div className="auth-password">
            <input
              className="auth-input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="6文字以上"
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? "パスワードを隠す" : "パスワードを表示"}
            >
              {showPassword ? "隠す" : "表示"}
            </button>
          </div>
          <small className="auth-hint">英数字を組み合わせると、より安全です。</small>
          </label>

          {message && (
            <p className={`auth-message ${message.tone}`} role="status">{message.text}</p>
          )}

          <button
            type="submit"
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
        </form>
      </section>
    </main>
  );
}
