'use client';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import '../../auth.css';

const loginPath = { student: '/login', parent: '/parent/login', teacher: '/teacher/login' };

function RecoverForm() {
  const { id } = useParams(), params = useSearchParams(), router = useRouter(), token = params.get('token') || '';
  const [status, setStatus] = useState('確認中…'), [valid, setValid] = useState(false), [role, setRole] = useState('student'), [password, setPassword] = useState(''), [again, setAgain] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const api = async body => { const response = await fetch('/api/account-recovery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, token, ...body }), cache: 'no-store' }), value = await response.json(); if (!response.ok) throw new Error(value.error); return value; };
  useEffect(() => { let active = true; api({ action: 'preview' }).then(value => { if (active) { setValid(true); setRole(value.role); setStatus(`有効期限：${new Date(value.expiresAt).toLocaleString('ja-JP')}`); } }).catch(error => active && setStatus(error.message)); return () => { active = false; }; }, [id, token]);
  const reset = async event => { event.preventDefault(); if (password.length < 8 || password.length > 128) return setStatus('8〜128文字のパスワードを入力してください。'); if (password !== again) return setStatus('確認用パスワードが一致しません。'); setBusy(true); try { await api({ action: 'reset', password }); setDone(true); setPassword(''); setAgain(''); setStatus('パスワードを再設定しました。新しいパスワードでログインしてください。'); } catch (error) { setStatus(error.message); } finally { setBusy(false); } };
  return <main className="auth-shell"><section className="auth-card"><div className="brand-mark" aria-hidden="true">C</div><p className="auth-eyebrow">ACCOUNT RECOVERY</p><h1 className="auth-title">パスワード再設定</h1><p className="auth-copy">このリンクは1回限り利用できます。</p><p className="auth-message" role="status">{status}</p>{valid && !done && <form className="auth-form" onSubmit={reset}><label className="auth-field"><span className="auth-label">新しいパスワード</span><input className="auth-input" type="password" autoComplete="new-password" minLength="8" maxLength="128" value={password} onChange={event => setPassword(event.target.value)} required/></label><label className="auth-field"><span className="auth-label">確認用パスワード</span><input className="auth-input" type="password" autoComplete="new-password" value={again} onChange={event => setAgain(event.target.value)} required/></label><button className="auth-button primary" disabled={busy}>{busy ? '再設定中…' : 'パスワードを再設定'}</button></form>}{done && <button className="auth-button primary" onClick={() => router.replace(loginPath[role] || '/login')}>ログイン画面へ</button>}</section></main>;
}

export default function RecoverPage() { return <Suspense fallback={<main className="auth-shell"><p>確認中…</p></main>}><RecoverForm/></Suspense>; }
