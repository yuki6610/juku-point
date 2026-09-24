import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLessonReportInput, normalizeLessonReportAiInput } from '../src/lib/lessonReportAi.mjs';

test('AI授業報告の入力を安全な長さと5段階評価へ正規化する', () => {
  const data = normalizeLessonReportAiInput({
    learningContent: '一次方程式',
    facts: { focus: 5, understanding: 0, attitude: '4' },
    context: { homework: 'submitted', late: true, wordTest: { correct: 18, total: 20 } },
  });
  assert.equal(data.learningContent, '一次方程式');
  assert.equal(data.ratings.集中度, 5);
  assert.equal(Object.hasOwn(data.ratings, '理解度'), false);
  assert.equal(data.ratings.学習態度, 4);
});

test('プロンプトは入力にない事実を作らず単語点を本文へ入れないよう指示する', () => {
  const prompt = buildLessonReportInput(normalizeLessonReportAiInput({ learningContent: '英語長文' }));
  assert.match(prompt, /入力されていない事実を追加しない/);
  assert.match(prompt, /単語テストの点数は文章に含めない/);
  assert.match(prompt, /英語長文/);
});

test('過去報告をコピーせず評価推移を参照するよう指示する', () => {
  const data=normalizeLessonReportAiInput({facts:{subject:'数学',understanding:4}});
  data.history=[{date:'2026-09-10',report:'前回の最終報告',ratings:{理解度:3}}];
  const prompt=buildLessonReportInput(data);
  assert.match(prompt,/過去報告をそのままコピーせず/);
  assert.match(prompt,/理解度: 3 → 4/);
});
