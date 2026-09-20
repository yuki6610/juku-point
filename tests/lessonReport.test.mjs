import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReportFacts } from '../src/lib/lessonReport.mjs';

test('不正な評価値と自由記述を安全に正規化する', () => {
  const result = normalizeReportFacts({ focus:'invalid', extraNote:'x'.repeat(800) });
  assert.equal(result.focus, 3);
  assert.equal(result.extraNote.length, 800);
});

test('API生成用の教科と補足を保存できる長さに正規化する', () => {
  const result = normalizeReportFacts({ subject:'数学', supplement:'文章問題で少し時間がかかった' });
  assert.equal(result.subject, '数学');
  assert.match(result.supplement, /文章問題/);
});
