export function lessonStudent(id, data, source = 'user') {
  const grade = Number(data.grade);
  if (data.active === false || data.enrollmentStatus === 'withdrawn' || !Number.isInteger(grade)) return null;
  if (source === 'elementary' ? grade < 1 || grade > 9 : grade < 7 || grade > 12) return null;
  return { ...data, id, source, grade, uid: `${source}_${id}`, realName: data.realName || data.name || data.displayName || '名前未設定' };
}
export const isMiddleStudent = student => student?.grade >= 7 && student.grade <= 9;
export const studentGradeLabel = grade => grade <= 6 ? `小${grade}` : grade <= 9 ? `中${grade - 6}` : `高${grade - 9}`;

export function learningFields(record) {
  const homework = record?.homework;
  const status = record?.wordTest?.status;
  if (!['none', 'submitted', 'partial', 'missed', 'notEvaluated'].includes(homework)) throw new Error('宿題の状態が正しくありません。');
  if (!['notScheduled', 'completed', 'pending', 'makeup'].includes(status)) throw new Error('単語テストの状態が正しくありません。');
  const completed = ['completed', 'makeup'].includes(status);
  const correct = Number(record.wordTest.correct), total = Number(record.wordTest.total);
  if (completed && (!Number.isInteger(correct) || !Number.isInteger(total) || correct < 0 || total < 1 || correct > total)) throw new Error('単語テストの点数を確認してください。');
  const extraTests = Array.isArray(record.wordTest.extraTests) ? record.wordTest.extraTests : [];
  if (extraTests.length > 10 || (extraTests.length && !completed) || extraTests.some(item => item?.correct === '' || item?.total === '' || !Number.isInteger(Number(item?.correct)) || !Number.isInteger(Number(item?.total)) || Number(item.correct) < 0 || Number(item.total) < 1 || Number(item.correct) > Number(item.total))) throw new Error('追加した単語テストの点数を確認してください。');
  const range = record?.wordTest?.range;
  const normalizedRange = range && Number.isInteger(Number(range.start)) && Number.isInteger(Number(range.end)) && Number(range.start) > 0 && Number(range.end) >= Number(range.start)
    ? { start: Number(range.start), end: Number(range.end) } : null;
  const forgotItems=Array.isArray(record.forgotItems)?[...new Set(record.forgotItems.filter(item=>['workbook','stationery','other'].includes(item)))]:record.forgot===true?['other']:[];
  return { homework, wordTest: { status, correct: completed ? correct : null, total: completed ? total : null, extraTests: extraTests.map(item => ({ correct: Number(item.correct), total: Number(item.total) })), ...(normalizedRange ? { range: normalizedRange } : {}) }, late: record.late === true, forgot: forgotItems.length>0, forgotItems,forgotOther:String(record.forgotOther||'').trim().slice(0,200), behaviorNote: String(record.behaviorNote || '').trim().slice(0, 5000), learningContent: String(record.learningContent || '').trim().slice(0, 500), reportFacts: record.reportFacts && typeof record.reportFacts === 'object' ? record.reportFacts : {} };
}
