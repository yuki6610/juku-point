import test from 'node:test';
import assert from 'node:assert/strict';
import { japanDateId, resolveAcademicTerm } from '../src/lib/academicCalendar.mjs';
const settings = [{ year: 2026, terms: { 1: { start: '2026-03-30', end: '2026-09-02' }, 2: { start: '2026-09-03', end: '2026-12-26' }, 3: { start: '2026-12-28', end: '2027-03-27' } } }, { year: 2030, terms: { 1: { start: '2030-03-25', end: '2030-09-05' } } }];
test('school year starts in March and ends in following calendar year', () => {
  assert.equal(resolveAcademicTerm(settings, '2026-03-30').id, '2026_1');
  assert.equal(resolveAcademicTerm(settings, '2027-03-27').id, '2026_3');
});
test('term boundaries use configured inclusive dates', () => {
  assert.equal(resolveAcademicTerm(settings, '2026-09-02').term, 1);
  assert.equal(resolveAcademicTerm(settings, '2026-09-03').term, 2);
  assert.equal(resolveAcademicTerm(settings, '2026-12-26').term, 2);
  assert.throws(() => resolveAcademicTerm(settings, '2026-12-27'));
  assert.equal(resolveAcademicTerm(settings, '2026-12-28').term, 3);
});
test('future years and settings changes need no code changes', () => {
  assert.equal(resolveAcademicTerm(settings, '2030-03-25').id, '2030_1');
  assert.equal(resolveAcademicTerm([{ year: 2030, terms: { 2: { start: '2030-03-25', end: '2030-09-05' } } }], '2030-03-25').id, '2030_2');
});
test('missing, overlapping and invalid dates fail closed', () => {
  assert.throws(() => resolveAcademicTerm([], '2026-09-11'));
  assert.throws(() => resolveAcademicTerm([...settings, settings[0]], '2026-09-11'));
  assert.throws(() => resolveAcademicTerm(settings, '2026-02-30'));
});
test('midnight rollover uses Japan time, not device or server timezone', () => {
  assert.equal(japanDateId(new Date('2026-09-02T14:59:59Z')), '2026-09-02');
  assert.equal(japanDateId(new Date('2026-09-02T15:00:00Z')), '2026-09-03');
});
