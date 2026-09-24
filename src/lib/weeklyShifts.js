export const SHIFT_PERIODS = [
  // Keep the legacy ID so existing weekly shifts remain readable; this slot is 3講 now.
  { id: 'course-early', label: '3講', startTime: '13:20', endTime: '14:50' },
  { id: 'period-4', label: '4講', startTime: '15:00', endTime: '16:30' },
  { id: 'period-5', label: '5講', startTime: '16:40', endTime: '18:10' },
  { id: 'period-6', label: '6講', startTime: '18:20', endTime: '19:50' },
  { id: 'period-7', label: '7講', startTime: '20:00', endTime: '21:30' },
];

export const validShiftDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T12:00:00+09:00`)) && new Date(`${value}T12:00:00+09:00`).toISOString().slice(0, 10) === value;
export const shiftWeekStart = value => {
  const day = new Date(`${value}T12:00:00+09:00`);
  const weekday = day.getUTCDay();
  day.setUTCDate(day.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return day.toISOString().slice(0, 10);
};
export const shiftDateAt = (monday, offset) => {
  const day = new Date(`${monday}T12:00:00+09:00`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
};
export const shiftPeriodForTime = value => SHIFT_PERIODS.find(period => period.startTime === value);
export const shiftPeriodForSlot = (slot = {}, fallbackStartTime = '') =>
  SHIFT_PERIODS.find(period => period.id === slot.periodId) || shiftPeriodForTime(slot.startTime || fallbackStartTime);
export const shiftPeriodForDate = (date, periodId, programs) => {
  const period = SHIFT_PERIODS.find(item => item.id === periodId);
  if (!period) return null;
  if (period.courseOnly && !programs.some(item => item.startDate <= date && date <= item.endDate)) return null;
  return period;
};
export const shiftEntry = row => ({
  id: String(row.id || crypto.randomUUID()),
  date: String(row.date || ''),
  periodId: String(row.periodId || ''),
  studentKey: String(row.studentKey || ''),
  subject: String(row.subject || '').slice(0, 40),
  subjectCode: String(row.subjectCode || '').slice(0, 40),
  teacherUid: String(row.teacherUid || ''),
  lessonType: ['regular', 'course', 'makeup'].includes(row.lessonType) ? row.lessonType : 'regular',
  sourceId: String(row.sourceId || ''),
});
