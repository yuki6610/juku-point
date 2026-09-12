import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validateTerms, validateOtherYears } from '../src/lib/calendarSettings.mjs';

const terms = { 1: { start: '2028-03-27', end: '2028-09-01' }, 2: { start: '2028-09-04', end: '2028-12-23' }, 3: { start: '2029-01-05', end: '2029-03-24' } };
test('arbitrary future year supports following-year third term', () => {
  assert.doesNotThrow(() => validateTerms(2028, terms));
});
test('different school years cannot overlap; current year can be edited', () => {
  assert.doesNotThrow(() => validateOtherYears(2028, terms, [{ year: 2028, terms }]));
  assert.throws(() => validateOtherYears(2028, terms, [{ year: 2029, terms: { 1: { start: '2029-03-20', end: '2029-09-01' } } }]));
});
test('invalid date, overlap, wrong year and missing terms are rejected', () => {
  assert.throws(() => validateTerms(2028, {}));
  assert.throws(() => validateTerms(2027, terms));
  assert.throws(() => validateTerms(2028, { ...terms, 2: { start: '2028-09-01', end: '2028-12-23' } }));
  assert.throws(() => validateTerms(2028, { ...terms, 3: { start: '2029-02-29', end: '2029-03-24' } }));
});
const source = fs.readFileSync(new URL('../src/app/admin/lesson-attendance/LessonAttendanceManager.js', import.meta.url), 'utf8');
const context = { TEACHING_DAYS: [1, 2, 3, 4, 5, 6], dateId: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function createDefaultCalendar('), source.indexOf('function datesInMonth(')), context);
test('draft respects term gaps, excludes Sundays and caps weekdays at 48', () => {
  const before = JSON.stringify(terms);
  const calendar = context.createDefaultCalendar(2028, terms);
  const counts = Array(7).fill(0);
  for (const date of Object.keys(calendar)) {
    assert.ok(Object.values(terms).some(term => date >= term.start && date <= term.end));
    counts[new Date(`${date}T00:00:00`).getDay()]++;
  }
  assert.equal(counts[0], 0);
  assert.ok(counts.slice(1).every(count => count <= 48 && count > 0));
  assert.equal(JSON.stringify(terms), before);
});
test('saving replaces dates map rather than recursively merging removed days', () => {
  assert.ok(source.includes("mergeFields: ['year', 'dates', 'updatedAt', 'updatedBy']"));
});
