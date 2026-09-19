import test from 'node:test';
import assert from 'node:assert/strict';
import { buildParentTermSummary, publicScore } from '../src/lib/parentReport.mjs';

test('parent term summary counts attendance, homework and word tests', () => {
  const summary = buildParentTermSummary([
    { attendance:'present', late:false, forgot:true, wordTest:{ status:'completed', correct:18, total:20 } },
    { attendance:'makeup', late:true, forgot:false, wordTest:{ status:'makeup', correct:21, total:30 } },
    { attendance:'absent' },
  ], [
    { review:{ status:'submitted' } }, { review:{ status:'partial' } }, { review:{ status:'missed' } }, { review:{ status:'absent' } },
  ]);
  assert.equal(summary.lessons, 3);
  assert.deepEqual(summary.attendance, { present:1, absent:1, makeup:1, late:1 });
  assert.equal(summary.forgot, 1);
  assert.equal(summary.homework.rate, 33);
  assert.equal(summary.wordTest.rate, 78);
});

test('public scores strip management and judgement fields', () => {
  const result = publicScore({ type:'exam', year:'2026', term:'2学期', testType:'期末', exam:{ 国語:80 }, examTotal:80, submittedBy:'admin', judgeComment:'internal' }, 'score1');
  assert.deepEqual(result, { id:'score1', type:'exam', year:'2026', term:'2学期', testType:'期末', grade:0, subjects:{ 国語:80 }, total:80, converted:0, createdAt:0 });
  assert.equal('submittedBy' in result, false);
  assert.equal('judgeComment' in result, false);
});
