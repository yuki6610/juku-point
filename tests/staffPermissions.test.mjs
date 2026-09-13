import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const access = fs.readFileSync(new URL('../src/lib/staffAccess.js', import.meta.url), 'utf8');
const context = fs.readFileSync(new URL('../src/app/api/teacher/context/route.js', import.meta.url), 'utf8');
const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const parentLessons = fs.readFileSync(new URL('../src/app/api/parent/lessons/route.js', import.meta.url), 'utf8');
const homeworkServer = fs.readFileSync(new URL('../src/lib/homeworkServer.js', import.meta.url), 'utf8');
const authRole = fs.readFileSync(new URL('../src/app/api/auth/role/route.js', import.meta.url), 'utf8');
const roleLogin = fs.readFileSync(new URL('../src/components/RoleLogin.js', import.meta.url), 'utf8');
const inviteApi = fs.readFileSync(new URL('../src/app/api/invite/route.js', import.meta.url), 'utf8');

test('teacher selection is daily and no fixed assignment is required', () => {
  assert.doesNotMatch(context, /profile\.assignments|weekdays\.includes/);
  assert.match(context, /collection\('users'\)\.get\(\)/);
  assert.match(context, /enrollmentStatus !== 'withdrawn'/);
});

test('teacher writes remain server-verified and direct Firestore access is closed', () => {
  assert.match(access, /collection\('teachers'\)/);
  assert.match(rules, /講師は専用APIのみ/);
  assert.doesNotMatch(rules, /allow read, write: if isTeacher/);
});

test('parent reads require an exact parent-child link', () => {
  assert.match(rules, /parentLinked\(key\)/);
  assert.match(rules, /parentLinks\/\$\(request\.auth\.uid\)\/children\/\$\(key\)/);
  assert.match(rules, /parentPublic\/\{studentKey\}/);
});

test('parent lesson API checks the link and returns only public projections', () => {
  assert.match(parentLessons, /linkedChildren\(parent\.uid/);
  assert.match(parentLessons, /collection\('lessonPublic'\)/);
  assert.match(parentLessons, /collection\('homeworkPublic'\)/);
  assert.doesNotMatch(parentLessons, /behaviorNote|homeworkAssignments/);
  assert.doesNotMatch(homeworkServer.match(/transaction\.set\(lessonRef,[\s\S]*?\}, \{ merge: true \}\)/)?.[0] || '', /behaviorNote/);
});

test('inactive staff accounts cannot fall through as students', () => {
  assert.match(authRole, /if \(teacher\.exists\) return Response\.json\(\{ role: 'disabled' \}\)/);
  assert.match(authRole, /if \(parent\.exists\) return Response\.json\(\{ role: 'disabled' \}\)/);
});

test('parent lesson history merges public, common and legacy term records', () => {
  assert.match(parentLessons, /collection\('lessonPublic'\)/);
  assert.match(parentLessons, /collection\('adminLessonAttendance'\)/);
  assert.match(parentLessons, /collection\('lessonTerms'\)/);
  assert.match(parentLessons, /mergeParentLessons\(entries\)/);
});

test('separate login screens reject accounts with the wrong role', () => {
  assert.match(roleLogin, /mode==='teacher'/);
  assert.match(roleLogin, /result\.role!=='teacher'/);
  assert.match(roleLogin, /mode==='parent'/);
  assert.match(roleLogin, /result\.role!=='parent'/);
  assert.match(roleLogin, /auth\.signOut\(\)/);
});

test('account invitations are one-time, expiring and do not store plain secrets', () => {
  assert.match(inviteApi, /status!=='pending'/);
  assert.match(inviteApi, /expiresAt\?\.toMillis/);
  assert.match(inviteApi, /timingSafeEqual/);
  assert.match(inviteApi, /status:'claimed'/);
  assert.doesNotMatch(inviteApi, /secret:/);
});
