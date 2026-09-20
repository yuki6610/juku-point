const text = (value, max = 500) => String(value || '').trim().slice(0, max);
const score = value => { const legacy={low:2,needsSupport:2,none:3,partial:3,some:4,normal:3,strong:5,high:5,active:5,completed:5,notNeeded:3};const number=Number(value);return number>=1&&number<=5?number:(legacy[value]||3); };
const pick = values => values[Math.floor(Math.random()*values.length)];
const REPORT_TEXTS={
  focus:{1:['集中が続きにくく、こまめに声をかけました。','集中が途切れる場面がありました。'],2:['声をかけながら学習を進めました。','短い区切りを作って取り組みました。'],3:['落ち着いて授業に取り組めていました。','おおむね集中して学習できました。'],4:['集中して授業に取り組めていました。','課題へ意識を向けて進められました。'],5:['最後まで高い集中力を保てていました。','とても集中して学習できました。']},
  understanding:{1:['理解が難しい部分があり、基礎から確認しました。','内容の理解に時間が必要でした。'],2:['一部に理解が不十分な箇所がありました。','基本事項を確認しながら進めました。'],3:['学習内容をおおむね理解できました。','基本的な内容は理解できています。'],4:['学習内容をよく理解できていました。','要点をつかんで問題を解けました。'],5:['学習内容を十分に理解できています。','応用までよく理解できていました。']},
  effort:{1:['取り組み始めるまでに声かけが必要でした。','学習への切り替えを支援しました。'],2:['声をかけながら課題を進めました。','取り組みを継続できるよう支援しました。'],3:['指示に沿って課題へ取り組めました。','着実に学習を進められました。'],4:['粘り強く問題に取り組めました。','難しい問題にも前向きに取り組めました。'],5:['最後まで非常に粘り強く取り組めました。','自分から意欲的に課題へ取り組めました。']},
  questions:{1:['分からない点をそのままにする場面がありました。','質問するよう声をかけました。'],2:['促すことで質問できました。','質問を促すと疑問点を伝えられました。'],3:['必要な場面で質問できました。','説明を聞き、必要な質問ができました。'],4:['分からない点を自分から質問できました。','疑問点を適切に質問できました。'],5:['積極的に質問し、理解を深められました。','自分から多く質問できました。']},
  retry:{1:['間違い直しが十分にできませんでした。','解き直しを次回も確認します。'],2:['解き直しに一部未完了がありました。','間違えた問題の確認を続けます。'],3:['間違えた問題を確認できました。','必要な問題の解き直しを行いました。'],4:['解き直しまで丁寧に行えました。','間違いの原因を確認できました。'],5:['解き直しから類題確認までできました。','間違いを自分で分析して修正できました。']},
  attitude:{1:['授業への切り替えに声かけが必要でした。','学習姿勢を整えるよう声をかけました。'],2:['一部で声かけが必要でした。','学習に向かう姿勢を確認しながら進めました。'],3:['落ち着いた態度で授業を受けられました。','学習に必要な姿勢を保てていました。'],4:['前向きな態度で授業に参加できました。','良い学習姿勢で取り組めました。'],5:['非常に前向きな態度で学習できました。','周囲の手本となる姿勢で授業に参加できました。']},
};

export function normalizeReportFacts(value = {}) {
  return {
    focus: score(value.focus), understanding: score(value.understanding), effort: score(value.effort),
    questions: score(value.questions), retry: score(value.retry), attitude: score(value.attitude ?? value.concern),
    extraNote: text(value.extraNote, 2000),
  };
}

export function generateLessonReport({ facts: rawFacts, learningContent, homework, wordTest, late, forgot } = {}) {
  const facts = normalizeReportFacts(rawFacts);
  if (facts.extraNote) return { version:2, facts, text:facts.extraNote };
  const parts = [];
  const content = text(learningContent);
  if (content) parts.push(`今回は${content}を学習しました。`);
  for(const key of ['focus','understanding','attitude','effort','questions','retry']) parts.push(pick(REPORT_TEXTS[key][facts[key]]));
  if (homework === 'missed') parts.push('前回の宿題に未提出があったため、次回までの取り組みを確認します。');
  else if (homework === 'partial') parts.push('前回の宿題は途中のものがあり、残りを進めるよう確認しました。');
  if (late || forgot) parts.push(late && forgot ? '遅刻と忘れ物があり、次回の準備を確認しました。' : late ? '遅刻があり、次回の開始時刻を確認しました。' : '忘れ物があり、次回の持ち物を確認しました。');
  return { version: 2, facts, text: parts.join('\n') };
}
