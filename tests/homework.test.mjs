import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_HOMEWORK_TEMPLATES as templates, validateAssignment, validateTemplates, homeworkValue, publicAssignment } from '../src/lib/homeworkModel.mjs';

const assignment = { assignedDate: '2026-09-12', dueDate: '2026-09-19', items: [{ materialId: 'new_math', range: 'P.20〜23' }, { materialId: 'new_english', range: 'P.10〜12' }] };
test('multiple tasks form one set with fixed material snapshots', () => {
  const value = validateAssignment(assignment, templates);
  assert.equal(value.items.length, 2);
  assert.equal(value.items[0].materialLabel, '新ワーク 数学');
  assert.equal(value.items[0].id, '0');
  assert.throws(() => validateAssignment({ ...assignment, dueDate: '2026-09-11' }, templates));
  assert.throws(() => validateAssignment({ ...assignment, items: [{ materialId: 'fake', range: '1' }] }, templates));
});
test('partial set maps to missed; pending and later completion are unevaluated', () => {
  assert.equal(homeworkValue('partial'), 'missed');
  assert.equal(homeworkValue('submitted'), 'submitted');
  for (const status of ['pending', 'absent', 'laterCompleted']) assert.equal(homeworkValue(status), 'notEvaluated');
  assert.throws(() => homeworkValue('fake'));
});
test('templates validate IDs and public fields strip internal data recursively', () => {
  assert.equal(validateTemplates(templates).materials.length, 5);
  assert.throws(() => validateTemplates({ ...templates, materials: [templates.materials[0], templates.materials[0]] }));
  const result = publicAssignment({ ...validateAssignment(assignment, templates), internalNote: 'PRIVATE', items: [{ id: '0', materialId: 'x', materialLabel: '教材', range: '1', internalNote: 'PRIVATE' }], review: { status: 'submitted', text: '公開', date: '2026-09-19', updatedBy: 'PRIVATE' } });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

const server = fs.readFileSync(new URL('../src/lib/homeworkServer.js', import.meta.url), 'utf8');
async function prepare(old = {}, input = {}) {
  const writes = [];
  let seq = 0;
  const ref = path => ({ path, collection: part => ref(`${path}/${part}`), doc: part => ref(`${path}/${part || `audit${++seq}`}`) });
  const context = { FieldValue: { serverTimestamp: () => 123 }, adminDb: { collection: path => ref(path) }, homeworkValue, publicAssignment, DEFAULT_HOMEWORK_TEMPLATES: templates };
  vm.createContext(context);
  vm.runInContext(server.replace(/^import .*\n/gm, '').replaceAll('export ', ''), context);
  const transaction = {
    get: async target => {
      assert.equal(writes.length, 0);
      const data = target.path.startsWith('lessonPublic') ? input.oldLesson : { ...validateAssignment(assignment, templates), ...old };
      return { exists: !!data, data: () => data };
    },
    set: (target, value) => writes.push({ path: target.path, value }),
  };
  const result = await context.prepareHomeworkReview(transaction, { key: 'user_student', uid: 'admin', date: '2026-09-19', termId: '2026_2', review: { assignmentId: 'set1', status: 'partial', missingIds: ['1'] }, comments: [], attendance: 'present', templates, ...input });
  result.commit();
  return { result, writes };
}
test('single review updates private and public records without private memo leakage', async () => {
  const { result, writes } = await prepare({ internalNote: 'PRIVATE' });
  assert.equal(result.homework, 'missed');
  const publication = writes.find(item => item.path.startsWith('homeworkPublic')).value;
  assert.equal(publication.review.status, 'partial');
  assert.equal(JSON.stringify(publication).includes('PRIVATE'), false);
  assert.ok(writes.some(item => item.path.includes('reviewHistory')));
});
test('later completion preserves original failure and gives no homework reward', async () => {
  const original = { status: 'partial', text: '最初の定型文', date: '2026-09-19', missingIds: ['1'] };
  const { result, writes } = await prepare({ review: original }, { date: '2026-09-20', review: { assignmentId: 'set1', status: 'laterCompleted' } });
  assert.equal(result.homework, 'notEvaluated');
  const publication = writes.find(item => item.path.startsWith('homeworkPublic')).value;
  assert.equal(publication.review.text, original.text);
  assert.equal(publication.laterCompletion.status, 'laterCompleted');
});
test('snapshotted text survives edits to templates', async () => {
  const { writes } = await prepare({ review: { status: 'partial', date: '2026-09-19', text: '元の文', missingIds: [] } }, { comments: ['focus'], oldLesson: { comments: [{ id: 'focus', text: '元のコメント' }] } });
  assert.equal(writes.find(item => item.path.startsWith('homeworkPublic')).value.review.text, '元の文');
  assert.equal(writes.find(item => item.path.startsWith('lessonPublic')).value.comments[0].text, '元のコメント');
});
test('confirmed sets cannot be reassessed on another date or completed prematurely', async () => {
  await assert.rejects(prepare({ review: { status: 'missed', date: '2026-09-18' } }));
  await assert.rejects(prepare({}, { review: { assignmentId: 'set1', status: 'laterCompleted' } }));
});
test('homework administration rejects unauthenticated and non-admin callers', async () => {
  const context = { adminAuth: { verifyIdToken: async () => ({ uid: 'student' }) }, adminDb: { collection: () => ({ doc: () => ({ get: async () => ({ exists: false }) }) }) } };
  vm.createContext(context);
  vm.runInContext(server.replace(/^import .*\n/gm, '').replaceAll('export ', ''), context);
  await assert.rejects(context.requireHomeworkUser({ headers: { get: () => null } }, true));
  await assert.rejects(context.requireHomeworkUser({ headers: { get: () => 'Bearer test' } }, true));
});
test('student API ignores forged student ID and reads only verified UID', async () => {
  const paths = [];
  const ref = path => ({ collection: part => ref(`${path}/${part}`), doc: part => ref(`${path}/${part}`), orderBy: () => ref(path), limit: () => ref(path), get: async () => { paths.push(path); return { docs: [] }; } });
  const api = fs.readFileSync(new URL('../src/app/api/homework/route.js', import.meta.url), 'utf8');
  const context = { URL, Response, requireHomeworkUser: async () => 'alice', homeworkRefs: key => ({ publicRef: { parent: ref(`homeworkPublic/${key}/items`) } }), adminDb: { collection: path => ref(path) }, publicAssignment };
  vm.createContext(context);
  vm.runInContext(api.replace(/^import .*\n/gm, '').replaceAll('export ', ''), context);
  const result = await context.GET({ url: 'https://example.test/api/homework?student=user_bob&uid=bob' });
  assert.equal(result.status, 200);
  assert.ok(paths.length > 0);
  assert.ok(paths.every(path => path.includes('user_alice') && !path.includes('bob')));
});
