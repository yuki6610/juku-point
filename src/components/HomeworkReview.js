'use client';
import { useEffect, useState } from 'react';
import { homeworkApi } from '@/lib/homeworkClient';
import { RESULT_LABELS } from '@/lib/homeworkModel.mjs';
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
    <label>確認する宿題セット<select value={value?.assignmentId || ''} onChange={event => {
      const item = data.items.find(item => item.id === event.target.value);
      onChange(item ? { assignmentId: item.id, status: item.review?.date === date ? item.review.status : 'pending', missingIds: item.review?.date === date ? item.review.missingIds || [] : [] } : null);
    }}><option value="">セットを選択しない（従来の提出入力）</option>{data.items.filter(item => item.assignedDate <= date).map(item => <option key={item.id} value={item.id}>{item.dueDate}確認予定 / {item.items.map(row => row.materialLabel).join('・')} / {item.review ? RESULT_LABELS[item.review.status] : '未確認'}</option>)}</select></label>
    {data.next && <button type="button" disabled={busy} onClick={more}>古い宿題をさらに表示</button>}
    {value?.assignmentId && !selected && <p>対象セットを表示するには「古い宿題をさらに表示」を押してください。</p>}
    {selected && <><ul>{selected.items.map(item => <li key={item.id}>{item.materialLabel}：{item.range}</li>)}</ul>
      <label>今回の確認結果<select value={value.status} onChange={event => onChange({ ...value, status: event.target.value, missingIds: [] })}>{Object.entries(RESULT_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <p>公開される定型文：{data.templates.results[value.status]}</p>
      {value.status === 'partial' && <div>未実施の課題（任意）{selected.items.map(item => <label key={item.id}><input type="checkbox" checked={value.missingIds?.includes(item.id) || false} onChange={event => onChange({ ...value, missingIds: event.target.checked ? [...(value.missingIds || []), item.id] : (value.missingIds || []).filter(id => id !== item.id) })} />{item.materialLabel}：{item.range}</label>)}</div>}
      <small>確認結果は下の「この記録を保存」で保存します。一部未実施も未提出扱いです。後日完了の追記では宿題ポイントを付与しません。</small>
    </>}
    <h3>生徒・保護者向けコメント（任意）</h3>
    {data.templates.comments.map(item => <label key={item.id} style={{ display: 'block' }}><input type="checkbox" checked={commentIds.includes(item.id)} onChange={event => onCommentsChange(event.target.checked ? [...commentIds, item.id] : commentIds.filter(id => id !== item.id))} />{item.label}</label>)}
    <small>未選択の場合、コメントは表示しません。内部メモは公開しません。</small>
  </>;
}
