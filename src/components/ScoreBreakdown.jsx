export default function ScoreBreakdown({ exam, internal }) {
  if (!exam && !internal) return null

  const mainSubjects = ['国語','社会','数学','理科','英語']
  const subSubjects  = ['音楽','美術','保体','技家']

  return (
    <div className="score-breakdown">

      {/* ===== 五教科テスト ===== */}
      {exam && (
        <div className="score-block">
          <h3>五教科テスト</h3>

          <div className="score-row">
            {mainSubjects.map(k => (
              <div key={k} className="score-card">
                <div className="label">{k}</div>
                <div className="value">
                  {exam.exam?.[k] ?? '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== 内申点 ===== */}
      {internal && (
        <div className="score-block">
          <h3>内申点</h3>

          <h4>五教科</h4>
          <div className="score-row">
            {mainSubjects.map(k => (
              <div key={k} className="score-card">
                <div className="label">{k}</div>
                <div className="value">
                  {internal.internalMain?.[k] ?? '-'}
                </div>
              </div>
            ))}
          </div>

          <h4 className="sub-title">副教科</h4>
          <div className="score-row">
            {subSubjects.map(k => (
              <div key={k} className="score-card">
                <div className="label">{k}</div>
                <div className="value">
                  {internal.internalSub?.[k] ?? '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
