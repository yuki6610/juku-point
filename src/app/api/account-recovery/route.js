import { createHash, timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validId = value => /^[a-f0-9]{32}$/.test(value || '');
const validToken = value => /^[A-Za-z0-9_-]{43}$/.test(value || '');
const sameHash = (token, hash) => { const actual = createHash('sha256').update(token).digest(); const expected = Buffer.from(hash || '', 'hex'); return expected.length === actual.length && timingSafeEqual(actual, expected); };
const invalid = () => Object.assign(new Error('リンクが無効、使用済み、または期限切れです。管理者に再発行を依頼してください。'), { status: 410 });

export async function POST(request) {
  try {
    const body = await request.json();
    if (!validId(body.id) || !validToken(body.token)) throw invalid();
    const ref = adminDb.collection('accountRecoveryRequests').doc(body.id);
    if (body.action === 'preview') {
      const snap = await ref.get(), item = snap.data();
      if (!item || !sameHash(body.token, item.secretHash) || item.status !== 'issued' || item.expiresAt.toMillis() <= Date.now()) throw invalid();
      const subject = await adminDb.collection('accountRecoverySubjects').doc(item.uid).get();
      if (subject.data()?.version !== item.version) throw invalid();
      return Response.json({ valid: true, role: item.role, expiresAt: item.expiresAt.toDate().toISOString() });
    }
    if (body.action !== 'reset' || typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) throw new Error('8〜128文字の新しいパスワードを入力してください。');
    let uid;
    await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref), item = snap.data();
      if (!item || !sameHash(body.token, item.secretHash) || item.status !== 'issued' || item.expiresAt.toMillis() <= Date.now()) throw invalid();
      const subject = await tx.get(adminDb.collection('accountRecoverySubjects').doc(item.uid));
      if (subject.data()?.version !== item.version) throw invalid();
      uid = item.uid;
      tx.update(ref, { status: 'used', usedAt: FieldValue.serverTimestamp(), secretHash: FieldValue.delete() });
    });
    await adminAuth.updateUser(uid, { password: body.password });
    await adminAuth.revokeRefreshTokens(uid);
    return Response.json({ reset: true });
  } catch (error) { return Response.json({ error: error.message || '再設定できませんでした。', retryWithNewLink: error.code === 'auth/user-not-found' }, { status: error.status || 400 }); }
}
