'use client'
import { calcBehaviorScore } from './BehaviorScoreUtil'

export default function BehaviorScoreScatter({ students, selectedUid }) {
  const width=420, height=260, pad=40

  const points = students.map(s=>({
    uid:s.uid,
    x:calcBehaviorScore(s.behaviorSummary),
    y:(s.exam||0)+(s.internal||0)
  }))

  const xs=points.map(p=>p.x), ys=points.map(p=>p.y)
  const minX=Math.min(...xs,0), maxX=Math.max(...xs,10)
  const minY=Math.min(...ys,0), maxY=Math.max(...ys,500)

  const scaleX=x=>pad+(x-minX)/(maxX-minX)*(width-pad*2)
  const scaleY=y=>height-pad-(y-minY)/(maxY-minY)*(height-pad*2)

  return (
    <svg width={width} height={height} className="scatter">
      <rect x={pad} y={pad} width={width-pad*2} height={height-pad*2} fill="#fafafa" stroke="#ccc"/>
      {points.map(p=>(
        <circle key={p.uid}
          cx={scaleX(p.x)} cy={scaleY(p.y)}
          r={p.uid===selectedUid?7:4}
          fill={p.uid===selectedUid?'#e53935':'#1e88e5'}
        />
      ))}
      <text x={width/2} y={height-6} textAnchor="middle">生活態度 →</text>
      <text x={6} y={height/2} transform={`rotate(-90 6 ${height/2})`}>成績 →</text>
    </svg>
  )
}
