'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebaseConfig'
import '../auth.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState(null)
  const router = useRouter()

  const handleLogin = async (event) => {
    event?.preventDefault()
    if (submitting) return
    if (!email || !password) {
      setMessage({ tone: 'error', text: 'メールアドレスとパスワードを入力してください。' })
      return
    }

    setMessage(null)
    setSubmitting(true)
    try {
      const auth = getAuth()
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const user = userCredential.user
      const uid = user.uid

      const userRef = doc(db, 'users', uid)
      const userSnap = await getDoc(userRef)

      // 初回ログイン時は Firestore に登録
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: user.email,
          realName: '未登録',
          displayName: user.displayName || '未設定',
          level: 1,
          points: 0,
          termPoints: 0,
          experience: 0,
          createdAt: serverTimestamp(),
        })
      }

      // 管理者判定
      const adminRef = doc(db, 'admins', uid)
      const adminSnap = await getDoc(adminRef)

      if (adminSnap.exists()) {
        router.push('/admin')
      } else {
        router.push('/mypage')
      }
    } catch (error) {
      console.error('ログインエラー:', error)
      if (error.code === 'auth/user-not-found') {
        setMessage({ tone: 'error', text: 'ユーザーが見つかりません。' })
      } else if (
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        setMessage({ tone: 'error', text: 'メールアドレスまたはパスワードが違います。' })
      } else {
        setMessage({ tone: 'error', text: 'ログインに失敗しました。時間をおいてお試しください。' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  // 🔹 パスワード再設定メール送信
  const handlePasswordReset = async () => {
    if (!email) {
      setMessage({ tone: 'error', text: '先にメールアドレスを入力してください。' })
      return
    }

    try {
      const auth = getAuth()
      await sendPasswordResetEmail(auth, email)
      setMessage({ tone: 'success', text: '再設定メールを送信しました。メールをご確認ください。' })
    } catch (err) {
      console.error('再設定メールの送信に失敗しました:', err)
      setMessage({ tone: 'error', text: '再設定メールを送信できませんでした。' })
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
      <div className="brand-mark" aria-hidden="true">C</div>
      <p className="auth-eyebrow">Welcome back</p>
      <h1 className="auth-title">ログイン</h1>
      <p className="auth-copy">今日の学習を始めましょう。</p>
      <form className="auth-form" onSubmit={handleLogin}>
        <label className="auth-field">
          <span className="auth-label">メールアドレス</span>
          <input
            className="auth-input"
            type="email"
            autoComplete="email"
            placeholder="example@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="auth-field">
          <span className="auth-label">パスワード</span>
          <div className="auth-password">
            <input
              className="auth-input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="パスワードを入力"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
            >
              {showPassword ? '隠す' : '表示'}
            </button>
          </div>
        </label>

        {message && (
          <p className={`auth-message ${message.tone}`} role="status">{message.text}</p>
        )}

        <button
          type="submit"
          className="auth-button primary"
          disabled={submitting}
        >
          {submitting ? 'ログイン中…' : 'ログイン'}
        </button>

        <button type="button" onClick={handlePasswordReset} className="auth-link">
          パスワードを忘れた方
        </button>

        <div className="auth-divider" />
        <button
          onClick={() => router.push('/signup')}
          className="auth-button secondary"
        >
          はじめての方はこちら
        </button>
      </form>
      </section>
    </main>
  )
}
