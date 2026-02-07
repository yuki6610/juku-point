export default function ScoreBreakdown({ exam, internal }) {
  if (!exam && !internal) return null

  return (
    <div className="score-breakdown">
      {/* =====================
         五教科テスト
      ===================== */}
      {exam && (
        <div className="score-block">
          <h3>五教科テスト</h3>

          <div className="grid">
            {['国語','社会','数学','理科','英語'].map(k => (
              <div key={k}>
                <label>{k}</label>
                <div className="score-view">
                  {exam.exam?.[k] ?? '-'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================
         内申点
      ===================== */}
      {internal && (
        <div className="score-block">
          <h3>内申点</h3>

          <p>五教科</p>
          <div className="grid">
            {['国語','社会','数学','理科','英語'].map(k => (
              <div key={k}>
                <label>{k}</label>
                <div className="score-view">
                  {internal.internalMain?.[k] ?? '-'}
                </div>
              </div>
            ))}
          </div>

          <p>副教科</p>
          <div className="grid-sub">
            {['音楽','美術','保体','技家'].map(k => (
              <div key={k}>
                <label>{k}</label>
                <div className="score-view">
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
