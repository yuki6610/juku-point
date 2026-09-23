'use client';
import InviteIssuer from '@/components/InviteIssuer';

export default function AdminInviteManager(){
  return <section className="teacher-settings"><h2>管理者アカウント招待</h2><p>新しい校舎などで管理者が必要な場合だけ使用します。招待された管理者は既存管理者と同じ権限を持ちます。</p><InviteIssuer role="admin" title="管理者" description="現在の千鳥が丘校では追加発行する必要はありません。" /></section>;
}
