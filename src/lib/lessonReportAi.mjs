const LABELS = {
  focus: '集中度', understanding: '理解度', attitude: '学習態度', questions: '質問',
};

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const rating = value => { const number=Number(value);return Number.isInteger(number)&&number>=1&&number<=5?number:null; };

export function normalizeLessonReportAiInput(body = {}) {
  const sourceFacts = body.facts && typeof body.facts === 'object' ? body.facts : {};
  const sourceContext = body.context && typeof body.context === 'object' ? body.context : {};
  return {
    learningContent: clean(body.learningContent, 500),
    grade: clean(sourceContext.grade, 20),
    subject: clean(sourceFacts.subject, 30),
    supplement: clean(sourceFacts.supplement, 500),
    ratings: Object.fromEntries(Object.entries(LABELS).map(([key, label]) => [label, rating(sourceFacts[key])]).filter(([,value])=>value!==null)),
  };
}

const formatHistory = history => history?.length
  ? history.map((item, index) => `${index + 1}回前（${item.date || '日付不明'}）:\n${item.report}`).join('\n\n')
  : 'なし';

const formatTrends = (history, currentRatings) => {
  const chronological = [...(history || [])].reverse();
  return Object.keys(currentRatings || {}).map(label => {
    const past = chronological.map(item => item.ratings?.[label]).filter(Number.isInteger);
    return `${label}: ${[...past, currentRatings[label]].join(' → ')}`;
  }).join('\n');
};

export function buildLessonReportInput(data) {
  const ratingLines=Object.entries(data.ratings||{}).map(([label,value])=>`${label}: ${value}`).join('\n');
  const lessonLines=[
    data.grade&&`学年:${data.grade}`,
    data.subject&&`教科:${data.subject}`,
    data.learningContent&&`学習内容:${data.learningContent}`,
    ratingLines&&`今回の5段階評価:\n${ratingLines}`,
    data.supplement&&`講師メモ: ${data.supplement}`,
  ].filter(Boolean).join('\n');
  return `個別指導塾から保護者へ送る自然な授業報告を作成してください。入力された情報だけを使用してください。

評価基準:
1 = かなり課題がある
2 = やや課題がある
3 = 標準
4 = 良好
5 = 非常に良好

生成ルール:
- 5段階評価は内部的に解釈し、授業内容・講師メモ・同じ教科の履歴を合わせて自然に表現する
- 「理解度は4で良好でした」「集中度は3で標準でした」のように数値や評価名を読み上げない
- 講師が授業後に保護者へ書いたような自然な日本語にする
- 2〜4文程度とし、長くしすぎない
- 過度に褒めず、入力されていない事実を追加しない
- 「、」を必要以上に多用しない
- 単語テストの点数は文章に含めない
- 宿題の提出状況や宿題へのコメントは文章に含めない
- 見出し、箇条書き、前置き、署名を付けず本文だけを返す
- 毎回同じ書き出しや「〜できていました」「〜取り組めていました」「次回も〜していきます」だけで終わる構文を避け、語順・文構造・表現を適度に変える
- 過去報告は学習状況の継続性を把握する参考情報であり、コピー元ではない
- 過去報告をそのままコピーせず、同じ書き出し・文構造の繰り返しをできるだけ避ける
- 同じ意味を述べる場合も自然に表現を変える
- 最近の評価推移に明確な変化がある場合だけ、その変化を自然な範囲で反映してよい
- 変化がない場合に成長・悪化を作らない。履歴から確認できない変化を断定しない

今回の授業データ:
${lessonLines}

同じ教科の直近の最終保存済み授業報告（新しい順）:
${formatHistory(data.history)}

同じ教科の最近の評価推移（過去から今回の順）:
${formatTrends(data.history, data.ratings)}`;
}

export const LESSON_REPORT_RATING_LABELS = LABELS;
