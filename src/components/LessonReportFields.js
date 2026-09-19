'use client';
import { generateLessonReport, normalizeReportFacts } from '@/lib/lessonReport.mjs';

const OPTIONS = {
  focus: [['high','高い'],['normal','通常'],['low','要支援']],
  understanding: [['high','よく理解'],['normal','概ね理解'],['low','要復習']],
  effort: [['strong','粘り強い'],['normal','通常'],['needsSupport','声かけが必要']],
  questions: [['active','自分から質問'],['some','促すと質問'],['none','質問なし']],
  retry: [['completed','解き直し済み'],['partial','一部実施'],['notNeeded','該当なし']],
  concern: [['none','特になし'],['pace','学習ペース'],['foundation','基礎定着'],['careless','見直し・ミス']],
};
const LABELS = { focus:'集中度', understanding:'理解度', effort:'取り組み', questions:'質問', retry:'解き直し', concern:'気になった点' };

export default function LessonReportFields({ learningContent, onLearningContentChange, value, onChange, context = {} }) {
  const facts = normalizeReportFacts(value);
  const preview = generateLessonReport({ ...context, learningContent, facts }).text;
  return <section className="lesson-report-fields">
    <h3>保護者向け授業レポート</h3>
    <p>授業中の事実を選ぶと、伝える価値の高い内容を2〜3文にまとめます。</p>
    <label>学習内容<input value={learningContent} maxLength={500} onChange={event=>onLearningContentChange(event.target.value)} placeholder="例：一次方程式の文章題" /></label>
    <div className="lesson-report-grid">{Object.entries(OPTIONS).map(([key,options])=><label key={key}>{LABELS[key]}<select value={facts[key]} onChange={event=>onChange({...facts,[key]:event.target.value})}>{options.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>)}</div>
    <label>特記事項（必要な場合のみ）<input value={facts.extraNote} maxLength={500} onChange={event=>onChange({...facts,extraNote:event.target.value})} placeholder="公開してよい内容だけ入力" /></label>
    <div className="lesson-report-preview"><small>保護者への表示プレビュー</small><p>{preview}</p></div>
  </section>;
}
