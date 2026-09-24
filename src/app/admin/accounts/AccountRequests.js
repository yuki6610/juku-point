'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';
import './account-requests.css';

const roleNames = { teacher: '講師', parent: '保護者', admin: '管理者' };
const gradeName = grade => grade <= 6 ? `小${grade}` : `中${grade - 6}`;

export default function AccountRequests() {
  const [data, setData] = useState(null);
  const [links, setLinks] = useState({});
  const [search, setSearch] = useState({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const api = async (options = {}) => {
    const response = await fetch('/api/admin/account-requests', { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  };
  const load = () => api().then(setData).catch(error => setNotice(error.message));
  useEffect(() => { load(); }, []);
  const toggle = (uid, key) => setLinks(old => {
    const selected = old[uid] || [];
    return { ...old, [uid]: selected.includes(key) ? selected.filter(value => value !== key) : [...selected, key] };
  });
  const review = async (item, action) => {
    if (busy || item.role === 'parent' && action === 'approve' && !(links[item.uid] || []).length) return;
    if (item.role === 'admin' && action === 'approve' && !window.confirm(`${item.displayName}さんに管理者権限を付与しますか？既存管理者と同じ権限になります。`)) return;
    if (action === 'reject' && !window.confirm(`${item.displayName}さんの登録申請を却下しますか？`)) return;
    setBusy(item.uid);
    setNotice('');
    try {
      await api({ method: 'PATCH', body: JSON.stringify({ uid: item.uid, action, childKeys: links[item.uid] || [] }) });
      setNotice(`${item.displayName}さんの申請を${action === 'approve' ? '承認' : '却下'}しました。`);
      await load();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy('');
    }
  };

  return <section className="account-requests"><header><div><h2>共通QRからの登録申請</h2><p>講師の申請を確認・承認します。保護者には「保護者」タブで生徒を選び、個別招待QRを発行してください。旧方式の保護者申請が残っている場合はここで確認できます。</p></div><strong>{data?.requests.length ?? '—'}件</strong></header>
    {notice && <p role="status" className="account-request-notice">{notice}</p>}
    {!data && !notice && <p>申請を読み込んでいます…</p>}
    {data?.requests.length === 0 && <p className="account-request-empty">承認待ちの申請はありません。</p>}
    <div className="account-request-list">{(data?.requests || []).map(item => {
      const selected = links[item.uid] || [];
      const word = (search[item.uid] || '').trim();
      const students = word ? data.students.filter(student => student.name.includes(word)) : data.students;
      return <article key={item.uid}><header><div><span>{roleNames[item.role] || item.role}</span><h3>{item.displayName}</h3><p>{item.email}</p></div><small>{item.createdAt ? new Date(item.createdAt).toLocaleString('ja-JP') : ''}</small></header>
        {item.role === 'parent' && <div className="account-request-children"><p>申請時のお子さまの氏名：<strong>{item.childName}</strong></p><label>紐付ける生徒を検索<input type="search" value={search[item.uid] || ''} onChange={event => setSearch(old => ({ ...old, [item.uid]: event.target.value }))} placeholder="生徒名" /></label><div className="account-request-child-list">{students.map(student => <label key={student.key}><input type="checkbox" checked={selected.includes(student.key)} onChange={() => toggle(item.uid, student.key)} />{student.name}<small>{gradeName(student.grade)}</small></label>)}</div><small>選択中：{selected.length}人。氏名だけで確定せず、本人との関係を確認してください。</small></div>}
        <footer><button type="button" disabled={Boolean(busy) || item.role === 'parent' && !selected.length} onClick={() => review(item, 'approve')}>{busy === item.uid ? '処理中…' : '承認して利用可能にする'}</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => review(item, 'reject')}>却下</button></footer>
      </article>;
    })}</div>
  </section>;
}
