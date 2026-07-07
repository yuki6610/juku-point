'use client'

import { useEffect, useState } from 'react'
import { db } from '../../../firebaseConfig'
import { collection, doc, getDocs, limit, orderBy, query, updateDoc } from 'firebase/firestore'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import './rewardHistory.css'

export default function AdminRewardHistory() {
  const [user, setUser] = useState(null)
  const [history, setHistory] = useState([])
  const [filteredHistory, setFilteredHistory] = useState([])
  const [filterMode, setFilterMode] = useState('all') // all | unverified
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getAuth()
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        window.location.href = '/login'
        return
      }
      setUser(currentUser)
      await fetchAllHistories()
    })
    return () => unsubscribe()
  }, [])

  // 🔹 新形式のサブコレクションを優先し、旧配列形式も互換表示
  const fetchAllHistories = async () => {
    try {
      const usersRef = collection(db, 'users')
      const snapshot = await getDocs(usersRef)
      const perUserHistories = await Promise.all(snapshot.docs.map(async (userDoc) => {
        const data = userDoc.data()
        const userName = data.displayName || data.realName || '未登録'
        const subSnap = await getDocs(query(
          collection(db, 'users', userDoc.id, 'rewardHistory'),
          orderBy('date', 'desc'),
          limit(100)
        ))
        const subItems = subSnap.docs.map((historyDoc) => ({
          userId: userDoc.id,
          userName,
          historyId: historyDoc.id,
          ...historyDoc.data(),
        }))

        if (subItems.length > 0) return subItems

        return (data.rewardHistory || []).map((item, index) => ({
          userId: userDoc.id,
          userName,
          index,
          legacy: true,
          ...item,
        }))
      }))

      const all = perUserHistories.flat()

      // 日付順にソート（新しい順）
      all.sort((a, b) => toMillis(b.date) - toMillis(a.date))
      setHistory(all)
      applyFilter(filterMode, all)
    } catch (error) {
      console.error('履歴読み込みエラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 🔸 管理者が「確認済み」に変更
  const handleVerify = async (item) => {
    try {
      if (!item.legacy && item.historyId) {
        await updateDoc(doc(db, 'users', item.userId, 'rewardHistory', item.historyId), {
          verified: true,
          verifiedAt: new Date(),
        })
        alert('確認済みにしました ✅')
        fetchAllHistories()
        return
      }

      const usersRef = collection(db, 'users')
      const userSnap = await getDocs(usersRef)
      const userDocData = userSnap.docs.find((userDoc) => userDoc.id === item.userId)
      if (!userDocData) return
      const userData = userDocData.data()
      const newHistory = userData.rewardHistory || []
      newHistory[item.index].verified = true

      const userRef = doc(db, 'users', item.userId)
      await updateDoc(userRef, { rewardHistory: newHistory })

      alert('確認済みにしました ✅')
      fetchAllHistories()
    } catch (error) {
      console.error('確認処理エラー:', error)
    }
  }

  const toMillis = (value) => {
    if (!value) return 0
    if (typeof value.toDate === 'function') return value.toDate().getTime()
    if (typeof value.seconds === 'number') return value.seconds * 1000
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
  }

  // 🔹 フィルタ適用
  const applyFilter = (mode, list = history) => {
    if (mode === 'unverified') {
      setFilteredHistory(list.filter((item) => !item.verified))
    } else {
      setFilteredHistory(list)
    }
  }

  // 🔹 フィルタボタン切り替え
  const handleFilterChange = (mode) => {
    setFilterMode(mode)
    applyFilter(mode)
  }

  if (loading) return <p className="loading-text">読み込み中...</p>

  return (
    <div className="admin-history-container">
      <h1 className="admin-history-title">🎁 交換履歴管理</h1>

      {/* 🔘 フィルタボタン */}
      <div className="filter-buttons">
        <button
          className={`filter-button ${filterMode === 'all' ? 'active' : ''}`}
          onClick={() => handleFilterChange('all')}
        >
          📋 全件表示
        </button>
        <button
          className={`filter-button ${filterMode === 'unverified' ? 'active' : ''}`}
          onClick={() => handleFilterChange('unverified')}
        >
          ⏳ 未確認のみ
        </button>
      </div>

      {filteredHistory.length === 0 ? (
        <p className="no-history">該当する履歴がありません。</p>
      ) : (
        <table className="admin-history-table">
          <thead>
            <tr>
              <th>生徒名</th>
              <th>景品名</th>
              <th>ポイント</th>
              <th>交換日</th>
              <th>確認状態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredHistory.map((item, i) => (
              <tr key={i}>
                <td>{item.userName}</td>
                <td>{item.name}</td>
                <td>{item.cost} pt</td>
                <td>
                  {item.date
                    ? new Date(toMillis(item.date)).toLocaleDateString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '不明'}
                </td>
                <td>{item.verified ? '✅ 交換済み' : '⏳ 未交換'}</td>
                <td>
                  {!item.verified && (
                    <button
                      className="verify-button"
                      onClick={() => handleVerify(item)}
                    >
                      確認する
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 🔙 戻るボタン */}
      <div className="bottom-buttons">
        <button
          onClick={() => (window.location.href = '/admin')}
          className="back-button"
        >
          🔙 管理ページに戻る
        </button>
      </div>
    </div>
  )
}
