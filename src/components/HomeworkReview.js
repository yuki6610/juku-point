'use client';
import { useEffect, useState } from 'react';
import { homeworkApi } from '@/lib/homeworkClient';
import { aggregateItemResults, ITEM_RESULT_LABELS, RESULT_LABELS } from '@/lib/homeworkModel.mjs';
export default function HomeworkReview({ studentKey, date, value, onChange, commentIds, onCommentsChange, onReadyChange }) {
  const [data, setData] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    onReadyChange(false); setData(null); setError('');
    homeworkApi(`/api/admin/homework?student=${encodeURIComponent(studentKey)}`).then(result => { if (active) { setData(result); onReadyChange(true); } }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [studentKey, date, onReadyChange]);
  const more = async () => {
    setBusy(true);
    try { const next = await homeworkApi(`/api/admin/homework?student=${encodeURIComponent(studentKey)}&after=${encodeURIComponent(data.next)}`); setData(old => ({ ...next, items: [...old.items, ...next.items] })); } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  if (error) return <p role="alert">{error} 画面を再読み込みしてください。</p>;
  if (!data) return <p>宿題を確認中…</p>;
  const selected = data.items.find(item => item.id === value?.assignmentId);
  return <>
    <label>確認する宿題<select value={value?.assignmentId || ''} onChange={event => {
      const item = data.items.find(item => item.id === event.target.value);
      onChange(item ? { assignmentId: item.id, status: item.review?.date === date ? item.review.status : 'pending', itemResults: item.review?.date === date ? item.review.itemResults || {} : {} } : null);
    }}><option value="">登録済み宿題を選択しない</option>{data.items.filter(item => item.assignedDate <= date).map(item => <option key={item.id} value={item.id}>{item.dueDate}確認予定 / {item.items.map(row => `${row.materialLabel} ${row.range}`).join('・')} / {item.review ? RESULT_LABELS[item.review.status] : '未確認'}</option>)}</select></label>
    {data.next && <button type="button" disabled={busy} onClick={more}>古い宿題をさらに表示</button>}
    {value?.assignmentId && !selected && <p>対象セットを表示するには「古い宿題をさらに表示」を押してください。</p>}
    {selected && <><div>{selected.items.map(item => <div key={item.id}><strong>{item.materialLabel}：{item.range}</strong><div className="choice-grid three">{Object.entries(ITEM_RESULT_LABELS).map(([status,label])=><button type="button" key={status} className={value.itemResults?.[item.id]===status?'selected':''} onClick={()=>{const itemResults={...(value.itemResults||{}),[item.id]:status};onChange({...value,itemResults,status:aggregateItemResults(selected.items,itemResults)})}}>{label}</button>)}</div></div>)}</div>
      <p>総合判定：{RESULT_LABELS[aggregateItemResults(selected.items,value.itemResults)]}</p>
      <p>公開される定型文：{data.templates.results[aggregateItemResults(selected.items,value.itemResults)]}</p>
      <small>すべて提出で+50pt、1つでも未提出なら-50pt、未提出がなく途中がある場合は-25ptです。提出回数に週単位の制限はありません。</small>
    </>}
    <h3>生徒・保護者向けコメント（任意）</h3>
    {data.templates.comments.map(item => <label key={item.id} style={{ display: 'block' }}><input type="checkbox" checked={commentIds.includes(item.id)} onChange={event => onCommentsChange(event.target.checked ? [...commentIds, item.id] : commentIds.filter(id => id !== item.id))} />{item.label}</label>)}
    <small>未選択の場合、コメントは表示しません。内部メモは公開しません。</small>
  </>;
}
