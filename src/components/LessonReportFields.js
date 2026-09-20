'use client';
import { generateLessonReport, normalizeReportFacts } from '@/lib/lessonReport.mjs';

const OPTIONS = {
  focus: [[1,'1 要支援'],[2,'2 やや要支援'],[3,'3 標準'],[4,'4 良い'],[5,'5 とても良い']],
  understanding: [[1,'1 要復習'],[2,'2 一部要復習'],[3,'3 概ね理解'],[4,'4 よく理解'],[5,'5 十分に理解']],
  effort: [[1,'1 要支援'],[2,'2 声かけが必要'],[3,'3 標準'],[4,'4 粘り強い'],[5,'5 とても意欲的']],
  questions: [[1,'1 質問できない'],[2,'2 促すと質問'],[3,'3 必要時に質問'],[4,'4 自分から質問'],[5,'5 積極的に質問']],
  retry: [[1,'1 未実施'],[2,'2 一部未実施'],[3,'3 確認済み'],[4,'4 丁寧に実施'],[5,'5 類題まで実施']],
  attitude: [[1,'1 要支援'],[2,'2 声かけが必要'],[3,'3 標準'],[4,'4 良い'],[5,'5 とても良い']],
};
const LABELS = { focus:'集中度', understanding:'理解度', attitude:'学習態度', effort:'取り組み', questions:'質問', retry:'解き直し' };

export default function LessonReportFields({ learningContent, onLearningContentChange, value, onChange, context = {} }) {
  const facts = normalizeReportFacts(value);
  const generate=()=>{const generated=generateLessonReport({...context,learningContent,facts:{...facts,extraNote:''}}).text;onChange({...facts,extraNote:generated})};
  return <section className="lesson-report-fields">
    <h3>保護者向け授業レポート</h3>
    <p>6項目を5段階で選び、文章を生成します。生成後の特記事項は自由に修正できます。</p>
    <label>学習内容<input value={learningContent} maxLength={500} onChange={event=>onLearningContentChange(event.target.value)} placeholder="例：一次方程式の文章題" /></label>
    <div className="lesson-report-grid">{Object.entries(OPTIONS).map(([key,options])=><label key={key}>{LABELS[key]}<select value={facts[key]} onChange={event=>onChange({...facts,[key]:event.target.value})}>{options.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>)}</div>
    <button type="button" className="report-generate" onClick={generate}>評価から授業報告を生成</button>
    <label>特記事項（保護者へ表示する最終文章）<textarea value={facts.extraNote} maxLength={2000} onChange={event=>onChange({...facts,extraNote:event.target.value})} placeholder="「評価から授業報告を生成」を押すと文章が入ります。自由に修正・追記できます。" /></label>
    <div className="lesson-report-preview"><small>保護者への表示プレビュー</small><p>{facts.extraNote||'文章を生成すると、ここに表示されます。'}</p></div>
  </section>;
}
