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
  assert.deepEqual(data.ratings.集中度, { score:5, selectedText:'とても良い' });
  assert.deepEqual(data.ratings.理解度, { score:3, selectedText:'概ね理解' });
  assert.deepEqual(data.ratings.学習態度, { score:4, selectedText:'良い' });
  assert.equal(data.late, true);
});

test('プロンプトは入力にない事実を作らず単語点を本文へ入れないよう指示する', () => {
  const prompt = buildLessonReportInput(normalizeLessonReportAiInput({ learningContent: '英語長文' }));
  assert.match(prompt, /事実を勝手に追加しない/);
  assert.match(prompt, /単語テストの点数は文章に含めない/);
  assert.match(prompt, /英語長文/);
});

test('管理画面で保存した評価文章をAPI入力へ反映する', () => {
  const data=normalizeLessonReportAiInput({facts:{understanding:4}}, {understanding:['A','B','C','要点を理解']});
  assert.equal(data.ratings.理解度.selectedText,'要点を理解');
});
