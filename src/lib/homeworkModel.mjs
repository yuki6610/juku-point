export const SUBJECTS = ['japanese','arithmetic','math','english','science','social','all'];
export const DIFFICULTY_LABELS = { 1:'入門', 2:'基礎', 3:'標準', 4:'応用', 5:'発展' };
export const DEFAULT_HOMEWORK_TEMPLATES = {
  materials: [{ id: 'elementary_text', label: '小学生教材', audience: 'elementary', subjects:['japanese','arithmetic','english'], difficulty:2 }, { id: 'new_english', label: '新ワーク 英語', audience: 'all', subjects:['english'], difficulty:2 }, { id: 'new_math', label: '新ワーク 数学', audience: 'middle', subjects:['math'], difficulty:2 }, { id: 'summing', label: 'サミングアップ', audience: 'middle', subjects:['japanese','math','english','science','social'], difficulty:5 }, { id: 'words', label: '単語テスト', audience: 'all', subjects:['english'], difficulty:2, rangeType: 'number' }, { id: 'other', label: 'その他の宿題', audience: 'all', subjects:['all'], difficulty:3, customLabel:true }],
  comments: [{ id: 'focus', label: '集中して取り組めていました。', tone: 'positive' }, { id: 'questions', label: '積極的に質問できていました。', tone: 'positive' }, { id: 'effort', label: '最後まで粘り強く取り組めていました。', tone: 'positive' }, { id: 'support', label: '声かけをしながら学習を進めました。', tone: 'negative' }, { id: 'review', label: '復習が必要な内容がありました。', tone: 'negative' }],
  results: { submitted: '今回の宿題はすべて取り組めていました。', partial: '今回の宿題には、未実施の部分がありました。', missed: '今回の宿題は未実施でした。', pending: '今回の宿題は、まだ確認していません。', absent: '欠席のため、次回の授業で確認します。', none: '今回、宿題の指定はありません。', laterCompleted: '前回未実施だった宿題の完了を確認しました。' },
};
export const materialSubjects = material => Array.isArray(material?.subjects) && material.subjects.length ? material.subjects : [material?.subject || 'all'];
export const materialMatchesSubject = (material, subject) => materialSubjects(material).includes('all') || materialSubjects(material).includes(subject);
export function normalizePageRange(value) {
  const raw=String(value||'').trim();
  const normalized = raw.replace(/^[PpＰ]\.?\s*/, '').replace(/[、，\s]+/g, ',').replace(/[~〜～]+/g, '-').replace(/-+/g, '-').replace(/,+/g, ',').replace(/^,|,$/g, '');
  if (!normalized) return '';
  if (!/^\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*$/.test(normalized)) {
    // ページ番号だけの入力は従来どおり自動変換する。日本語を含む範囲・指示はそのまま保存する。
    const mixed=raw.replace(/[~～]/g,'〜').replace(/\s+/g,' ').trim();
    return /^\d/.test(mixed)?`P.${mixed.replace(/-/g,'〜')}`:mixed;
  }
  for (const part of normalized.split(',')) { const [start,end] = part.split('-').map(Number); if (start < 1 || (end && end < start)) throw new Error('ページ範囲の開始・終了を確認してください。'); }
  return `P.${normalized.replaceAll('-', '〜')}`;
}
export const RESULT_LABELS = { submitted: '全部提出', partial: '一部未実施', missed: '全部未実施', pending: '未確認', absent: '欠席で保留', none: '宿題なし', laterCompleted: '後日完了' };
export const ITEM_RESULT_LABELS = { submitted: '提出', partial: '途中', missed: '未提出' };
export const reviewableHomeworkItems = items => (items || []).filter(item => item.rangeType !== 'number' && item.materialId !== 'words');
export function aggregateItemResults(items, itemResults = {}) {
  items = reviewableHomeworkItems(items);
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
  return { materials: value.materials.map(({ id, label, audience, subjects, subject, difficulty, rangeType, customLabel }) => { const normalizedSubjects=[...new Set((Array.isArray(subjects)&&subjects.length?subjects:[subject||'all']).filter(item=>SUBJECTS.includes(item)))]; return { id, label: label.trim(), audience: ['elementary','middle','all'].includes(audience) ? audience : 'all', subjects:normalizedSubjects.length?normalizedSubjects:['all'], subject:normalizedSubjects[0]||'all', difficulty:Math.min(5,Math.max(1,Number(difficulty)||3)), ...(rangeType === 'number' ? { rangeType } : {}), ...(customLabel === true ? { customLabel:true } : {}) }; }), comments: value.comments.map(({ id, label, tone }) => ({ id, label: label.trim(), tone: tone === 'negative' ? 'negative' : 'positive' })), results: Object.fromEntries(Object.keys(RESULT_LABELS).map(key => [key, value.results[key].trim()])) };
}
export function validateAssignment(input, templates) {
  const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!validDate(input.assignedDate) || !validDate(input.dueDate) || input.dueDate < input.assignedDate) throw new Error('指示日と確認予定日を確認してください。');
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 20) throw new Error('宿題は1〜20件で登録してください。');
  const items = input.items.map((item, index) => {
    const material = templates.materials.find(option => option.id === item.materialId);
    if (!material || String(item.range || '').length > 300) throw new Error('教材とページ・範囲を確認してください。');
    let numberRange='';
    if (material.rangeType === 'number') { const numbers=String(item.range||'').match(/\d+/g)||[];if(numbers.length!==2)throw new Error('単語テストは「101-150」のように開始番号と終了番号を入力してください。');const [start,end]=numbers.map(Number);if(start<1||end<start)throw new Error('単語テストの開始・終了番号を確認してください。');numberRange=`No.${start}〜${end}`; }
    const customLabel=material.customLabel||material.id==='other'?String(item.customLabel||'').trim().slice(0,200):'';
    if ((material.customLabel||material.id==='other')&&!customLabel) throw new Error('その他の宿題の内容を入力してください。');
    const selectedSubject=SUBJECTS.includes(item.subject)?item.subject:materialSubjects(material)[0];
    if (selectedSubject === 'all' && !materialSubjects(material).includes('all')) throw new Error('宿題の教科を選択してください。');
    if (!materialMatchesSubject(material, selectedSubject)) throw new Error('選択した教科と教材が一致しません。');
    if (!String(item.range || '').trim() && !customLabel) throw new Error('ページ・範囲を指定してください。');
    const range=material.rangeType==='number'?numberRange:normalizePageRange(item.range);
    const difficulty=Math.min(5,Math.max(1,Number(item.difficulty)||Number(material.difficulty)||3));
    return { id: String(index), materialId: material.id, materialLabel: customLabel || material.label, templateLabel:material.label, subject:selectedSubject || 'all', subjects:materialSubjects(material), difficulty, note:String(item.note||'').trim().slice(0,300), ...(customLabel?{customLabel}:{}), ...(material.rangeType ? { rangeType:material.rangeType } : {}), range };
  });
  return { assignedDate: input.assignedDate, dueDate: input.dueDate, items };
}
export function publicAssignment(data) {
  const result = value => value ? { status: value.status, text: value.text, date: value.date, missingIds: value.missingIds || [], itemResults: value.itemResults || {} } : null;
  return { assignedDate: data.assignedDate, dueDate: data.dueDate, items: (data.items || []).map(item => ({ id: item.id, materialId: item.materialId, materialLabel: item.materialLabel, note:String(item.note||'').slice(0,300), ...(item.templateLabel ? { templateLabel:item.templateLabel } : {}), ...(item.subject ? { subject:item.subject } : {}), ...(item.subjects ? { subjects:item.subjects } : {}), ...(item.difficulty ? { difficulty:item.difficulty } : {}), ...(item.customLabel ? { customLabel:item.customLabel } : {}), ...(item.rangeType ? { rangeType:item.rangeType } : {}), range: item.range })), review: result(data.review), laterCompletion: result(data.laterCompletion) };
}
