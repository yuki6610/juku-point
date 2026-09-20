import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLessonReport, normalizeReportFacts } from '../src/lib/lessonReport.mjs';

test('授業レポートは入力した評価項目をすべて自然文にする', () => {
  const result = generateLessonReport({ learningContent:'一次方程式', facts:{understanding:'low',effort:'strong',questions:'active'}, homework:'submitted' });
  assert.match(result.text, /一次方程式/);
  assert.match(result.text, /取り組/);
  assert.match(result.text, /質問/);
});

test('不正な評価値と自由記述を安全に正規化する', () => {
  const result = normalizeReportFacts({ focus:'invalid', extraNote:'x'.repeat(800) });
  assert.equal(result.focus, 3);
  assert.equal(result.extraNote.length, 800);
});
