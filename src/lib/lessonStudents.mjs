export function lessonStudent(id, data, source = 'user') {
  const grade = Number(data.grade);
  if (data.active === false || data.enrollmentStatus === 'withdrawn' || !Number.isInteger(grade)) return null;
  if (source === 'elementary' ? grade < 1 || grade > 6 : grade < 7 || grade > 12) return null;
  return { ...data, id, source, grade, uid: `${source}_${id}`, realName: data.realName || data.name || data.displayName || '名前未設定' };
}
export const isMiddleStudent = student => student?.source === 'user' && student.grade >= 7 && student.grade <= 9;
export const studentGradeLabel = grade => grade <= 6 ? `小${grade}` : grade <= 9 ? `中${grade - 6}` : `高${grade - 9}`;

export function learningFields(record) {
  const homework = record?.homework;
  const status = record?.wordTest?.status;
  if (!['none', 'submitted', 'partial', 'missed', 'notEvaluated'].includes(homework)) throw new Error('宿題の状態が正しくありません。');
  if (!['notScheduled', 'completed', 'pending', 'makeup'].includes(status)) throw new Error('単語テストの状態が正しくありません。');
  const completed = ['completed', 'makeup'].includes(status);
  const correct = Number(record.wordTest.correct), total = Number(record.wordTest.total);
  if (completed && (!Number.isInteger(correct) || !Number.isInteger(total) || correct < 0 || total < 1 || correct > total)) throw new Error('単語テストの点数を確認してください。');
  return { homework, wordTest: { status, correct: completed ? correct : null, total: completed ? total : null }, late: record.late === true, forgot: record.forgot === true, behaviorNote: String(record.behaviorNote || '').trim().slice(0, 5000) };
}
