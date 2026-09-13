'use client'
import { useAcademicContext } from '@/lib/useAcademicContext'
import { getBehaviorSummary } from '@/lib/termCompatibility'

import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from 'firebase/auth'
import { db } from '@/../firebaseConfig'
import { doc, getDoc } from 'firebase/firestore'
import './behavior.css'


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

  const academic=useAcademicContext();
  const YEARS=academic.settings.map(item=>String(item.year));
  const [year, setYear] = useState('')
  useEffect(()=>{if(academic.current){setYear(String(academic.current.year));setTerm(`${academic.current.term}学期`)}},[academic.current])
  const [term, setTerm] = useState('1学期')

  const [summary, setSummary] = useState(null)
  const [summaryError, setSummaryError] = useState('')

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
    if (!user || !year) return
    let cancelled = false
    setSummary(null)
    setSummaryError('')

    const load = async () => {
      const snap = await getBehaviorSummary(db, user.uid, year, term)
      if (cancelled) return

      if (snap.exists()) {
        setSummary(snap.data())
      } else {
        setSummary(null)
      }
    }

    load().catch(() => { if (!cancelled) setSummaryError('生活態度を取得できませんでした。再読み込みしてください。') })
    return () => { cancelled = true }
  }, [user, year, term])

  if (academic.error) return <p role="alert">{academic.error}</p>
  if (loading || academic.loading) return <p>読み込み中...</p>
  if (!user) return <p>ログインしてください</p>
  if (summaryError) return <p role="alert">{summaryError}</p>

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

  const homeworkTotal = homeworkData
    ? Object.values(homeworkData).reduce((sum, value) => sum + value, 0)
    : 0
  const attendanceTotal = summary
    ? (summary.attendance?.ontime || 0) + (summary.attendance?.late || 0)
    : 0
  const homeworkRate = homeworkTotal
    ? Math.round((homeworkData.提出 / homeworkTotal) * 100)
    : 0
  const ontimeRate = attendanceTotal
    ? Math.round(((summary.attendance?.ontime || 0) / attendanceTotal) * 100)
    : 0

  return (
    <div className="page behavior-page">
      <header className="behavior-heading">
        <span>LEARNING HABITS</span>
        <h1>生活態度</h1>
        <p>宿題・出席・忘れ物の状況を振り返ります。</p>
      </header>

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
        <>
        <section className="behavior-overview" aria-label="学期サマリー">
          <div>
            <span>HOMEWORK</span>
            <strong>{homeworkRate}<small>%</small></strong>
            <p>宿題提出率</p>
          </div>
          <div>
            <span>ON TIME</span>
            <strong>{ontimeRate}<small>%</small></strong>
            <p>時間通りに出席</p>
          </div>
          <div>
            <span>WORD TEST</span>
            <strong>{summary.wordTest?.averageRate || 0}<small>%</small></strong>
            <p>単語テスト平均</p>
          </div>
        </section>
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
              <li><span className="green" />時間通り：{attendanceData.時間通り}</li>
              <li><span className="orange" />遅刻：{attendanceData.遅刻}</li>
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

          <div className="summary-card simple">
            <h3>欠席・振替</h3>
            <div className="attendance-detail">
              <span>欠席 <strong>{summary.attendance?.absent || 0}</strong>回</span>
              <span>振替 <strong>{summary.attendance?.makeup || 0}</strong>回</span>
            </div>
          </div>

          <div className="summary-card simple">
            <h3>単語テスト</h3>
            <div className="big-number word-rate">
              {summary.wordTest?.averageRate || 0}
              <span>%</span>
            </div>
            <p>{summary.wordTest?.completed || 0}回実施</p>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
