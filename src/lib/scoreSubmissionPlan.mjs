export const BASE_TEST_TYPES = ['中間', '期末', '春課題実力', '1学期実力', '夏課題実力', '2学期実力', '冬課題実力', '3学期実力'];
export const PAST_EXAMS = Array.from({ length: 10 }, (_, index) => `過去問${2016 + index}`);
export const SUMMER_ENTRANCE_PRACTICE = Array.from({ length: 10 }, (_, index) => `入試演習問題${index + 1}`);
export const SCORE_TEST_TYPES = [...BASE_TEST_TYPES, ...SUMMER_ENTRANCE_PRACTICE, ...PAST_EXAMS];

export const normalizeSchool = value => String(value || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
export const matchingSubmissionEntries = (entries, student, termId) => (entries || [])
  .filter(entry => entry.active !== false && entry.termId === termId && Number(entry.grade) === Number(student.grade)
    && (!entry.schoolName || normalizeSchool(entry.schoolName) === normalizeSchool(student.schoolName)))
  .sort((a, b) => a.date.localeCompare(b.date) || String(a.testType || '').localeCompare(String(b.testType || ''), 'ja'));

export function projectSubmissionStatus(entries, saved = {}, today = new Date().toISOString().slice(0, 10), scores = []) {
  const items = entries.map(entry => {
    const explicit = saved.itemStatuses?.[entry.id];
    const oldReceived = entry.kind === 'exam' ? saved.examReceived === true : saved.internalReceived === true;
    const hasSavedScore = scores.some(score => score.type === entry.kind && (entry.kind === 'internal' || String(score.testType || '') === String(entry.testType || '')));
    const status = hasSavedScore ? 'score' : explicit?.received === true ? 'received' : explicit?.received === false ? 'missing'
      : oldReceived ? 'legacy' : entry.date > today ? 'upcoming' : 'missing';
    return { id: entry.id, kind: entry.kind, testType: entry.testType || null, date: entry.date, schoolName: entry.schoolName || '', grade: Number(entry.grade), status };
  });
  const forKind = kind => items.filter(item => item.kind === kind);
  const received = kind => { const due=forKind(kind).filter(item=>item.status!=='upcoming'); return due.length ? due.every(item => ['received', 'legacy', 'score'].includes(item.status)) : true; };
  return { items, examReceived: received('exam'), internalReceived: received('internal'), hasSchedule: items.length > 0,
    missingCount: items.filter(item => item.status === 'missing').length,
    legacyCount: items.filter(item => item.status === 'legacy').length };
}
