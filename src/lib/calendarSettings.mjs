export function validateTerms(year, terms) {
  if (!Number.isInteger(year) || year < 1900 || year > 9998) throw new Error('年度は1900〜9998の整数で入力してください。');
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  let previous = '';
  for (const term of [1, 2, 3]) {
    const p = terms?.[term];
    if (!valid(p?.start) || !valid(p?.end) || p.start > p.end) throw new Error(`${term}学期の開始日・終了日を確認してください。`);
    if (p.start <= previous) throw new Error('学期期間が重複しているか、順番が逆になっています。');
    if (p.start < `${year}-01-01` || p.end > `${year + 1}-12-31`) throw new Error('学期期間は選択年度〜翌年の範囲で設定してください。');
    previous = p.end;
  }
}

export function validateOtherYears(year, terms, existing) {
  validateTerms(year, terms);
  for (const entry of existing) {
    if (Number(entry.year) === year) continue;
    for (const period of Object.values(entry.terms || {})) {
      if (!period?.start || !period?.end) continue;
      if (Object.values(terms).some(next => next.start <= period.end && period.start <= next.end)) {
        throw new Error(`${entry.year}年度の学期期間と重複しています。両年度の開始日・終了日を確認してください。`);
      }
    }
  }
}
