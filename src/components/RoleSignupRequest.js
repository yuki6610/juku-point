'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/firebaseConfig';

const LABELS = { teacher: '講師', admin: '管理者' };

export default function RoleSignupRequest({ role }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState('');
  const label = LABELS[role];
  const loginPath = role === 'teacher' ? '/teacher/login' : '/login';

  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    if (!displayName.trim() || !email || password.length < 8 || password !== confirm) {
      setMessage('氏名・メールアドレス・8文字以上のパスワードと確認欄を入力してください。');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      let credential;
      try {
        credential = await createUserWithEmailAndPassword(auth, email, password);
      } catch (error) {
        if (error.code !== 'auth/email-already-in-use') throw error;
        credential = await signInWithEmailAndPassword(auth, email, password);
      }
      const response = await fetch('/api/account-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await credential.user.getIdToken()}` },
        body: JSON.stringify({ role, displayName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '登録申請に失敗しました。');
      setComplete(true);
    } catch (error) {
      setMessage(error.message || '登録申請に失敗しました。教室へお問い合わせください。');
    } finally {
      await signOut(auth).catch(() => {});
      setBusy(false);
    }
  };

  return <main className={`auth-shell auth-${role}`}><section className="auth-card"><div className="brand-mark" aria-hidden="true">C</div><p className="auth-eyebrow">ACCOUNT REQUEST</p><h1 className="auth-title">{label}アカウント登録申請</h1>
    {complete ? <><p className="auth-copy">申請を受け付けました。教室で確認後、利用できるようになります。承認まではログインできません。</p><button type="button" className="auth-button secondary" onClick={() => router.replace(loginPath)}>ログイン画面へ</button></> : <><p className="auth-copy">ご本人の情報を入力してください。管理者が確認してから利用可能になります。</p><form className="auth-form" onSubmit={submit}>
      <label className="auth-field"><span className="auth-label">氏名</span><input className="auth-input" autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={80} required /></label>
      <label className="auth-field"><span className="auth-label">メールアドレス</span><input className="auth-input" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      <label className="auth-field"><span className="auth-label">パスワード（8文字以上）</span><input className="auth-input" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={8} required /></label>
      <label className="auth-field"><span className="auth-label">パスワード確認</span><input className="auth-input" type="password" autoComplete="new-password" value={confirm} onChange={event => setConfirm(event.target.value)} minLength={8} required /></label>
      {message && <p className="auth-message error" role="alert">{message}</p>}
      <button className="auth-button primary" disabled={busy}>{busy ? '申請中…' : '登録を申請'}</button>
    </form>{role === 'teacher' && <button type="button" className="auth-link" onClick={() => router.push('/teacher/login')}>登録済みの講師はこちらからログイン</button>}</>}
  </section></main>;
}
