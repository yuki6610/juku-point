'use client';
import { useEffect, useState } from 'react';
import { auth } from '@/firebaseConfig';
import './operations-costs.css';

// OpenAI Standard pricing per 1M text tokens (short context), checked 2026-09-25.
const MODEL_RATES = {
  'gpt-6-luna': { input: 0.10, output: 0.50 },
  'gpt-5.6-luna': { input: 0.20, output: 1.20 },
};
const CURRENT_RATE = MODEL_RATES['gpt-6-luna'];
const initialMonth = () => {
  const values = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${values.find(item => item.type === 'year').value}-${values.find(item => item.type === 'month').value}`;
};
const fields = [
  ['openAiActualUsd', 'OpenAI実請求額（USD）'],
  ['googleCloudActualJpy', 'Firebase / Google Cloud実請求額（円）'],
  ['usdJpy', '換算レート（1 USD＝円）'],
  ['inputPerMillionUsd', 'その他モデルの入力100万トークン単価（USD）'],
  ['outputPerMillionUsd', 'その他モデルの出力100万トークン単価（USD）'],
];
const usd = value => {
  const amount = Number(value || 0);
  return `$${amount !== 0 && Math.abs(amount) < 0.01 ? amount.toFixed(4) : amount.toFixed(2)}`;
};
const yen = value => `¥${Math.round(Number(value || 0)).toLocaleString('ja-JP')}`;
const estimateModel = (usage, rate) => (Number(usage?.inputTokens || 0) * rate.input + Number(usage?.outputTokens || 0) * rate.output) / 1000000;
const estimate = (usage, costs) => {
  const fallbackRate = {
    input: Number(costs?.inputPerMillionUsd ?? CURRENT_RATE.input),
    output: Number(costs?.outputPerMillionUsd ?? CURRENT_RATE.output),
  };
  return (usage?.byModel || []).reduce((sum, item) => sum + estimateModel(item, MODEL_RATES[item.model] || fallbackRate), 0);
};

export default function OperationsCosts() {
  const [month, setMonth] = useState(initialMonth), [data, setData] = useState(null), [form, setForm] = useState({}), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const api = async (path, options = {}) => {
    const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser?.getIdToken()}` } });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    return value;
  };
  const load = (preserveNotice = false) => {
    setData(null);
    if (!preserveNotice) setNotice('');
    return api(`/api/admin/operations-costs?month=${month}`)
      .then(value => {
        setData(value);
        setForm(Object.fromEntries(fields.map(([key]) => [key, value.current.costs[key] ?? (key === 'inputPerMillionUsd' ? CURRENT_RATE.input : key === 'outputPerMillionUsd' ? CURRENT_RATE.output : 0)])));
      })
      .catch(error => setNotice(error.message));
  };
  useEffect(() => { load(); }, [month]);
  const save = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/admin/operations-costs', { method: 'POST', body: JSON.stringify({ month, ...form }) });
      setNotice('実請求額とその他モデル用の単価を保存しました。');
      await load(true);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };
  const current = data?.current || {}, previous = data?.previous || {}, currentUsage = current.usage || {}, previousUsage = previous.usage || {};
  const estimatedUsd = estimate(currentUsage, form), priorEstimateUsd = estimate(previousUsage, previous.costs || {});
  const actualJpy = Number(form.openAiActualUsd || 0) * Number(form.usdJpy || 0) + Number(form.googleCloudActualJpy || 0);
  const previousActualJpy = Number(previous.costs?.openAiActualUsd || 0) * Number(previous.costs?.usdJpy || 0) + Number(previous.costs?.googleCloudActualJpy || 0);
  const now = new Date(), currentParts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const currentDay = Number(currentParts.find(item => item.type === 'day')?.value || 1), daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const isCurrent = month === initialMonth(), projectedUsd = isCurrent ? estimatedUsd * daysInMonth / currentDay : estimatedUsd;
  const fallbackRate = { input: Number(form.inputPerMillionUsd ?? CURRENT_RATE.input), output: Number(form.outputPerMillionUsd ?? CURRENT_RATE.output) };
  return <main className="operations-costs">
    <header><small>アプリの利用状況</small><h1>アプリ運用費</h1><p>AI利用量はアプリ内の授業報告生成から自動記録します。OpenAIとGoogle Cloudの実請求額は管理者が入力します。外部請求APIとは未接続です。</p></header>
    <label className="cost-month">対象月<input type="month" value={month} onChange={event => setMonth(event.target.value)}/></label>
    {notice && <p role="status" className="cost-notice">{notice}</p>}
    {!data && !notice && <p role="status">対象月の利用状況を読み込んでいます…</p>}
    {data && <>
      <div className="cost-cards">
        <article><span>AI利用回数</span><strong>{Number(currentUsage.requests || 0).toLocaleString()}回</strong><small>前月 {Number(previousUsage.requests || 0).toLocaleString()}回</small></article>
        <article><span>トークン数</span><strong>{Number(currentUsage.totalTokens || 0).toLocaleString()}</strong><small>入力 {Number(currentUsage.inputTokens || 0).toLocaleString()}／出力 {Number(currentUsage.outputTokens || 0).toLocaleString()}</small></article>
        <article><span>OpenAI推定額</span><strong>{usd(estimatedUsd)}</strong><small>月末予測 {usd(projectedUsd)}／前月 {usd(priorEstimateUsd)}{Number(form.usdJpy) > 0 ? `／約${yen(estimatedUsd * Number(form.usdJpy))}` : ''}</small></article>
        <article><span>実請求額合計（円換算）</span><strong>{yen(actualJpy)}</strong><small>前月 {yen(previousActualJpy)}</small></article>
      </div>
      <section><h2>実請求額・推定単価</h2><form className="cost-form" onSubmit={save}>{fields.map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step="any" value={form[key] ?? ''} onChange={event => setForm(old => ({ ...old, [key]: event.target.value }))}/></label>)}<button disabled={busy}>{busy ? '保存中…' : '実請求額と単価を保存'}</button></form><p className="cost-note">GPT-6 Lunaは入力 $0.10・出力 $0.50、過去のGPT-5.6 Lunaは入力 $0.20・出力 $1.20（各100万トークン）でモデル別に概算します。「その他モデル」の単価はモデル名が未登録の利用分にのみ適用します。キャッシュ割引などは加味しない目安です。<a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer">OpenAI公式料金</a></p></section>
      <section><h2>推定と実績の比較</h2><div className="cost-comparison"><p><span>OpenAI推定</span><strong>{usd(estimatedUsd)}</strong></p><p><span>OpenAI実請求</span><strong>{usd(form.openAiActualUsd)}</strong></p><p><span>差額（実請求－推定）</span><strong>{usd(Number(form.openAiActualUsd || 0) - estimatedUsd)}</strong></p><p><span>Firebase / Google Cloud実請求</span><strong>{yen(form.googleCloudActualJpy)}</strong></p></div></section>
      <section><h2>モデル別の利用</h2>{currentUsage.byModel?.length ? <div className="cost-comparison">{currentUsage.byModel.map(item => <p key={item.model}><span>{item.model}<small> {item.requests}回／入力 {item.inputTokens.toLocaleString()}・出力 {item.outputTokens.toLocaleString()}</small></span><strong>{usd(estimateModel(item, MODEL_RATES[item.model] || fallbackRate))}</strong></p>)}</div> : <p>この月の記録はありません。</p>}</section>
    </>}
  </main>;
}
