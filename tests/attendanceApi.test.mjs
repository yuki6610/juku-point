import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolveAcademicTerm } from '../src/lib/academicCalendar.mjs';
import { calculateSummary } from '../src/lib/behaviorSummary.mjs';
import { learningFields } from '../src/lib/lessonStudents.mjs';

const source = fs.readFileSync(new URL('../src/app/api/admin/lesson-attendance/route.js', import.meta.url), 'utf8');
const root = 'adminLessonAttendance/user_student/records/';
const lessons = 'users/student/lessonTerms/2026_2/records/';
async function execute(body, initial) {
  const data = { 'admins/admin': {}, 'users/student': { grade: 8 }, ...initial };
  const writes = [];
  const snapshot = path => path.split('/').length%2 ? {docs:Object.entries(data).filter(([key])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')).map(([key,value])=>({id:key.split('/').at(-1),data:()=>value}))} : ({ exists: Object.hasOwn(data, path), data: () => data[path] });
  const ref = path => ({ path, get parent(){return ref(path.split('/').slice(0,-1).join('/'))}, collection: p => ref(`${path}/${p}`), doc: p => ref(`${path}/${p}`), get: async () => snapshot(path) });
  const context = {
    learningFields,calculateSummary,
    readAcademicSettings: async () => [{ year: 2026, terms: { 2: { start: '2026-09-03', end: '2026-12-26' } } }],
    resolveAcademicTerm,
    japanDateId: () => '2026-09-11',
    Response, console,
    FieldValue: { serverTimestamp: () => 1000, delete: () => '__delete__' },
    Timestamp: { fromDate: date => date },
    requireStaff: async () => ({ uid: 'admin', role: 'admin' }),
    assertAssigned: () => {},
    adminAuth: { verifyIdToken: async () => ({ uid: 'admin' }) },
    adminDb: {
      collection: path => ref(path),
      runTransaction: async fn => fn({
        get: async reference => { assert.equal(writes.length, 0, 'all reads must precede writes'); return snapshot(reference.path); },
        set: (reference, value) => writes.push({ action: 'set', path: reference.path, value }),
        update: (reference, value) => writes.push({ action: 'update', path: reference.path, value }),
        delete: reference => writes.push({ action: 'delete', path: reference.path }),
      }),
    },
  };
  vm.createContext(context);
  vm.runInContext(source.replace(/^import .*\n/gm, '').replaceAll('export ', ''), context);
  const response = await context.POST({ headers: { get: () => 'Bearer test' }, json: async () => ({ student: { id: 'student', source: 'user', grade: 8 }, year: 2026, terms: { 2: { start: '2026-09-03', end: '2026-12-26' } }, ...body }) });
  return { status: response.status, writes };
}

test('cancel absence preserves completed makeup and homework', async () => {
  const result = await execute({ action: 'delete', date: '2026-09-10' }, {
    [`${root}2026-09-10`]: { status: 'absent', makeupDate: '2026-09-11' },
    [`${root}2026-09-11`]: { status: 'makeup', originalDate: '2026-09-10' },
    [`${lessons}2026-09-10`]: { attendance: 'absent', homework: 'submitted' },
    [`${lessons}2026-09-11`]: { attendance: 'makeup', homework: 'submitted' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.writes.some(w => w.action === 'delete' && w.path === `${root}2026-09-11`), false);
  assert.equal(result.writes.some(w => w.action === 'delete' && w.path === 'lessonPublic/user_student/records/2026-09-10'), true);
  assert.equal(result.writes.some(w => w.action === 'delete' && w.path === 'dailyLessonInputs/2026-09-10/students/user_student'), true);
  assert.equal(result.writes.find(w => w.path === `${root}2026-09-10`).value.status, null);
  const linked = result.writes.find(w => w.path === `${root}2026-09-11`).value;
  assert.equal(linked.originalDate, null);
  assert.equal(Object.hasOwn(linked, 'status'), false);
  assert.equal(result.writes.filter(w=>w.path.includes('/records/')).some(w => Object.hasOwn(w.value || {}, 'homework')), false);
  assert.equal(result.writes.find(w=>w.path==='users/student/behaviorSummary/2026_2').value.attendance.absent,0);
});
test('cancel makeup explicitly clears absence link', async () => {
  const result = await execute({ action: 'delete', date: '2026-09-11' }, {
    [`${root}2026-09-10`]: { status: 'absent', makeupDate: '2026-09-11', makeupCompleted: true },
    [`${root}2026-09-11`]: { status: 'makeup', originalDate: '2026-09-10' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.writes.find(w => w.path === `${root}2026-09-10`).value.makeupCompleted, false);
});
test('makeup can link to legacy lesson absence without losing its status', async () => {
  const result = await execute({ action: 'save', date: '2026-09-11', status: 'makeup', originalDate: '2026-09-10' }, {
    [`${lessons}2026-09-10`]: { attendance: 'absent' },
  });
  assert.equal(result.status, 200);
  assert.equal(result.writes.find(w => w.path === `${root}2026-09-10`).value.status, 'absent');
});
test('invalid operations and conflicting makeups do not write', async () => {
  for (const [body, initial] of [
    [{ action: 'invalid', date: '2026-09-10' }, {}],
    [{ action: 'save', date: '2026-09-10', status: 'makeup', originalDate: '2026-09-10' }, {}],
    [{ action: 'save', date: '2026-09-11', status: 'makeup', originalDate: '2026-09-10' }, {}],
    [{ action: 'save', date: '2026-09-11', status: 'makeup', originalDate: '2026-09-10' }, { [`${root}2026-09-10`]: { status: 'absent', makeupDate: '2026-09-12' } }],
  ]) {
    const result = await execute(body, initial);
    assert.ok(result.status >= 400);
    assert.equal(result.writes.length, 0);
  }
});

const learningRecord = { homework: 'submitted', wordTest: { status: 'completed', correct: 20, total: 20 }, late: false, forgot: false, behaviorNote: '学習メモ' };
test('elementary learning saves with attendance and no point updates', async () => {
  const result = await execute({ student: { id: 'child', source: 'elementary', grade: 4 }, date: '2026-09-10', status: 'present', learningRecord }, { 'adminStudents/child': { grade: 4 } });
  assert.equal(result.status, 200);
  const saved = result.writes.find(w => w.value?.learningRecord).value.learningRecord;
  assert.equal(saved.homework, 'submitted');
  assert.equal(saved.createdBy, 'admin');
  assert.equal(result.writes.some(w => w.path.startsWith('users/')), false);
});
test('high school keeps 100 point attendance but not homework or word rewards', async () => {
  const result = await execute({ student: { id: 'student', source: 'user', grade: 11 }, date: '2026-09-10', status: 'present', learningRecord }, { 'users/student': { grade: 11, points: 0 } });
  assert.equal(result.status, 200);
  assert.equal(result.writes.find(w => w.path === 'users/student').value.points, 100);
  assert.equal(result.writes.some(w => w.path.includes('lessonRewards')), false);
});
test('editing existing high school attendance does not reward twice', async () => {
  const result = await execute({ student: { id: 'student', source: 'user', grade: 11 }, date: '2026-09-10', status: 'present', learningRecord }, { 'users/student': { grade: 11, points: 100 }, [`${root}2026-09-10`]: { status: 'present' }, 'users/student/classAttendance/2026-09-10': { attended: true } });
  assert.equal(result.status, 200);
  assert.equal(result.writes.some(w => w.path === 'users/student'), false);
});
