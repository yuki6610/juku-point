import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { DEFAULT_HOMEWORK_TEMPLATES as templates, aggregateItemResults, validateAssignment, validateTemplates, homeworkValue, publicAssignment } from '../src/lib/homeworkModel.mjs';
import { generateLessonReport } from '../src/lib/lessonReport.mjs';

const assignment = { assignedDate: '2026-09-12', dueDate: '2026-09-19', items: [{ materialId: 'new_math', range: 'P.20〜23' }, { materialId: 'new_english', range: 'P.10〜12' }] };
test('multiple tasks form one set with fixed material snapshots', () => {
  const value = validateAssignment(assignment, templates);
  assert.equal(value.items.length, 2);
  assert.equal(value.items[0].materialLabel, '新ワーク 数学');
  assert.equal(value.items[0].id, '0');
  assert.throws(() => validateAssignment({ ...assignment, dueDate: '2026-09-11' }, templates));
  assert.throws(() => validateAssignment({ ...assignment, items: [{ materialId: 'fake', range: '1' }] }, templates));
});
test('individual homework results use submitted / partial / missed aggregate rules', () => {
  assert.equal(homeworkValue('partial'), 'partial');
  assert.equal(homeworkValue('submitted'), 'submitted');
  assert.equal(aggregateItemResults([{id:'0'},{id:'1'}], {'0':'submitted','1':'submitted'}), 'submitted');
  assert.equal(aggregateItemResults([{id:'0'},{id:'1'}], {'0':'submitted','1':'missed'}), 'missed');
  assert.equal(aggregateItemResults([{id:'0'},{id:'1'}], {'0':'submitted','1':'partial'}), 'partial');
  for (const status of ['pending', 'absent', 'laterCompleted']) assert.equal(homeworkValue(status), 'notEvaluated');
  assert.throws(() => homeworkValue('fake'));
});
test('templates validate IDs and public fields strip internal data recursively', () => {
  assert.equal(validateTemplates(templates).materials.length, 6);
  assert.throws(() => validateTemplates({ ...templates, materials: [templates.materials[0], templates.materials[0]] }));
  const result = publicAssignment({ ...validateAssignment(assignment, templates), internalNote: 'PRIVATE', items: [{ id: '0', materialId: 'x', materialLabel: '教材', range: '1', internalNote: 'PRIVATE' }], review: { status: 'submitted', text: '公開', date: '2026-09-19', updatedBy: 'PRIVATE' } });
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

const server = fs.readFileSync(new URL('../src/lib/homeworkServer.js', import.meta.url), 'utf8');
async function prepare(old = {}, input = {}) {
  const writes = [];
  let seq = 0;
  const ref = path => ({ path, collection: part => ref(`${path}/${part}`), doc: part => ref(`${path}/${part || `audit${++seq}`}`) });
  const context = { FieldValue: { serverTimestamp: () => 123 }, adminDb: { collection: path => ref(path) }, aggregateItemResults, homeworkValue, publicAssignment, generateLessonReport, DEFAULT_HOMEWORK_TEMPLATES: templates };
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
  assert.equal(result.homework, 'partial');
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
test('absence does not require individual submission decisions and gives no reward', async () => {
  const {result,writes}=await prepare({}, {attendance:'absent',review:{assignmentId:'set1',status:'pending',itemResults:{}}});
  assert.equal(result.homework,'notEvaluated');
  assert.equal(writes.find(item=>item.path.startsWith('homeworkPublic')).value.review.status,'absent');
});
test('word test ranges are published but never count as homework submission', async () => {
  const items=validateAssignment({...assignment,items:[{materialId:'new_math',range:'10〜12'},{materialId:'words',range:'No.1〜20'}]},templates).items;
  assert.equal(aggregateItemResults(items,{'0':'submitted'}),'submitted');
  const {result,writes}=await prepare({items},{review:{assignmentId:'set1',itemResults:{'0':'submitted'}}});
  assert.equal(result.homework,'submitted');
  assert.equal(writes.find(item=>item.path.startsWith('homeworkPublic')).value.items[1].rangeType,'number');
  assert.equal(aggregateItemResults([items[1]],{}),'none');
  assert.throws(()=>validateAssignment({...assignment,items:[{materialId:'words',range:'No.20〜1'}]},templates));
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
  const context = { FieldPath:{documentId:()=> '__name__'}, URL, Response, requireHomeworkUser: async () => 'alice', homeworkRefs: key => ({ publicRef: { parent: ref(`homeworkPublic/${key}/items`) }, privateRef:{parent:ref(`homeworkAssignments/${key}/items`)} }), adminDb: { collection: path => ref(path) }, publicAssignment };
  vm.createContext(context);
  vm.runInContext(api.replace(/^import .*\n/gm, '').replaceAll('export ', ''), context);
  const result = await context.GET({ url: 'https://example.test/api/homework?student=user_bob&uid=bob' });
  assert.equal(result.status, 200);
  assert.ok(paths.length > 0);
  assert.ok(paths.every(path => path.includes('user_alice') && !path.includes('bob')));
});
