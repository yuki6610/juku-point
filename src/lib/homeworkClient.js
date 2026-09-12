import { auth } from '@/firebaseConfig';
export async function homeworkApi(url, body) {
  const user = auth.currentUser;
  if (!user) throw new Error('ログインしてください。');
  const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '処理に失敗しました。');
  return data;
}
