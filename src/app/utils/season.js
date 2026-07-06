// 現在の学期を取得
export function getCurrentSeason() {
  const now = new Date()
  const dateId = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')

  const configured2026 = {
    1: { start: '2026-03-30', end: '2026-09-02' },
    2: { start: '2026-09-03', end: '2026-12-26' },
    3: { start: '2026-12-28', end: '2027-03-27' },
  }

  for (const [term, period] of Object.entries(configured2026)) {
    if (dateId >= period.start && dateId <= period.end) {
      return { year: 2026, term: Number(term), id: `2026_${term}` }
    }
  }

  const month = now.getMonth() + 1
  const calendarYear = now.getFullYear()

  let term

  if (month >= 4 && month <= 8) {
    term = 1
  } else if (month >= 9 && month <= 12) {
    term = 2
  } else {
    term = 3
  }

  // 1〜3月は前年度の3学期
  const year = month <= 3 ? calendarYear - 1 : calendarYear

  return {
    year,
    term,
    id: `${year}_${term}`,
  }
}

// 前学期を取得
export function getPreviousSeason() {
  const { year, term } = getCurrentSeason()

  if (term === 1) {
    return {
      year: year - 1,
      term: 3,
      id: `${year - 1}_3`,
    }
  }

  return {
    year,
    term: term - 1,
    id: `${year}_${term - 1}`,
  }
}
