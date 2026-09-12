'use client';
import { useEffect, useState } from 'react';
import { homeworkApi } from '@/lib/homeworkClient';
import { RESULT_LABELS } from '@/lib/homeworkModel.mjs';
import '../lesson-records/homework.css';
export default function HomeworkTemplates() {
  const [templates, setTemplates] = useState(null), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { homeworkApi('/api/admin/homework').then(data => setTemplates(data.templates)).catch(error => setNotice(error.message)); }, []);
  const save = async () => { setBusy(true); try { await homeworkApi('/api/admin/homework', { action: 'templates', templates }); setNotice('選択肢を保存しました。入力画面を再読み込みすると反映されます。過去に保存した文章は変わりません。'); } catch (error) { setNotice(error.message); } finally { setBusy(false); } };
  return <section className="homework-panel"><h2>教材・公開コメントの選択肢</h2><p>仮の教材名・定型文です。変更は今後の入力に適用されます。範囲だけは宿題登録時に入力します。</p>{notice && <p role="status">{notice}</p>}{templates && <fieldset disabled={busy}><legend>選択肢の編集</legend>{[['materials', '教材名'], ['comments', '学習態度の定型文']].map(([key, title]) => <div key={key}><h3>{title}</h3>{templates[key].map((item, index) => <div className="homework-row" key={item.id}><input aria-label={`${title}${index + 1}`} value={item.label} maxLength={200} onChange={event => setTemplates({ ...templates, [key]: templates[key].map((row, n) => n === index ? { ...row, label: event.target.value } : row) })} /><button onClick={() => setTemplates({ ...templates, [key]: templates[key].filter(row => row.id !== item.id) })}>今後の選択肢から外す</button></div>)}<button onClick={() => setTemplates({ ...templates, [key]: [...templates[key], { id: crypto.randomUUID(), label: '' }] })}>＋選択肢を追加</button></div>)}<h3>提出結果の定型文</h3>{Object.entries(RESULT_LABELS).map(([id, label]) => <label key={id}>{label}<input style={{ width: '100%' }} value={templates.results[id]} maxLength={300} onChange={event => setTemplates({ ...templates, results: { ...templates.results, [id]: event.target.value } })} /></label>)}<button onClick={save}>教材・定型文を保存</button></fieldset>}</section>;
}
