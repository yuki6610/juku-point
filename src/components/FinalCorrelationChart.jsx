'use client'

export default function FinalCorrelationChart({ points, meUid }) {
  if (!points || points.length === 0) {
    return <p className="empty">相関データなし</p>
  }

  const W = 760
const H = 320
const PAD = 50

  const xMax = 100
  const yMax = 500

  const x = v => PAD + (v / xMax) * (W - PAD * 2)
  const y = v => H - PAD - (v / yMax) * (H - PAD * 2)

  return (
    <div className="correlation-chart">
      <h3>5計＆生活態度スコアの全生徒分布</h3>

      <svg
  width="100%"
  viewBox={`0 0 ${W} ${H}`}
  style={{ maxWidth: '100%' }}
>
  {/* 枠 */}
  <rect
    x={PAD}
    y={PAD}
    width={W - PAD * 2}
    height={H - PAD * 2}
    fill="none"
    stroke="#ccc"
  />

  {/* ===== 軸ラベル ===== */}

  {/* 横軸タイトル */}
  <text
    x={W / 2}
    y={H - 5}
    textAnchor="middle"
    fontSize="13"
    fill="#555"
  >
    生活態度スコア
  </text>

  {/* 縦軸タイトル（回転） */}
  <text
    x={15}
    y={H / 2}
    textAnchor="middle"
    fontSize="13"
    fill="#555"
  >
    5計
  </text>

  {/* 目盛り数値 */}
  <text x={PAD - 10} y={H - PAD + 5} fontSize="11" fill="#777" textAnchor="end">
    0
  </text>
  <text x={PAD - 10} y={PAD + 5} fontSize="11" fill="#777" textAnchor="end">
    {yMax}
  </text>

  <text x={PAD} y={H - PAD + 20} fontSize="11" fill="#777">
    0
  </text>
  <text
    x={W - PAD}
    y={H - PAD + 20}
    fontSize="11"
    fill="#777"
    textAnchor="end"
  >
    {xMax}
  </text>

  {/* ===== 中央線 ===== */}
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
      <p className="hint">
        右上ほど「生活態度・成績ともに良好」
      </p>
    </div>
  )
}
