import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
test('admin settings reuses existing manager in settings-only mode', () => {
  const page = read('app/admin/settings/page.js');
  assert.ok(page.includes('LessonAttendanceManager settingsOnly'));
  const manager = read('app/admin/lesson-attendance/LessonAttendanceManager.js');
  assert.ok(manager.includes("useState(settingsOnly ? 'settings' : 'overview')"));
  assert.ok(manager.includes('tab === "settings" || tab === "students") return;'));
});
test('navigation and setup error links target new admin settings, old URL remains', () => {
  for (const path of ['components/AdminNavigation.js', 'app/admin/lesson-records/page.js', 'app/admin/lesson-records/LearningRecordForm.js', 'app/admin/score/ScoreManager.js', 'app/admin/score/SchoolJudge.js']) assert.ok(read(path).includes('/admin/settings'), path);
  assert.ok(read('app/admin/lesson-attendance/page.js').includes('LessonAttendanceManager recordsOnly'));
  assert.ok(read('app/settings/page.js').length > 0);
});
