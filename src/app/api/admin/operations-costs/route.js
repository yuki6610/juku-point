import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebaseAdmin';
import { requireAdmin } from '@/lib/staffAccess';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const validMonth = value => /^20\d{2}-(0[1-9]|1[0-2])$/.test(value || '');
const amount = value => { const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 100000000) throw new Error('金額・単価は0以上の数値で入力してください。'); return number; };
const currentMonth = () => { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}`; };
const previousMonth = month => { const [year, part] = month.split('-').map(Number); return `${part === 1 ? year - 1 : year}-${String(part === 1 ? 12 : part - 1).padStart(2, '0')}`; };

export async function GET(request) {
  try {
    await requireAdmin(request);
    const month = new URL(request.url).searchParams.get('month') || currentMonth();
    if (!validMonth(month)) throw new Error('対象月を確認してください。');
    const previous = previousMonth(month);
    const [currentUsage, priorUsage, currentCost, priorCost] = await Promise.all([
      adminDb.collection('aiUsage').where('month', '==', month).get(),
      adminDb.collection('aiUsage').where('month', '==', previous).get(),
      adminDb.collection('operationsCosts').doc(month).get(),
      adminDb.collection('operationsCosts').doc(previous).get(),
    ]);
    const summarize = snapshot => { const rows = snapshot.docs.map(doc => doc.data()); return { requests: rows.length, inputTokens: rows.reduce((sum, row) => sum + Number(row.inputTokens || 0), 0), outputTokens: rows.reduce((sum, row) => sum + Number(row.outputTokens || 0), 0), totalTokens: rows.reduce((sum, row) => sum + Number(row.totalTokens || 0), 0), byModel: Object.entries(rows.reduce((map, row) => { const model = row.model || 'unknown'; const value = map[model] || { requests: 0, inputTokens: 0, outputTokens: 0 }; value.requests++; value.inputTokens += Number(row.inputTokens || 0); value.outputTokens += Number(row.outputTokens || 0); map[model] = value; return map; }, {})).map(([model, value]) => ({ model, ...value })) }; };
    return Response.json({ month, previousMonth: previous, current: { usage: summarize(currentUsage), costs: currentCost.data() || {} }, previous: { usage: summarize(priorUsage), costs: priorCost.data() || {} } });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request), body = await request.json();
    if (!validMonth(body.month)) throw new Error('対象月を確認してください。');
    const values = { openAiActualUsd: amount(body.openAiActualUsd), googleCloudActualJpy: amount(body.googleCloudActualJpy), usdJpy: amount(body.usdJpy), inputPerMillionUsd: amount(body.inputPerMillionUsd), outputPerMillionUsd: amount(body.outputPerMillionUsd) };
    await adminDb.collection('operationsCosts').doc(body.month).set({ ...values, source: 'manual', updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return Response.json({ saved: true });
  } catch (error) { return Response.json({ error: error.message }, { status: error.status || 400 }); }
}
