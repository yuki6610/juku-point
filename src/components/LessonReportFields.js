'use client';
import { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { app } from '@/firebaseApp';
import { normalizeReportFacts } from '@/lib/lessonReport.mjs';

const LABELS = { focus:'集中度', understanding:'理解度', attitude:'学習態度', questions:'質問' };
const RATING_LABELS = { 1:'かなり課題がある', 2:'やや課題がある', 3:'標準', 4:'良好', 5:'非常に良好' };
const SUBJECTS = ['国語','数学','英語','理科','社会','その他'];
const ELEMENTARY_SUBJECTS = ['国語','算数','英語','理科','社会','その他'];

export default function LessonReportFields({ learningContent, onLearningContentChange, value, onChange, context = {}, studentKey = '', lessonDate = '', teacherView=false, elementary=false }) {
  const facts = normalizeReportFacts(value);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  useEffect(()=>{const subject=elementary&&['数学','math','arithmetic'].includes(context.subject)?'算数':context.subject;if(elementary&&['数学','math','arithmetic'].includes(facts.subject))onChange({...facts,subject:'算数'});else if(!facts.subject&&subject)onChange({...facts,subject})},[context.subject,elementary,facts.subject]);

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

  const labels = teacherView ? Object.fromEntries(Object.entries(LABELS).filter(([key])=>key!=='questions')) : LABELS;
  return <section className="lesson-report-fields">
    <h3>{teacherView?'保護者への授業報告':'保護者向け授業報告'}</h3>
    {!teacherView&&<p>授業内容と、必要な場合だけ選択した5段階評価をもとに授業報告を生成します。</p>}
    <label>教科<select value={elementary&&['数学','math','arithmetic'].includes(facts.subject)?'算数':facts.subject||''} onChange={event=>onChange({...facts,subject:event.target.value})}><option value="">教科を選択</option>{(elementary?ELEMENTARY_SUBJECTS:SUBJECTS).map(subject=><option key={subject}>{subject}</option>)}</select></label>
    <label>学習内容<input value={learningContent} maxLength={500} onChange={event=>onLearningContentChange(event.target.value)} placeholder="例：一次方程式の文章題" /></label>
    <div className="lesson-report-grid">{Object.entries(labels).map(([key,label])=>{
      const selected = Number(facts[key]) || 0;
      return <div className="report-rating-control" key={key}>
        <span className="report-rating-title">{label}</span>
        <div className="report-rating-buttons" role="group" aria-label={`${label}の5段階評価`}>
          {[1,2,3,4,5].map(score=><button key={score} type="button" className={selected===score?'selected':''} aria-pressed={selected===score} aria-label={`${score} ${RATING_LABELS[score]}`} onClick={()=>{const next={...facts};if(selected===score)delete next[key];else next[key]=score;onChange(next)}}>{score}</button>)}
        </div>
        <small>{selected ? `${selected}：${RATING_LABELS[selected]}` : '未選択（集計対象外）'}</small>
      </div>;
    })}</div>
    <p className="report-rating-scale">1 かなり課題がある ／ 2 やや課題がある ／ 3 標準 ／ 4 良好 ／ 5 非常に良好</p>
    <label className="lesson-report-supplement">補足（生成時だけ使用）<textarea rows="3" value={facts.supplement||''} maxLength={500} onChange={event=>onChange({...facts,supplement:event.target.value})} placeholder="例：文章問題で少し時間がかかった" /></label>
    <button type="button" className="report-generate" onClick={generate} disabled={generating}>{generating ? '生成しています…' : '授業報告を生成'}</button>
    {generateError && <p className="lesson-report-generate-error" role="alert">{generateError}</p>}
    <label className="lesson-report-main">{teacherView?'授業報告（管理者の承認後に保護者へ公開）':'授業報告（保護者に送信する文章）'}<textarea rows="10" value={facts.extraNote||''} maxLength={2000} onChange={event=>onChange({...facts,extraNote:event.target.value})} placeholder="「授業報告を生成」を押すと文章が入ります。内容を確認し、必要に応じて修正してください。" /></label>
    <div className="lesson-report-preview"><small>保護者への表示プレビュー</small><p>{facts.extraNote||'文章を生成すると、ここに表示されます。'}</p></div>
  </section>;
}
