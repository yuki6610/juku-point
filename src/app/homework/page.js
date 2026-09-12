'use client';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/firebaseConfig';
import { homeworkApi } from '@/lib/homeworkClient';
import '../admin/lesson-records/homework.css';
export default function HomeworkPage() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const stop = onAuthStateChanged(auth, user => {
      setData(null);
      if (!user) { setError('ログインしてください。'); return; }
      setError(''); homeworkApi('/api/homework').then(data => { if (active && auth.currentUser?.uid === user.uid) setData(data); }).catch(() => { if (active) setError('宿題を取得できませんでした。再読み込みしてください。'); });
    });
    return () => { active = false; stop(); };
  }, []);
  const more = async () => { setBusy(true); try { const next = await homeworkApi(`/api/homework?after=${encodeURIComponent(data.next)}`); setData({ ...next, items: [...data.items, ...next.items] }); } catch (error) { setError(error.message); } finally { setBusy(false); } };
  return <main className="homework-panel" style={{ maxWidth: 850, margin: '20px auto 100px' }}><a href="/mypage">マイページへ</a><h1>今回の宿題</h1>{error && <p role="alert">{error}</p>}{!data && !error && <p>読み込み中…</p>}{data && <>{!data.items.length && <p>登録された宿題はありません。</p>}{data.items.map(item => <article key={item.id}><h2>{item.dueDate} 確認予定</h2><small>指示日：{item.assignedDate}</small><ul>{item.items.map(row => <li key={row.id}>{row.materialLabel}：{row.range}{item.review?.missingIds?.includes(row.id) ? '（確認時に未実施）' : ''}</li>)}</ul><p>{item.review?.text || 'まだ確認していません。'}</p>{item.review && <small>確認日：{item.review.date}</small>}{item.laterCompletion && <p>{item.laterCompletion.date}：{item.laterCompletion.text}</p>}</article>)}{data.next && <button disabled={busy} onClick={more}>以前の宿題を表示</button>}<h2>授業のコメント</h2>{data.comments.filter(item => item.comments.length).map(item => <article key={item.date}><strong>{item.date}</strong>{item.comments.map(comment => <p key={comment.id}>{comment.text}</p>)}</article>)}</>}</main>;
}
