import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/app/admin/lesson-attendance/LessonAttendanceManager.js', import.meta.url), 'utf8');
const context = { dateId: d => d.toISOString().slice(0, 10), pad: n => String(n).padStart(2, '0') };
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function normalizeStatus('), source.indexOf('function termIdForDate(')), context);
const record = (data, source = 'adminLessonAttendance') => context.normalizeAttendanceRecord(data, data.date, { source });

test('homework-only record is not attendance', () => {
  const r = record({ date: '2026-09-10', homework: 'submitted' });
  assert.equal(r.status, null);
  assert.equal(Object.keys(context.linkMakeupRecords({ [r.date]: r })).length, 0);
});
test('cancellation wins over old attendance in either read order', () => {
  const old = record({ date: '2026-09-10', attendance: 'present', updatedAt: 1 }, 'lesson-records');
  const removed = record({ date: old.date, status: null, updatedAt: 2 });
  for (const list of [[old, removed], [removed, old]]) {
    const result = {};
    list.forEach(r => context.mergeAttendanceRecord(result, r));
    assert.equal(Object.keys(context.linkMakeupRecords(result)).length, 0);
  }
});
test('cleared makeup state cannot be revived from an older copy', () => {
  const result = {};
  context.mergeAttendanceRecord(result, record({ date: '2026-09-10', status: 'absent', makeupDate: '2026-09-11', makeupCompleted: true, updatedAt: 1 }));
  context.mergeAttendanceRecord(result, record({ date: '2026-09-10', status: 'absent', makeupDate: null, makeupCompleted: false, updatedAt: 2 }));
  assert.equal(result['2026-09-10'].makeupCompleted, false);
  assert.equal(result['2026-09-10'].makeupDate, null);
});
test('same lesson across sources counts once and unlinked makeup remains', () => {
  const result = {};
  for (const source of ['lesson-records', 'adminLessonAttendance']) context.mergeAttendanceRecord(result, record({ date: '2026-09-10', status: 'makeup', originalDate: null }, source));
  assert.equal(Object.keys(context.linkMakeupRecords(result)).length, 1);
  assert.equal(result['2026-09-10'].status, 'makeup');
});
test('legacy Japanese attendance remains readable', () => {
  assert.equal(record({ date: '2026-09-10', attendance: '欠席' }).status, 'absent');
  assert.equal(record({ date: '2026-09-10', attendance: '振替実施' }).status, 'makeup');
});

const termSource = fs.readFileSync(new URL('../src/lib/termCompatibility.js', import.meta.url), 'utf8');
async function readTerm(existing, term) {
  const calls = [];
  const ctx = { doc: (_, ...parts) => parts.join('/'), getDoc: async path => { calls.push(path); return { exists: () => existing.includes(path), path }; } };
  vm.createContext(ctx);
  vm.runInContext(termSource.replace(/^import .*;\n/m, '').replace('export async function', 'async function'), ctx);
  const result = await ctx.getBehaviorSummary({}, 'test', 2026, term);
  return { result, calls };
}
test('term labels read canonical ID and fall back to legacy without summing', async () => {
  const path = 'users/test/behaviorSummary/2026_1';
  assert.equal((await readTerm([path], '1学期')).result.path, path);
  assert.equal((await readTerm([path], 1)).calls.length, 1);
  assert.equal((await readTerm([`${path}学期`], 1)).result.path, `${path}学期`);
  assert.equal((await readTerm([path, `${path}学期`], 1)).result.path, path);
});
