'use client'
import { useEffect, useState } from 'react'
import { db } from '../../../firebaseConfig'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import './history.css'

export default function RewardHistory() {
  const [user, setUser] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getAuth()
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        window.location.href = '/login'
        return
      }
      setUser(currentUser)
      await fetchHistory(currentUser.uid)
    })
    return () => unsubscribe()
  }, [])

  // 🔹 Firestore配列（users/{uid}.rewardHistory）から取得
  const fetchHistory = async (uid) => {
    try {
      const userRef = doc(db, 'users', uid)
      const snap = await getDoc(userRef)
      if (!snap.exists()) {
        setHistory([])
        return
      }
      const data = snap.data()
      const list = (data.rewardHistory || []).sort(
        (a, b) => new Date(b.date) - new Date(a.date)
      )
      setHistory(list)
    } catch (error) {
      console.error('履歴取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return '日時不明'
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  if (loading) return <p className="loading-text">読み込み中...</p>

  return (
    <div className="history-container">
      <h1 className="title">🎁 交換履歴</h1>

      {history.length === 0 ? (
        <p className="no-history">まだ交換履歴がありません。</p>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>景品名</th>
              <th>ポイント</th>
              <th>交換日</th>
              <th>確認状態</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item, index) => (
              <tr key={index}>
                <td>{item.name}</td>
                <td>{item.cost} pt</td>
                <td>{formatDate(item.date)}</td>
                <td>{item.verified ? '✅ 交換済み' : '⏳ 未交換'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="bottom-buttons">
        <button
          onClick={() => (window.location.href = '/rewards')}
          className="back-button rewards"
        >
          🎁 景品交換ページに戻る
        </button>
      </div>
    </div>
  )
}
