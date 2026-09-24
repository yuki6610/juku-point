'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

const COPY = {
  student: { eyebrow: 'STUDENT', title: '生徒ログイン', copy: '生徒用アカウントでログインしてください。' },
  teacher: { eyebrow: 'TEACHER', title: '講師ログイン', copy: '授業後の記録を入力する講師専用画面です。' },
  parent: { eyebrow: 'PARENT', title: '保護者ログイン', copy: 'お子さまの授業記録・学期レポートを確認できます。' },
};

export default function RoleLogin({ mode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(null);
  const router = useRouter();
  const copy = COPY[mode];
  const fail = async (auth, text) => { await auth.signOut(); throw new Error(text); };

  const submit = async event => {
    event.preventDefault();
    if (submitting) return;
    if (!email || !password) return setMessage({ tone: 'error', text: 'メールアドレスとパスワードを入力してください。' });
    setSubmitting(true);
    setMessage(null);
    try {
      const auth = getAuth();
      await auth.authStateReady?.();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      const response = await fetch('/api/auth/role', { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const result = await response.json();
      if (!response.ok) throw new Error('権限情報を確認できませんでした。');
      if (result.role === 'disabled') await fail(auth, 'このアカウントは現在停止されています。教室へお問い合わせください。');
      if (String(result.role).startsWith('pending')) await fail(auth, '登録申請は管理者の確認待ちです。教室からの案内をお待ちください。');
      if (result.role === 'requestRejected') await fail(auth, '登録申請を確認できません。教室へお問い合わせください。');
      if (mode === 'teacher') {
        if (result.role !== 'teacher') await fail(auth, '講師アカウントではありません。講師用のログイン情報を確認してください。');
        return router.replace('/teacher');
      }
      if (mode === 'parent') {
        if (result.role !== 'parent') await fail(auth, '保護者アカウントではありません。保護者用のログイン情報を確認してください。');
        return router.replace('/parent');
      }
      if (result.role === 'admin') return router.replace('/admin');
      if (result.role !== 'student') await fail(auth, '生徒アカウントではありません。専用のログイン画面をご利用ください。');
      const studentKey = result.studentKey || `user_${user.uid}`;
      const elementary = studentKey.startsWith('elementary_');
      const userRef = doc(db, elementary ? 'adminStudents' : 'users', studentKey.slice(elementary ? 11 : 5));
      const snapshot = await getDoc(userRef);
      if (!snapshot.exists() && !elementary) await setDoc(userRef, { realName: '未登録', displayName: user.displayName || '未設定', level: 1, points: 0, termPoints: 0, totalEarnedPoints: 0, experience: 0, createdAt: serverTimestamp() });
      if (!snapshot.exists() && elementary) throw new Error('紐付いた生徒情報を確認できません。教室へお問い合わせください。');
      router.replace('/mypage');
    } catch (error) {
      console.error('ログインエラー:', error);
      const credentialError = ['auth/user-not-found', 'auth/wrong-password', 'auth/invalid-credential'].includes(error.code);
      setMessage({ tone: 'error', text: credentialError ? 'メールアドレスまたはパスワードが違います。' : error.message || 'ログインに失敗しました。時間をおいてお試しください。' });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = async () => {
    if (!email) return setMessage({ tone: 'error', text: '先にメールアドレスを入力してください。' });
    try {
      await sendPasswordResetEmail(getAuth(), email);
      setMessage({ tone: 'success', text: '再設定メールを送信しました。メールをご確認ください。' });
    } catch {
      setMessage({ tone: 'error', text: '再設定メールを送信できませんでした。' });
    }
  };

  return <main className={`auth-shell auth-${mode}`}><section className="auth-card">
    <div className="brand-mark" aria-hidden="true">C</div>
    <p className="auth-eyebrow">{copy.eyebrow}</p>
    <h1 className="auth-title">{copy.title}</h1>
    <p className="auth-copy">{copy.copy}</p>
    <form className="auth-form" onSubmit={submit}>
      <label className="auth-field"><span className="auth-label">メールアドレス</span><input className="auth-input" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label className="auth-field"><span className="auth-label">パスワード</span><div className="auth-password"><input className="auth-input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? '隠す' : '表示'}</button></div></label>
      {message && <p className={`auth-message ${message.tone}`} role="status">{message.text}</p>}
      <button className="auth-button primary" disabled={submitting}>{submitting ? 'ログイン中…' : 'ログイン'}</button>
      <button type="button" onClick={reset} className="auth-link">パスワードを忘れた方</button>
      {mode === 'student' && <><div className="auth-divider" /><button type="button" onClick={() => router.push('/signup')} className="auth-button secondary">生徒アカウントを新規登録</button></>}
      {mode !== 'student' && <button type="button" className="auth-link" onClick={() => router.push('/login')}>生徒ログインへ</button>}
    </form>
  </section></main>;
}
