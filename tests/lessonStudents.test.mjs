import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonStudent, isMiddleStudent, learningFields, studentGradeLabel } from '../src/lib/lessonStudents.mjs';
test('elementary registration and user accounts retain distinct stable IDs', () => {
  const elementary = lessonStudent('same', { name: '小学生', grade: 4 }, 'elementary');
  const middle = lessonStudent('same', { realName: '中学生', grade: '8' });
  const high = lessonStudent('high', { grade: 11 });
  assert.equal(elementary.uid, 'elementary_same');
  assert.equal(middle.uid, 'user_same');
  assert.equal(elementary.id, 'same');
  assert.equal(isMiddleStudent(elementary), false);
  assert.equal(isMiddleStudent(middle), true);
  assert.equal(isMiddleStudent(high), false);
  assert.equal(studentGradeLabel(11), '高2');
});
test('withdrawn and invalid student registrations are excluded', () => {
  assert.equal(lessonStudent('x', { grade: 8, active: false }), null);
  assert.equal(lessonStudent('x', { grade: 8, enrollmentStatus: 'withdrawn' }), null);
  assert.equal(lessonStudent('x', { grade: 11 }, 'elementary'), null);
  assert.equal(lessonStudent('x', { grade: 3 }), null);
});
test('learning fields allow only educational data, not points or author overrides', () => {
  const value = learningFields({ homework: 'submitted', wordTest: { status: 'completed', correct: '18', total: '20' }, points: 999, updatedBy: 'fake' });
  assert.equal(value.wordTest.correct, 18);
  assert.equal(Object.hasOwn(value, 'points'), false);
  assert.equal(Object.hasOwn(value, 'updatedBy'), false);
  assert.throws(() => learningFields({ homework: 'submitted', wordTest: { status: 'completed', correct: 30, total: 20 } }));
});
