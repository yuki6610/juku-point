import { SHIFT_PERIODS } from './weeklyShifts.js';

export function lessonScheduleForDate(student, date, shiftEntry, confirmedShift = false) {
  const weekday = new Date(`${date}T12:00:00+09:00`).getDay();
  const weekdays = student.lessonSchedule?.weekdays || student.weekdays || [];
  const slots = student.lessonSchedule?.slots || student.lessonScheduleSlots || {};
  const slot = slots[String(weekday)] || {};
  const period = shiftEntry && SHIFT_PERIODS.find(item => item.id === shiftEntry.periodId);
  const enrollmentStarted = !student.lessonSchedule?.startDate || date >= student.lessonSchedule.startDate;
  return {
    scheduled: confirmedShift ? Boolean(shiftEntry) : enrollmentStarted && weekdays.map(Number).includes(weekday),
    lessonStartTime: period?.startTime || slot.startTime || student.lessonSchedule?.startTime || student.lessonStartTime || '',
    lessonPeriodId: shiftEntry?.periodId || slot.periodId || student.lessonSchedule?.periodId || '',
    lessonSubject: shiftEntry?.subject || slot.subject || '',
    lessonType: shiftEntry?.lessonType || null,
    lessonSourceId: shiftEntry?.sourceId || '',
    lessonSlots: slots,
  };
}
