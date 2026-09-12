export const DEFAULT_HOMEWORK_TEMPLATES = {
  materials: [{ id: 'elementary_text', label: '小学生教材', audience: 'elementary' }, { id: 'new_english', label: '新ワーク 英語', audience: 'middle' }, { id: 'new_math', label: '新ワーク 数学', audience: 'middle' }, { id: 'summing', label: 'サミングアップ', audience: 'middle' }, { id: 'words', label: '単語テスト', audience: 'middle', rangeType: 'number' }, { id: 'other', label: 'その他の宿題', audience: 'all' }],
  comments: [{ id: 'focus', label: '集中して取り組めていました。', tone: 'positive' }, { id: 'questions', label: '積極的に質問できていました。', tone: 'positive' }, { id: 'effort', label: '最後まで粘り強く取り組めていました。', tone: 'positive' }, { id: 'support', label: '声かけをしながら学習を進めました。', tone: 'negative' }, { id: 'review', label: '復習が必要な内容がありました。', tone: 'negative' }],
  results: { submitted: '今回の宿題はすべて取り組めていました。', partial: '今回の宿題には、未実施の部分がありました。', missed: '今回の宿題は未実施でした。', pending: '今回の宿題は、まだ確認していません。', absent: '欠席のため、次回の授業で確認します。', none: '今回、宿題の指定はありません。', laterCompleted: '前回未実施だった宿題の完了を確認しました。' },
};
export const RESULT_LABELS = { submitted: '全部提出', partial: '一部未実施', missed: '全部未実施', pending: '未確認', absent: '欠席で保留', none: '宿題なし', laterCompleted: '後日完了' };
export const ITEM_RESULT_LABELS = { submitted: '提出', partial: '途中', missed: '未提出' };
export function aggregateItemResults(items, itemResults = {}) {
  if (!items?.length) return 'none';
  const values = items.map(item => itemResults[item.id]).filter(Boolean);
  if (values.length !== items.length) return 'pending';
  if (values.includes('missed')) return 'missed';
  if (values.includes('partial')) return 'partial';
  return 'submitted';
}
export function homeworkValue(status) {
  if (status === 'submitted') return 'submitted';
  if (status === 'missed') return 'missed';
  if (status === 'partial') return 'partial';
  if (status === 'none') return 'none';
  if (['pending', 'absent', 'laterCompleted'].includes(status)) return 'notEvaluated';
  throw new Error('宿題の確認結果が正しくありません。');
}
export function validateTemplates(value) {
  for (const key of ['materials', 'comments']) {
    if (!Array.isArray(value?.[key]) || value[key].length > 80 || (key === 'materials' && !value[key].length)) throw new Error('選択肢は教材1〜80件、コメント0〜80件で設定してください。');
    const ids = new Set();
    for (const item of value[key]) {
      if (!/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id) || !String(item.label || '').trim() || item.label.length > 200) throw new Error('選択肢のID・名称を確認してください。');
      ids.add(item.id);
    }
  }
  for (const key of Object.keys(RESULT_LABELS)) if (!String(value.results?.[key] || '').trim() || value.results[key].length > 300) throw new Error('結果の定型文をすべて設定してください。');
  return { materials: value.materials.map(({ id, label, audience, rangeType }) => ({ id, label: label.trim(), audience: ['elementary','middle','all'].includes(audience) ? audience : 'all', ...(rangeType === 'number' ? { rangeType } : {}) })), comments: value.comments.map(({ id, label, tone }) => ({ id, label: label.trim(), tone: tone === 'negative' ? 'negative' : 'positive' })), results: Object.fromEntries(Object.keys(RESULT_LABELS).map(key => [key, value.results[key].trim()])) };
}
export function validateAssignment(input, templates) {
  const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!validDate(input.assignedDate) || !validDate(input.dueDate) || input.dueDate < input.assignedDate) throw new Error('指示日と確認予定日を確認してください。');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 20) throw new Error('宿題は1〜20件で登録してください。');
  const items = input.items.map((item, index) => {
    const material = templates.materials.find(option => option.id === item.materialId);
    if (!material || !String(item.range || '').trim() || item.range.length > 300) throw new Error('教材とページ・範囲を指定してください。');
    if (material.rangeType === 'number' && !/^No\.\d+〜\d+$/.test(item.range)) throw new Error('単語テストは開始番号と終了番号を入力してください。');
    return { id: String(index), materialId: material.id, materialLabel: material.label, range: item.range.trim() };
  });
  return { assignedDate: input.assignedDate, dueDate: input.dueDate, items };
}
export function publicAssignment(data) {
  const result = value => value ? { status: value.status, text: value.text, date: value.date, missingIds: value.missingIds || [], itemResults: value.itemResults || {} } : null;
  return { assignedDate: data.assignedDate, dueDate: data.dueDate, items: (data.items || []).map(item => ({ id: item.id, materialId: item.materialId, materialLabel: item.materialLabel, range: item.range })), review: result(data.review), laterCompletion: result(data.laterCompletion) };
}
