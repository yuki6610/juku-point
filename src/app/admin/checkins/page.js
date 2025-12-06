'use client'

import { useEffect, useState } from 'react'
import { db } from '../../../firebaseConfig'
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import { getAuth, onAuthStateChanged } from 'firebase/auth'

export default function AdminCheckinPage() {
  const [enterPin, setEnterPin] = useState('')
  const [exitPin, setExitPin] = useState('')
  const [loading, setLoading] = useState(true)

  const auth = getAuth()

  // ランダムPIN生成（4桁）
  const generatePin = () => String(Math.floor(1000 + Math.random() * 9000))

  // 管理者チェック
  const checkAdmin = async (uid) => {
    const ref = doc(db, 'admins', uid)
    const snap = await getDoc(ref)
    return snap.exists()
  }

  useEffect(() => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) return

      const isAdmin = await checkAdmin(user.uid)
      if (!isAdmin) {
        alert('アクセス権がありません')
        return
      }

      // PINの読み込み
      const pinRef = doc(db, 'admin_data/checkin')
      const pinSnap = await getDoc(pinRef)

      if (pinSnap.exists()) {
        const data = pinSnap.data()
        setEnterPin(data.enterPin)
        setExitPin(data.exitPin)
      }

      setLoading(false)
    })
  }, [])

  // 入室PIN更新
  const updateEnterPin = async () => {
    const newPin = generatePin()
    setEnterPin(newPin)
    await setDoc(doc(db, 'admin_data/checkin'), {
      enterPin: newPin,
      exitPin, // 退出PINは維持
      date: new Date().toISOString().slice(0,10)
    })
    alert(`入室PINを更新 → ${newPin}`)
  }

  // 退出PIN更新
  const updateExitPin = async () => {
    const newPin = generatePin()
    setExitPin(newPin)
    await setDoc(doc(db, 'admin_data/checkin'), {
      enterPin,
      exitPin: newPin,
      date: new Date().toISOString().slice(0,10)
    })
    alert(`退出PINを更新 → ${newPin}`)
  }

  if (loading) return <div>読み込み中...</div>

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>入室・退出 PIN 管理</h1>

      <div style={styles.box}>
        <h3>入室PIN（enterPin）</h3>
        <p style={styles.pin}>{enterPin}</p>
        <button style={styles.button} onClick={updateEnterPin}>再生成</button>
      </div>

      <div style={styles.box}>
        <h3>退出PIN（exitPin）</h3>
        <p style={styles.pin}>{exitPin}</p>
        <button style={styles.button} onClick={updateExitPin}>再生成</button>
      </div>
    </div>
  )
}

const styles = {
  container: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  box: {
    padding: 16,
    border: '1px solid #ddd',
    borderRadius: 8,
    marginBottom: 20
  },
  button: {
    padding: '8px 16px',
    background: '#4CAF50',
    border: 'none',
    color: '#fff',
    borderRadius: 6,
    cursor: 'pointer'
  },
  pin: {
    fontSize: 32,
    fontWeight: 'bold',
    margin: '8px 0'
  }
}
