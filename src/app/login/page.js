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
  const router = useRouter()

  const handleLogin = async () => {
    if (submitting) return
    if (!email || !password) {
      alert('メールアドレスとパスワードを入力してください。')
      return
    }

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
          experience: 0,
          createdAt: serverTimestamp(),
        })
      }

      // 管理者判定
      const adminRef = doc(db, 'admins', uid)
      const adminSnap = await getDoc(adminRef)

      if (adminSnap.exists()) {
        alert(`👑 管理者 ${user.displayName || 'Admin'} さん、ようこそ！`)
        router.push('/admin')
      } else {
        alert(`ようこそ ${user.displayName || '生徒'} さん！`)
        router.push('/mypage')
      }
    } catch (error) {
      console.error('ログインエラー:', error)
      if (error.code === 'auth/user-not-found') {
        alert('ユーザーが見つかりません。')
      } else if (error.code === 'auth/wrong-password') {
        alert('パスワードが違います。')
      } else {
        alert('ログインに失敗しました。')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // 🔹 パスワード再設定メール送信
  const handlePasswordReset = async () => {
    if (!email) {
      alert('パスワード再設定メールを送るには、メールアドレスを入力してください。')
      return
    }

    try {
      const auth = getAuth()
      await sendPasswordResetEmail(auth, email)
      alert('パスワード再設定メールを送信しました。メールボックスをご確認ください。')
    } catch (err) {
      alert('送信に失敗しました：' + err.message)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
      <div className="brand-mark" aria-hidden="true">C</div>
      <p className="auth-eyebrow">Welcome back</p>
      <h1 className="auth-title">ログイン</h1>
      <p className="auth-copy">今日の学習を始めましょう。</p>
      <div className="auth-form">
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
          <input
            className="auth-input"
            type="password"
            autoComplete="current-password"
            placeholder="パスワードを入力"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <button
          onClick={handleLogin}
          className="auth-button primary"
          disabled={submitting}
        >
          {submitting ? 'ログイン中…' : 'ログイン'}
        </button>

        <button onClick={handlePasswordReset} className="auth-link">
          パスワードを忘れた方
        </button>

        <div className="auth-divider" />
        <button
          onClick={() => router.push('/signup')}
          className="auth-button secondary"
        >
          はじめての方はこちら
        </button>
      </div>
      </section>
    </main>
  )
}
