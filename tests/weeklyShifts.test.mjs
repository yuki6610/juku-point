import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftPeriodForDate, shiftPeriodForSlot } from '../src/lib/weeklyShifts.js';

test('elementary lesson period selects the shift row even with a different start time', () => {
  const slot = { startTime: '14:10', periodId: 'period-4', subject: '算数' };
  assert.equal(shiftPeriodForSlot(slot)?.id, 'period-4');
  assert.equal(shiftPeriodForSlot(slot)?.label, '4講');
});

test('legacy fixed start times still resolve and 3講 keeps the existing shift ID', () => {
  assert.equal(shiftPeriodForSlot({ startTime: '16:40' })?.id, 'period-5');
  const third = shiftPeriodForSlot({ startTime: '14:00', periodId: 'course-early' });
  assert.equal(third?.label, '3講');
  assert.equal(shiftPeriodForDate('2026-09-24', third.id, [])?.id, 'course-early');
});
