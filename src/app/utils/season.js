// 現在の学期を取得
export function getCurrentSeason() {
  const now = new Date()

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
