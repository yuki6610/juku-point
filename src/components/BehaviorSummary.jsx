'use client'
import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/../firebaseConfig'

export default function BehaviorSummary({ uid, year, term }) {
  const [summary, setSummary] = useState(null)
  const [totalWordTestScore, setTotalWordTestScore] = useState(0)

  useEffect(() => {
    if (!uid || !year || !term) return

    const load = async () => {
      const snap = await getDoc(
        doc(db, 'users', uid, 'behaviorSummary', `${year}_${term}`)
      )

      if (!snap.exists()) {
        setSummary(null)
        return
      }

      setSummary(snap.data())

      // ★ 単語テスト総得点取得（users直下）
      const userSnap = await getDoc(doc(db, 'users', uid))
      if (userSnap.exists()) {
        setTotalWordTestScore(userSnap.data().totalWordTestScore || 0)
      }
    }

    load()
  }, [uid, year, term])

  if (!summary) {
    return <p className="empty">この学期の生活態度データはありません</p>
  }

  /* ===== 円グラフ用データ ===== */
  const homeworkItems = [
    { label: '提出', value: summary.homework.submitted, color: '#81c784' },
    { label: '途中', value: summary.homework.partial, color: '#ffcc80' },
    { label: '未提出', value: summary.homework.missed, color: '#e53935' },
  ]

  const attendanceItems = [
    { label: '時間通り', value: summary.attendance.ontime, color: '#81c784' },
    { label: '遅刻', value: summary.attendance.late, color: '#e53935' },
  ]

  return (
    <div className="behavior-summary">
      <h3>生活態度（{year} {term}）</h3>

      <div className="pie-row">
        <PieChart title="宿題" items={homeworkItems} />
        <PieChart title="出席" items={attendanceItems} />

        {/* ★ 忘れ物 */}
        <div className="info-card forgot-card">
          <div className="info-label">忘れ物</div>
          <div className="info-value">{summary.forgot} 回</div>
        </div>

        {/* ★ 授業回数 */}
        <div className="info-card">
          <div className="info-label">授業回数</div>
          <div className="info-value">{summary.lessonCount || 0}</div>
        </div>

        {/* ★ 単語テスト総得点 */}
        <div className="info-card">
          <div className="info-label">単語テスト総得点</div>
          <div className="info-value">{totalWordTestScore}</div>
        </div>
      </div>
    </div>
  )
}

/* ===== SVG 円グラフ ===== */
function PieChart({ title, items }) {
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const total = sorted.reduce((a, i) => a + i.value, 0)
  if (total === 0) return <p className="empty">{title}：記録なし</p>

  if (sorted.filter(i => i.value > 0).length === 1) {
    return (
      <div className="pie">
        <svg width="120" height="120">
          <circle
            cx="60"
            cy="60"
            r="48"
            fill={sorted.find(i => i.value > 0).color}
          />
        </svg>

        <div className="legend">
          <strong>{title}</strong>
          {sorted.map(i => (
            <div key={i.label}>
              <span style={{ background: i.color }} />
              {i.label}：{i.value}
            </div>
          ))}
        </div>
      </div>
    )
  }

  let acc = 0
  const R = 48
  const C = 60

  return (
    <div className="pie">
      <svg width="120" height="120">
        {sorted.map((i, idx) => {
          const start = (acc / total) * 2 * Math.PI - Math.PI / 2
          const angle = (i.value / total) * 2 * Math.PI
          acc += i.value

          const x1 = C + R * Math.cos(start)
          const y1 = C + R * Math.sin(start)
          const x2 = C + R * Math.cos(start + angle)
          const y2 = C + R * Math.sin(start + angle)
          const large = angle > Math.PI ? 1 : 0

          return (
            <path
              key={idx}
              d={`M${C},${C} L${x1},${y1} A${R},${R} 0 ${large} 1 ${x2},${y2} Z`}
              fill={i.color}
            />
          )
        })}
      </svg>

      <div className="legend">
        <strong>{title}</strong>
        {sorted.map(i => (
          <div key={i.label}>
            <span style={{ background: i.color }} />
            {i.label}：{i.value}
          </div>
        ))}
      </div>
    </div>
  )
}
