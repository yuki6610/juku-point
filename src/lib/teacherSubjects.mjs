export const TEACHER_SUBJECTS = {
  elementary: [['japanese', '国語'], ['arithmetic', '算数'], ['english', '英語'], ['science', '理科'], ['social', '社会']],
  middle: [['japanese', '国語'], ['math', '数学'], ['english', '英語'], ['science', '理科'], ['social', '社会']],
  high: [['modern_japanese', '現代文'], ['classical_japanese', '古文'], ['chinese_classics', '漢文'], ['english', '英語'], ['math_1a', '数学ⅠA'], ['math_2b', '数学ⅡB'], ['math_3c', '数学ⅢC'], ['physics_basic', '物理基礎'], ['chemistry_basic', '化学基礎'], ['biology_basic', '生物基礎'], ['earth_science_basic', '地学基礎'], ['physics', '物理'], ['chemistry', '化学'], ['biology', '生物'], ['earth_science', '地学'], ['geography', '地理'], ['japanese_history', '日本史'], ['world_history', '世界史'], ['public', '公共'], ['ethics', '倫理'], ['politics_economics', '政治・経済'], ['information_1', '情報Ⅰ'], ['other', 'その他']],
};
export const TEACHER_LEVEL_NAMES = { elementary: '小学生', middle: '中学生', high: '高校生' };
export const emptyTeacherSubjects = () => ({ elementary: [], middle: [], high: [] });
export const teacherLevelForGrade = grade => Number(grade) <= 6 ? 'elementary' : Number(grade) <= 9 ? 'middle' : 'high';
export function teacherCanTeach(teacher, grade, subjectCode) {
  const level = teacherLevelForGrade(grade);
  const codes = teacher.subjectsByLevel?.[level] || [];
  if (!subjectCode || !codes.length) return false;
  if (codes.includes(subjectCode)) return true;
  if (level !== 'high') return subjectCode === 'math' && codes.includes('arithmetic');
  const families = { japanese: ['modern_japanese', 'classical_japanese', 'chinese_classics'], math: ['math_1a', 'math_2b', 'math_3c'], science: ['physics_basic', 'chemistry_basic', 'biology_basic', 'earth_science_basic', 'physics', 'chemistry', 'biology', 'earth_science'], social: ['geography', 'japanese_history', 'world_history', 'public', 'ethics', 'politics_economics'] };
  return (families[subjectCode] || []).some(code => codes.includes(code));
}
