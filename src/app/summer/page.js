'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import './summer.css'

const DEFAULT_END_DATE = '2026-08-22'

export default function SummerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [ranking, setRanking] = useState([])
  const [myRank, setMyRank] = useState(0)
  const [myPoint, setMyPoint] = useState(0)
  const [totalPoint, setTotalPoint] = useState(0)
  const [yenPerPoint, setYenPerPoint] = useState(0.3)
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE)

  useEffect(() => {
    let active = true

    const unsubscribe = onAuthStateChanged(getAuth(), async (currentUser) => {
      if (!currentUser) {
        router.replace('/login')
        return
      }

      setLoading(true)
      setError('')

      try {
        const [userSnap, eventSnap] = await Promise.all([
          getDoc(doc(db, 'users', currentUser.uid)),
          getDoc(doc(db, 'admin_data', 'summerEvent')),
        ])

        if (!active) return

        if (!userSnap.exists()) {
          setError('生徒情報を確認できませんでした。')
          setLoading(false)
          return
        }

        const userData = userSnap.data()
        if (!(userData.courseTags || []).includes('summer_course')) {
          router.replace('/mypage')
          return
        }

        if (eventSnap.exists()) {
          const eventData = eventSnap.data()
          setYenPerPoint(eventData.yenPerPoint ?? 0.3)
          setEndDate(eventData.endDate ?? DEFAULT_END_DATE)
        }

        const usersSnap = await getDocs(
          query(collection(db, 'users'), where('courseTags', 'array-contains', 'summer_course'))
        )

        if (!active) return

        const participants = usersSnap.docs
          .map((item) => {
            const data = item.data()
            return {
              uid: item.id,
              name: data.realName || data.displayName || '名前なし',
              point: Number(data.summerExchangePoint || 0),
              isAdmin: Boolean(data.isAdmin || data.role === 'admin'),
            }
          })
          .filter((student) => !student.isAdmin)
          .sort((a, b) => b.point - a.point || a.name.localeCompare(b.name, 'ja'))

        const total = participants.reduce((sum, student) => sum + student.point, 0)
        const myIndex = participants.findIndex((student) => student.uid === currentUser.uid)

        setRanking(participants)
        setTotalPoint(total)
        setMyPoint(myIndex >= 0 ? participants[myIndex].point : 0)
        setMyRank(myIndex >= 0 ? myIndex + 1 : 0)
        setLoading(false)
      } catch (err) {
        console.error(err)
        if (!active) return
        setError('夏期イベントを読み込めませんでした。時間をおいてもう一度開いてください。')
        setLoading(false)
      }
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [router])

  const contribution = useMemo(
    () => (totalPoint > 0 ? ((myPoint / totalPoint) * 100).toFixed(1) : 0),
    [myPoint, totalPoint]
  )

  const remainDays = useMemo(() => {
    const end = new Date(`${endDate}T23:59:59`)
    if (Number.isNaN(end.getTime())) return 0
    return Math.max(0, Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24)))
  }, [endDate])

  const top3 = ranking.slice(0, 3)

  if (loading) {
    return (
      <main className="summer-page">
        <div className="summer-card summer-loading-card">夏期イベントを読み込み中...</div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="summer-page">
        <div className="summer-card summer-error-card">
          <strong>読み込みに失敗しました</strong>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>もう一度読み込む</button>
        </div>
      </main>
    )
  }

  return (
    <div className="summer-page">
      <header className="summer-hero">
        <div>
          <span>SUMMER CHALLENGE 2026</span>
          <h1>夏を頑張った分、<br />楽しみが大きくなる。</h1>
          <p>景品ストアで交換した対象ポイントが、イベントの食事代に加算されます。</p>
        </div>
        <div className="summer-countdown">
          <small>イベント終了まで</small>
          <strong>{remainDays}</strong>
          <span>DAYS</span>
        </div>
      </header>

      <div className="summer-info">
        <span>🏆</span>
        <div>
          <strong>ランキング1位が食事内容を決定！</strong>
          <p>対象景品を交換して、みんなでイベントを盛り上げよう。</p>
        </div>
      </div>

      <div className="top3-wrap">
        {top3[1] && (
          <div className="top-card silver">
            <div className="medal">🥈</div>
            <div className="top-name">{top3[1].name}</div>
            <div className="top-point">{top3[1].point.toLocaleString()} pt</div>
          </div>
        )}

        {top3[0] && (
          <div className="top-card gold">
            <div className="medal">🥇</div>
            <div className="top-name">{top3[0].name}</div>
            <div className="top-point">{top3[0].point.toLocaleString()} pt</div>
          </div>
        )}

        {top3[2] && (
          <div className="top-card bronze">
            <div className="medal">🥉</div>
            <div className="top-name">{top3[2].name}</div>
            <div className="top-point">{top3[2].point.toLocaleString()} pt</div>
          </div>
        )}
      </div>

      <div className="summer-stats">
        <div className="summer-card point-stat">
          <span>みんなの交換ポイント</span>
          <div className="big-number">{totalPoint.toLocaleString()} <small>pt</small></div>
        </div>
        <div className="summer-card meal-stat">
          <span>現在の食事代</span>
          <div className="big-number">{Math.round(totalPoint * yenPerPoint).toLocaleString()} <small>円</small></div>
        </div>
      </div>

      <div className="summer-card">
        <div className="section-heading">
          <div><span>LEADERBOARD</span><h2>みんなのランキング</h2></div>
          <small>{ranking.length}人が参加中</small>
        </div>

        {ranking.map((rank, index) => (
          <div className="rank-row" key={rank.uid}>
            <span className="rank-number">
              {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}位`}
            </span>
            <span className="rank-name">{rank.name}</span>
            <span className="rank-point">{rank.point.toLocaleString()} pt</span>
          </div>
        ))}
      </div>

      <div className="summer-card">
        <div className="section-heading">
          <div><span>YOUR STATUS</span><h2>あなたの現在地</h2></div>
        </div>

        <div className="my-info">
          <p><strong>順位</strong><br />{myRank || '-'} 位</p>
          <p><strong>交換ポイント</strong><br />{myPoint.toLocaleString()} pt</p>
          <p><strong>全体の貢献度</strong><br />{contribution} %</p>
        </div>
      </div>
    </div>
  )
}
