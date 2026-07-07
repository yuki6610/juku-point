'use client'
import { useEffect, useState } from 'react'
import { db } from '../../../firebaseConfig'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitQuery,
  orderBy,
  query,
  startAfter,
} from 'firebase/firestore'
import './history.css'

const PAGE_SIZE = 30

export default function RewardHistory() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [uid, setUid] = useState('')
  const [lastDoc, setLastDoc] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [usingLegacyHistory, setUsingLegacyHistory] = useState(false)

  useEffect(() => {
    const auth = getAuth()
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        window.location.href = '/login'
        return
      }
      setUid(currentUser.uid)
      await fetchHistory(currentUser.uid)
    })
    return () => unsubscribe()
  }, [])

  const fetchHistoryPage = async (targetUid, afterDoc = null) => {
    const constraints = [orderBy('date', 'desc'), limitQuery(PAGE_SIZE)]
    if (afterDoc) constraints.push(startAfter(afterDoc))
    const snap = await getDocs(query(collection(db, 'users', targetUid, 'rewardHistory'), ...constraints))
    return {
      list: snap.docs.map((item) => ({ id: item.id, ...item.data() })),
      last: snap.docs[snap.docs.length - 1] || null,
      hasNext: snap.docs.length === PAGE_SIZE,
    }
  }

  const fetchHistory = async (targetUid) => {
    try {
      const page = await fetchHistoryPage(targetUid)
      if (page.list.length > 0) {
        setHistory(page.list)
        setLastDoc(page.last)
        setHasMore(page.hasNext)
        setUsingLegacyHistory(false)
        return
      }

      // 旧データ互換：以前の配列形式しかない場合だけ読み込む
      const userRef = doc(db, 'users', targetUid)
      const snap = await getDoc(userRef)
      if (!snap.exists()) {
        setHistory([])
        return
      }
      const data = snap.data()
      const list = [...(data.rewardHistory || [])].sort(
        (a, b) => toDate(b.date) - toDate(a.date)
      ).slice(0, PAGE_SIZE)
      setHistory(list)
      setLastDoc(null)
      setHasMore(false)
      setUsingLegacyHistory(Array.isArray(data.rewardHistory) && data.rewardHistory.length > PAGE_SIZE)
    } catch (error) {
      console.error('履歴取得エラー:', error)
      setError('交換履歴を取得できませんでした。')
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (!uid || !lastDoc || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await fetchHistoryPage(uid, lastDoc)
      setHistory((current) => [...current, ...page.list])
      setLastDoc(page.last)
      setHasMore(page.hasNext)
    } catch (error) {
      console.error('追加履歴取得エラー:', error)
      setError('追加の交換履歴を取得できませんでした。')
    } finally {
      setLoadingMore(false)
    }
  }

  const toDate = (value) => {
    if (!value) return new Date(0)
    if (typeof value.toDate === 'function') return value.toDate()
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? new Date(0) : date
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return '日時不明'
    const date = toDate(timestamp)
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  if (loading) return <p className="loading-text">読み込み中...</p>

  const filteredHistory = history.filter((item) => {
    if (filter === 'verified') return item.verified
    if (filter === 'pending') return !item.verified
    return true
  })
  const totalCost = history.reduce(
    (sum, item) => sum + Math.abs(Number(item.cost || 0)),
    0
  )

  return (
    <main className="history-shell">
    <div className="history-container">
      <header className="history-heading">
        <span>REWARD ACTIVITY</span>
        <h1>交換履歴</h1>
        <p>交換した景品と受け取り状況を確認できます。</p>
      </header>

      <section className="history-summary">
        <div><span>表示中</span><strong>{history.length}<small>件</small></strong></div>
        <div><span>使用ポイント</span><strong>{totalCost.toLocaleString()}<small>pt</small></strong></div>
        <div><span>未受取</span><strong>{history.filter(item => !item.verified).length}<small>件</small></strong></div>
      </section>

      <div className="history-filters">
        {[['all','すべて'],['pending','未受取'],['verified','受取済み']].map(([value,label]) => (
          <button
            type="button"
            key={value}
            className={filter === value ? 'active' : ''}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="history-error" role="alert">{error}</p>
      ) : history.length === 0 ? (
        <p className="no-history">まだ交換履歴がありません。</p>
      ) : (
        <div className="history-list">
          {filteredHistory.map((item, index) => (
            <article className="history-item" key={item.rewardId || `${formatDate(item.date)}-${index}`}>
              <div className="history-icon">◇</div>
              <div className="history-copy">
                <strong>{item.name}</strong>
                <span>{formatDate(item.date)}</span>
              </div>
              <div className="history-meta">
                <strong>-{Math.abs(Number(item.cost || 0)).toLocaleString()} pt</strong>
                <span className={item.verified ? 'verified' : 'pending'}>
                  {item.verified ? '受取済み' : '未受取'}
                </span>
              </div>
            </article>
          ))}
          {filteredHistory.length === 0 && <p className="no-history">該当する履歴はありません。</p>}
        </div>
      )}

      {usingLegacyHistory && (
        <p className="history-note">古い形式の交換履歴は最新{PAGE_SIZE}件のみ表示しています。今後の交換履歴は軽量な形式で保存されます。</p>
      )}

      {hasMore && (
        <button type="button" className="history-load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? '読み込み中...' : 'もっと見る'}
        </button>
      )}

      <button onClick={() => (window.location.href = '/rewards')} className="store-link">
        景品ストアを見る →
      </button>
    </div>
    </main>
  )
}
