'use client'

export default function FinalCorrelationChart({ points, meUid }) {
  if (!points || points.length === 0) {
    return <p className="empty">相関データなし</p>
  }

  const W = 480
  const H = 300
  const PAD = 40

  const xMax = 32
  const yMax = 500

  const x = v => PAD + (v / xMax) * (W - PAD * 2)
  const y = v => H - PAD - (v / yMax) * (H - PAD * 2)

  return (
    <div className="correlation-chart">
      <h3>成績 × 生活態度（全生徒分布）</h3>

      <svg width={W} height={H}>
        {/* 枠 */}
        <rect
          x={PAD}
          y={PAD}
          width={W - PAD * 2}
          height={H - PAD * 2}
          fill="none"
          stroke="#ccc"
        />

        {/* 中央線 */}
        <line
          x1={x(xMax / 2)}
          y1={PAD}
          x2={x(xMax / 2)}
          y2={H - PAD}
          stroke="#ccc"
          strokeDasharray="4"
        />
        <line
          x1={PAD}
          y1={y(yMax / 2)}
          x2={W - PAD}
          y2={y(yMax / 2)}
          stroke="#ccc"
          strokeDasharray="4"
        />

        {/* 点 */}
        {points.map((p, i) => {
          const isMe = p.uid === meUid
          return (
            <circle
              key={i}
              cx={x(p.behavior)}
              cy={y(p.score)}
              r={isMe ? 6 : 4}
              fill={isMe ? '#e53935' : '#64b5f6'}
              opacity={isMe ? 1 : 0.8}
            />
          )
        })}
      </svg>

      <div className="legend">
        <span className="me">● あなた</span>
        <span className="other">● 他の生徒</span>
      </div>

      <p className="hint">
        右上ほど「生活態度・成績ともに良好」
      </p>
    </div>
  )
}
