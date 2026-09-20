const LABELS = {
  focus: '集中度',
  understanding: '理解度',
  attitude: '学習態度',
  effort: '取り組み',
  questions: '質問',
  retry: '解き直し',
};
export const DEFAULT_REPORT_RATING_TEXTS = {
  focus: ['要支援','やや要支援','標準','良い','とても良い'], understanding: ['要復習','一部要復習','概ね理解','よく理解','十分に理解'], attitude: ['要支援','声かけが必要','標準','良い','とても良い'], effort: ['要支援','声かけが必要','標準','粘り強い','とても意欲的'], questions: ['質問できない','促すと質問','必要時に質問','自分から質問','積極的に質問'], retry: ['未実施','一部未実施','確認済み','丁寧に実施','類題まで実施'],
};

export function normalizeReportRatingTexts(value = {}) {
  return Object.fromEntries(Object.keys(LABELS).map(key => [key, [1,2,3,4,5].map((_, index) => {
    const candidate=clean(value?.[key]?.[index],80);
    return candidate || DEFAULT_REPORT_RATING_TEXTS[key][index];
  })]));
}

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const rating = value => Math.min(5, Math.max(1, Number(value) || 3));

export function normalizeLessonReportAiInput(body = {}, ratingTexts = DEFAULT_REPORT_RATING_TEXTS) {
  const sourceFacts = body.facts && typeof body.facts === 'object' ? body.facts : {};
  const sourceContext = body.context && typeof body.context === 'object' ? body.context : {};
  const normalizedTexts=normalizeReportRatingTexts(ratingTexts);
  const ratings = Object.fromEntries(Object.entries(LABELS).map(([key, label]) => { const score=rating(sourceFacts[key]);return [label,{ score, selectedText:normalizedTexts[key][score-1] }]; }));
  return {
    learningContent: clean(body.learningContent, 500),
    grade: clean(sourceContext.grade, 20),
    subject: clean(sourceFacts.subject, 30),
    supplement: clean(sourceFacts.supplement, 500),
    ratings,
  };
}

export function buildLessonReportInput(data) {
  const ratingLines=Object.entries(data.ratings||{}).map(([label,value])=>`${label}:${value.score}/5 ${value.selectedText}`).join('\n');
  const lessonLines=[
    data.grade&&`学年:${data.grade}`,
    data.subject&&`教科:${data.subject}`,
    data.learningContent&&`学習内容:${data.learningContent}`,
    ratingLines&&`評価:\n${ratingLines}`,
    data.supplement&&`補足:${data.supplement}`,
  ].filter(Boolean).join('\n');
  return `個別指導塾から保護者へ送る授業報告を作成してください。以下の入力情報だけを使用してください。

要件:
- 自然な日本語
- 2〜4文程度
- 過度に褒めない
- 事実を勝手に追加しない
- 「、」を多用しない
- 講師が実際に書いたような文章
- 同じ表現を毎回繰り返さない
- 単語テストの点数は文章に含めない
- 宿題の提出状況や宿題に関するコメントは文章に含めない
- 見出し、箇条書き、前置き、署名は付けず、本文だけを返す

授業データ:
${lessonLines}`;
}
