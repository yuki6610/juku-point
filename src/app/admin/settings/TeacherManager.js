'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';

async function api(path = '', options) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/api/admin/teachers${path}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
  const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
}
export default function TeacherManager() {
  const [data, setData] = useState(null), [selected, setSelected] = useState(''), [name, setName] = useState(''), [notice, setNotice] = useState(''), [inviteUrl, setInviteUrl] = useState('');
  const load = () => api().then(setData).catch(error => setNotice(error.message));
  useEffect(load, []);
  const teacher = data?.teachers.find(item => item.uid === selected);
  const create = async () => { try { const token = await auth.currentUser?.getIdToken(); const response = await fetch('/api/admin/invites', { method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`}, body:JSON.stringify({role:'teacher',displayName:name}) }); const result=await response.json(); if(!response.ok)throw new Error(result.error); setInviteUrl(result.invite.url); setName(''); setNotice('講師用の招待リンクを発行しました。有効期限は7日間です。'); } catch (error) { setNotice(error.message); } };
  const save = async () => { try { await api('', { method: 'PATCH', body: JSON.stringify({ uid: teacher.uid, active: teacher.active }) }); setNotice('講師アカウントの状態を保存しました。'); await load(); } catch (error) { setNotice(error.message); } };
  return <section className="teacher-settings"><h2>講師アカウント</h2><p>講師名を入力して招待リンクを発行します。メールアドレスとパスワードは講師本人が登録します。</p>{notice && <p role="status">{notice}</p>}{inviteUrl && <div className="invite-box"><strong>招待リンク（7日間・1回限り）</strong><input readOnly value={inviteUrl}/><button onClick={()=>navigator.clipboard.writeText(inviteUrl).then(()=>setNotice('招待リンクをコピーしました。'))}>リンクをコピー</button></div>}
    <div className="teacher-create invite-create"><input placeholder="講師名" value={name} onChange={e => setName(e.target.value)} /><button onClick={create}>講師招待を発行</button></div>
    {data && <><label>登録済み講師<select value={selected} onChange={e => { setSelected(e.target.value); setInviteUrl(''); }}><option value="">選択してください</option>{data.teachers.map(item => <option key={item.uid} value={item.uid}>{item.displayName}{item.active === false ? '（停止中）' : ''}</option>)}</select></label>
    {teacher && <div><label><input type="checkbox" checked={teacher.active !== false} onChange={e => setData(current => ({ ...current, teachers: current.teachers.map(item => item.uid === selected ? { ...item, active: e.target.checked } : item) }))} />ログインを有効にする</label><button onClick={save}>アカウント状態を保存</button></div>}</>}
  </section>;
}
