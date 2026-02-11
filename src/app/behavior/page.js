'use client'

import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import { doc, getDoc } from 'firebase/firestore'
import './behavior.css'

const YEARS = ['2024', '2025', '2026']
const TERMS = ['1学期', '2学期', '3学期']

/* =====================
   円グラフ（デザイン維持）
===================== */
function Pie({ data }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0)

  if (!total) return <div className="pie empty" />

  let acc = 0
  const colors = ['#4caf50', '#ffb300', '#e53935', '#1e88e5']

  return (
    <div className="pie-wrap">
      <div
        className="pie"
        style={{
          background: `conic-gradient(${Object.entries(data)
            .map(([_, v], i) => {
              const start = (acc / total) * 360
              const angle = (v / total) * 360
              acc += v
              return `${colors[i % colors.length]} ${start}deg ${start + angle}deg`
            })
            .join(',')})`,
        }}
      />
    </div>
  )
}

export default function StudentBehaviorPage() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [year, setYear] = useState('2026')
  const [term, setTerm] = useState('1学期')

  const [summary, setSummary] = useState(null)

  /* =====================
     認証
  ===================== */
  useEffect(() => {
    const auth = getAuth()
    return onAuthStateChanged(auth, u => {
      setUser(u)
      setLoading(false)
    })
  }, [])

  /* =====================
     behaviorSummary 直読み
  ===================== */
  useEffect(() => {
    if (!user) return

    const load = async () => {
      const snap = await getDoc(
        doc(
          db,
          'users',
          user.uid,
          'behaviorSummary',
          `${year}_${term}`
        )
      )

      if (snap.exists()) {
        setSummary(snap.data())
      } else {
        setSummary(null)
      }
    }

    load()
  }, [user, year, term])

  if (loading) return <p>読み込み中...</p>
  if (!user) return <p>ログインしてください</p>

  const homeworkData = summary
    ? {
        提出: summary.homework?.submitted || 0,
        途中: summary.homework?.partial || 0,
        未提出: summary.homework?.missed || 0,
      }
    : null

  const attendanceData = summary
    ? {
        時間通り: summary.attendance?.ontime || 0,
        遅刻: summary.attendance?.late || 0,
      }
    : null

  return (
    <div className="page behavior-page">
      <h1>🌱 生活態度</h1>

      <div className="select-row">
        <select value={year} onChange={e => setYear(e.target.value)}>
          {YEARS.map(y => (
            <option key={y}>{y}</option>
          ))}
        </select>

        <select value={term} onChange={e => setTerm(e.target.value)}>
          {TERMS.map(t => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      {!summary ? (
        <p className="empty">この学期の記録はまだありません</p>
      ) : (
        <div className="summary-grid">
          {/* 宿題 */}
          <div className="summary-card">
            <h3>宿題</h3>
            <Pie data={homeworkData} />
            <ul className="legend">
              <li><span className="green" />提出：{homeworkData.提出}</li>
              <li><span className="orange" />途中：{homeworkData.途中}</li>
              <li><span className="red" />未提出：{homeworkData.未提出}</li>
            </ul>
          </div>

          {/* 出席 */}
          <div className="summary-card">
            <h3>出席</h3>
            <Pie data={attendanceData} />
            <ul className="legend">
              <li><span className="blue" />時間通り：{attendanceData.時間通り}</li>
              <li><span className="purple" />遅刻：{attendanceData.遅刻}</li>
            </ul>
          </div>

          {/* 忘れ物 */}
          <div className="summary-card simple">
            <h3>忘れ物</h3>
            <div className="big-number">
              {summary.forgot || 0}
              <span>回</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
