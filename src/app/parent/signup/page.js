import '../../auth.css';

export default function ParentSignup() {
  return <main className="auth-shell auth-parent"><section className="auth-card"><div className="brand-mark" aria-hidden="true">C</div><p className="auth-eyebrow">PARENT ACCOUNT</p><h1 className="auth-title">保護者アカウント登録</h1><p className="auth-copy">保護者の登録には、お子さまと紐付け済みの個別招待QRが必要です。教室からお渡しするQRを読み取って登録してください。</p><p className="auth-copy">まだ招待QRを受け取っていない場合は、教室へお問い合わせください。</p><a className="auth-button secondary" href="/parent/login">保護者ログインへ</a></section></main>;
}
