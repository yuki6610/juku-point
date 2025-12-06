'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../../firebaseConfig'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()

  const handleLogin = async () => {
    if (!email || !password) {
      alert('メールアドレスとパスワードを入力してください。')
      return
    }

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
          createdAt: new Date().toISOString(),
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
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      <h2>ログインページ</h2>
      <div style={{ marginTop: '20px' }}>
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '8px', width: '250px', marginBottom: '10px' }}
        />
        <br />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '8px', width: '250px', marginBottom: '10px' }}
        />
        <br />

        <button
          onClick={handleLogin}
          style={{
            backgroundColor: '#3b82f6',
            color: '#fff',
            padding: '10px 20px',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          ログイン
        </button>

        {/* 🔹 パスワード忘れボタン */}
        <div>
          <button
            onClick={handlePasswordReset}
            style={{
              marginTop: '12px',
              background: 'none',
              border: 'none',
              color: '#3b82f6',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: '0.9rem',
            }}
          >
            パスワードを忘れた方はこちら
          </button>
        </div>

        {/* 🔹 新規登録ページへ */}
        <div style={{ marginTop: '20px' }}>
          <button
            onClick={() => router.push('/signup')}
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            新規登録はこちら
          </button>
        </div>
      </div>
    </div>
  )
}
