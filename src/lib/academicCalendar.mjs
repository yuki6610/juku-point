export function japanDateId(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function resolveAcademicTerm(settings, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('日付が正しくありません。');
  const matches = [];
  for (const entry of settings) {
    for (const term of [1, 2, 3]) {
      const period = entry.terms?.[term];
      if (period?.start && period?.end && period.start <= date && date <= period.end) {
        matches.push({ year: Number(entry.year), term, id: `${entry.year}_${term}`, start: period.start, end: period.end });
      }
    }
  }
  if (matches.length !== 1) throw new Error(matches.length ? '学期期間が重複しています。授業設定を確認してください。' : 'この日付の学期設定がありません。授業設定で期間を登録してください。');
  return matches[0];
}
