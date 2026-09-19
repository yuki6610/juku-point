const text = (value, max = 500) => String(value || '').trim().slice(0, max);
const choice = (value, allowed, fallback = 'normal') => allowed.includes(value) ? value : fallback;

export function normalizeReportFacts(value = {}) {
  return {
    focus: choice(value.focus, ['high', 'normal', 'low']),
    understanding: choice(value.understanding, ['high', 'normal', 'low']),
    effort: choice(value.effort, ['strong', 'normal', 'needsSupport']),
    questions: choice(value.questions, ['active', 'some', 'none'], 'none'),
    retry: choice(value.retry, ['completed', 'partial', 'notNeeded'], 'notNeeded'),
    concern: choice(value.concern, ['none', 'pace', 'foundation', 'careless'], 'none'),
    extraNote: text(value.extraNote),
  };
}

export function generateLessonReport({ facts: rawFacts, learningContent, homework, wordTest, late, forgot } = {}) {
  const facts = normalizeReportFacts(rawFacts);
  const parts = [];
  if (facts.understanding === 'low' && facts.effort === 'strong') parts.push('難しい内容でしたが、最後まで粘り強く取り組めていました。');
  else if (facts.understanding === 'high') parts.push(facts.focus === 'high' ? '集中して取り組み、学習内容をよく理解できていました。' : '学習内容をよく理解できていました。');
  else if (facts.understanding === 'low') parts.push('理解が難しい部分があったため、基礎を確認しながら進めました。');
  else if (facts.focus === 'high') parts.push('集中して授業に取り組めていました。');
  else if (facts.focus === 'low') parts.push('集中が途切れる場面があり、声をかけながら進めました。');
  else parts.push('落ち着いて授業に取り組めていました。');

  if (homework === 'missed') parts.push('前回の宿題に未提出があったため、次回までの取り組みを確認します。');
  else if (homework === 'partial') parts.push('前回の宿題は途中のものがあり、残りを進めるよう確認しました。');
  else if (facts.questions === 'active') parts.push('分からない点を自分から質問できていました。');
  else if (facts.retry === 'completed') parts.push('間違えた問題の解き直しまで行えました。');
  else if (facts.concern === 'foundation') parts.push('基礎事項を繰り返し確認して定着を図ります。');
  else if (facts.concern === 'careless') parts.push('見直しを習慣にして、ミスを減らしていきます。');
  else if (wordTest && ['completed', 'makeup'].includes(wordTest.status) && Number(wordTest.total) > 0) parts.push(`単語テストは${Number(wordTest.total)}問中${Number(wordTest.correct)}問正解でした。`);
  else if (late || forgot) parts.push(late && forgot ? '遅刻と忘れ物があったため、次回に向けて準備を確認しました。' : late ? '遅刻があったため、次回の開始時刻を確認しました。' : '忘れ物があったため、次回の持ち物を確認しました。');

  const content = text(learningContent);
  if (content && parts.length < 3) parts.unshift(`今回は${content}を学習しました。`);
  if (facts.extraNote && parts.length < 3) parts.push(facts.extraNote.endsWith('。') ? facts.extraNote : `${facts.extraNote}。`);
  return { version: 1, facts, text: parts.slice(0, 3).join('') };
}
