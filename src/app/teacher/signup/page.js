import Link from 'next/link';
import '../../auth.css';

export default function TeacherSignup(){
  return <main className="auth-shell auth-teacher"><section className="auth-card"><div className="brand-mark">C</div><p className="auth-eyebrow">TEACHER INVITATION</p><h1 className="auth-title">講師登録には招待QRが必要です</h1><p className="auth-copy">教室の管理者から発行された期限付きQRコードを読み取って登録してください。このURLから直接登録することはできません。</p><Link className="auth-button secondary" href="/teacher/login">講師ログインへ戻る</Link></section></main>;
}
