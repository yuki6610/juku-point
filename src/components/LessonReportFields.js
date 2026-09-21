'use client';
import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '@/firebaseApp';
import { normalizeReportFacts } from '@/lib/lessonReport.mjs';

const LABELS = { focus:'集中度', understanding:'理解度', attitude:'学習態度', effort:'取り組み方', questions:'質問', retry:'解き直し' };
const RATING_LABELS = { 1:'かなり課題がある', 2:'やや課題がある', 3:'標準', 4:'良好', 5:'非常に良好' };
const SUBJECTS = ['国語','数学','英語','理科','社会','その他'];

export default function LessonReportFields({ learningContent, onLearningContentChange, value, onChange, context = {}, studentKey = '', lessonDate = '' }) {
  const facts = normalizeReportFacts(value);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const generate = async () => {
    setGenerating(true);
    setGenerateError('');
    try {
      const currentUser = getAuth(app).currentUser;
      if (!currentUser) throw new Error('ログイン情報を確認できません。');
      const response = await fetch('/api/lesson-report/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await currentUser.getIdToken()}`,
        },
        body: JSON.stringify({ learningContent, facts, context, studentKey, lessonDate }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '授業報告を生成できませんでした。');
      onChange({ ...facts, extraNote: result.text });
    } catch (error) {
      setGenerateError(`${error.message || '授業報告を生成できませんでした。'} 手入力でそのまま保存できます。`);
    } finally {
      setGenerating(false);
    }
  };

  return <section className="lesson-report-fields">
    <h3>保護者向け授業報告</h3>
    <p>5段階評価と授業内容をもとに、2〜4文の授業報告を生成します。生成後の文章は自由に修正できます。</p>
    <label>教科<select value={facts.subject} onChange={event=>onChange({...facts,subject:event.target.value})}><option value="">教科を選択</option>{SUBJECTS.map(subject=><option key={subject}>{subject}</option>)}</select></label>
    <label>学習内容<input value={learningContent} maxLength={500} onChange={event=>onLearningContentChange(event.target.value)} placeholder="例：一次方程式の文章題" /></label>
    <div className="lesson-report-grid">{Object.entries(LABELS).map(([key,label])=>{
      const selected = Number(facts[key]) || 3;
      return <div className="report-rating-control" key={key}>
        <span className="report-rating-title">{label}</span>
        <div className="report-rating-buttons" role="group" aria-label={`${label}の5段階評価`}>
          {[1,2,3,4,5].map(score=><button key={score} type="button" className={selected===score?'selected':''} aria-pressed={selected===score} aria-label={`${score} ${RATING_LABELS[score]}`} onClick={()=>onChange({...facts,[key]:score})}>{score}</button>)}
        </div>
        <small>{selected}：{RATING_LABELS[selected]}</small>
      </div>;
    })}</div>
    <p className="report-rating-scale">1 かなり課題がある ／ 2 やや課題がある ／ 3 標準 ／ 4 良好 ／ 5 非常に良好</p>
    <button type="button" className="report-generate" onClick={generate} disabled={generating}>{generating ? '生成しています…' : '授業報告を生成'}</button>
    {generateError && <p className="lesson-report-generate-error" role="alert">{generateError}</p>}
    <label>補足（API生成時に使用）<textarea value={facts.supplement} maxLength={500} onChange={event=>onChange({...facts,supplement:event.target.value})} placeholder="例：文章問題で少し時間がかかった" /></label>
    <label>授業報告（保護者に送信する授業報告文）<textarea value={facts.extraNote} maxLength={2000} onChange={event=>onChange({...facts,extraNote:event.target.value})} placeholder="「授業報告を生成」を押すと文章が入ります。内容を確認し、必要に応じて修正してください。" /></label>
    <div className="lesson-report-preview"><small>保護者への表示プレビュー</small><p>{facts.extraNote||'文章を生成すると、ここに表示されます。'}</p></div>
  </section>;
}
