'use client';
import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/firebaseConfig';
import './approval-redesign.css';

const itemId = item => `${item.studentKey}_${item.date}`;
const api = async (options = {}) => {
  const response = await fetch('/api/admin/lesson-reports', {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
};

export default function LessonReportApprovals() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError('');
    return api()
      .then(data => setItems((data.items || []).sort((a, b) => String(a.date).localeCompare(String(b.date)))))
      .catch(value => setError(value.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const word = query.trim().toLocaleLowerCase('ja');
    return word ? items.filter(item => `${item.name} ${item.date}`.toLocaleLowerCase('ja').includes(word)) : items;
  }, [items, query]);
  const selected = visible.find(item => itemId(item) === selectedId) || visible[0];
  const update = (id, text) => setItems(old => old.map(item => itemId(item) === id ? { ...item, text } : item));
  const approve = async item => {
    const id = itemId(item);
    setBusy(id);
    setNotice('');
    setError('');
    try {
      await api({ method: 'PATCH', body: JSON.stringify({ studentKey: item.studentKey, date: item.date, text: item.text }) });
      const next = visible.find(row => itemId(row) !== id);
      setItems(old => old.filter(row => itemId(row) !== id));
      setSelectedId(next ? itemId(next) : '');
      setNotice(`${item.name}さんの授業報告を承認し、保護者ページへ公開しました。`);
    } catch (value) {
      setError(value.message);
    } finally {
      setBusy('');
    }
  };

  return <section className="lesson-report-approvals approval-workspace">
    <header><div><small>REPORT APPROVAL</small><h2>未承認の授業報告</h2><p>生徒を選び、内容を確認して保護者へ公開します。</p></div><strong>{items.length}<span>件</span></strong></header>
    {notice && <p className="approval-notice" role="status">{notice}</p>}
    {error && <div className="approval-error" role="alert"><p>{error}</p><button type="button" onClick={items.length ? () => setError('') : load}>{items.length ? '閉じる' : '再読み込み'}</button></div>}
    {loading && <p className="approval-empty">未承認報告を読み込んでいます…</p>}
    {!loading && !error && !items.length && <div className="approval-empty"><strong>現在、未承認の授業報告はありません</strong><p>講師が送信すると、ここに表示されます。</p></div>}
    {!loading && items.length > 0 && <div className="approval-layout">
      <section className="approval-queue" aria-label="未承認報告の一覧">
        <label className="approval-search">生徒名・日付で探す<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="生徒名などを入力" /></label>
        <p className="approval-queue-count">{query ? `${visible.length}件が該当` : '古い授業日から表示'}</p>
        <div className="approval-queue-list">
          {visible.map(item => { const id = itemId(item); return <button type="button" key={id} className={itemId(selected) === id ? 'active' : ''} aria-pressed={itemId(selected) === id} onClick={() => setSelectedId(id)}><span><strong>{item.name}</strong><time dateTime={item.date}>{item.date.replaceAll('-', ' / ')}</time></span><small>{item.text || '本文がありません'}</small></button>; })}
          {!visible.length && <p className="approval-no-match">該当する報告はありません。</p>}
        </div>
      </section>
      <section className="approval-editor" aria-label="選択した授業報告">
        {selected ? <><header><div><small>公開前の確認</small><h3>{selected.name}さん</h3><p>{selected.studentKey.startsWith('elementary_') ? '小学生' : '中学生・高校生'} · <time dateTime={selected.date}>{selected.date.replaceAll('-', ' / ')}</time></p></div><span>未承認</span></header><label>保護者へ公開する文章<textarea rows="12" maxLength="2000" value={selected.text || ''} onChange={event => update(itemId(selected), event.target.value)} /><small>{(selected.text || '').length} / 2000文字</small></label><footer><span>必要なら文章を修正できます</span><button type="button" disabled={Boolean(busy) || !selected.text?.trim()} onClick={() => approve(selected)}>{busy === itemId(selected) ? '公開中…' : '承認して保護者へ公開'}</button></footer></> : <p className="approval-no-match">左の一覧から報告を選択してください。</p>}
      </section>
    </div>}
  </section>;
}
