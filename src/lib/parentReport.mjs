const attended = value => ['present', 'makeup'].includes(value);
export function buildParentTermSummary(records = [], assignments = []) {
  const summary = { lessons: 0, attendance: { present: 0, absent: 0, makeup: 0, late: 0 }, homework: { submitted: 0, partial: 0, missed: 0, absent: 0, total: 0, rate: null }, forgot: 0, wordTest: { count: 0, correct: 0, total: 0, rate: null } };
  records.forEach(record => {
    const attendance = record.attendance || record.status;
    if (['present','absent','makeup'].includes(attendance)) summary.attendance[attendance] += 1;
    if (attended(attendance)) summary.lessons += 1;
    if (record.late && attended(attendance)) summary.attendance.late += 1;
    if (record.forgot && attended(attendance)) summary.forgot += 1;
    const word = record.wordTest;
    if (word && ['completed','makeup'].includes(word.status) && Number(word.total) > 0) { summary.wordTest.count += 1; summary.wordTest.correct += Number(word.correct || 0); summary.wordTest.total += Number(word.total); }
  });
  assignments.forEach(item => { const status = item.review?.status; if (['submitted','partial','missed','absent'].includes(status)) summary.homework[status] += 1; });
  const reviewedDates=new Set(assignments.map(item=>item.review?.date).filter(Boolean));
  records.forEach(record=>{if(!reviewedDates.has(record.date)&&['submitted','partial','missed'].includes(record.homework))summary.homework[record.homework]+=1});
  summary.homework.total = summary.homework.submitted + summary.homework.partial + summary.homework.missed;
  summary.homework.rate = summary.homework.total ? Math.round(summary.homework.submitted / summary.homework.total * 100) : null;
  summary.wordTest.rate = summary.wordTest.total ? Math.round(summary.wordTest.correct / summary.wordTest.total * 1000) / 10 : null;
  return summary;
}

export function publicScore(data, id) {
  if (data.type === 'exam') return { id, type: 'exam', year: String(data.year || ''), term: data.term || '', testType: data.testType || '', grade: Number(data.grade || 0), subjects: { ...(data.exam || {}) }, total: Number(data.examTotal || 0) };
  if (data.type === 'internal') return { id, type: 'internal', year: String(data.year || ''), term: data.term || '', grade: Number(data.grade || 0), main: { ...(data.internalMain || {}) }, sub: { ...(data.internalSub || {}) }, total: Number(data.internalTotal || 0) };
  return null;
}
