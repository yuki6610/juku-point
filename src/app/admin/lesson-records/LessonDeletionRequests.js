'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';

async function api(options = {}) {
  const response = await fetch('/api/admin/lesson-deletion-requests', { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '削除申請を処理できませんでした。');
  return result;
}

export default function LessonDeletionRequests() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const load = () => api().then(result => setItems(result.items || [])).catch(error => setNotice(error.message));
  useEffect(() => { load(); }, []);
  const handle = async (item, action) => {
    if (action === 'approve' && !window.confirm(`${item.date}の${item.name}さんの授業記録全体を削除します。出欠・授業報告・その日に出した宿題・獲得ポイントも取り消します。よろしいですか？`)) return;
    const id = `${item.studentKey}:${item.date}`;
    setBusy(id);
    setNotice('');
    try {
      await api({ method: 'PATCH', body: JSON.stringify({ studentKey: item.studentKey, date: item.date, action }) });
      setNotice(action === 'approve' ? '授業記録を削除しました。' : '削除申請を却下しました。');
      await load();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(''); }
  };
  return <section className="lesson-report-approvals"><header><h2>授業記録の削除申請</h2><p>講師からの申請を確認し、承認または却下します。</p></header>{notice && <p role="status">{notice}</p>}{items.length ? items.map(item => <article key={`${item.studentKey}:${item.date}`}><strong>{item.name}さん</strong><span>　{item.date}</span><div><button type="button" disabled={Boolean(busy)} onClick={() => handle(item, 'approve')}>記録全体を削除</button><button type="button" disabled={Boolean(busy)} onClick={() => handle(item, 'reject')}>却下</button></div></article>) : <p>承認待ちの削除申請はありません。</p>}</section>;
}
