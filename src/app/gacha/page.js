"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import "./gacha.css";
import "./gacha-sound.css";

const labels = { meal: "食事代券", snack: "お菓子", regular: "アイス・通常景品" };
const icons = { meal: "🎟", snack: "🍬", regular: "🍨" };
const dateLabel = (value) => value ? new Date(value).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function GachaPage() {
  const router = useRouter();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState(null);
  const [showCount, setShowCount] = useState(10);
  const [skip, setSkip] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const request = async (url, options) => {
    const user = auth.currentUser;
    if (!user) throw new Error("ログインしてください。");
    const token = await user.getIdToken();
    const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(options?.headers || {}) } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "通信に失敗しました。");
    return body;
  };

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) return router.replace("/login");
    try { setState(await request("/api/gacha")); }
    catch (e) { setError(e.message); }
  }), [router]);

  const playTone = (frequency, start, duration, volume = 0.08, type = "sine") => {
    if (!soundEnabled) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = window.__gachaAudioContext || new AudioContext();
    window.__gachaAudioContext = context;
    if (context.state === "suspended") context.resume().catch(() => {});
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + start);
    gain.gain.setValueAtTime(0.0001, context.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + start);
    oscillator.stop(context.currentTime + start + duration + 0.02);
  };

  const playDrawSound = () => {
    [0, .14, .28, .42, .56, .7].forEach((start, index) => playTone(150 + index * 24, start, .09, .045, "square"));
  };

  const playWinSound = () => {
    [523, 659, 784, 1047].forEach((frequency, index) => playTone(frequency, index * .11, .34, .075));
  };

  const draw = async () => {
    if (drawing || !state || state.points < state.cost) return;
    setDrawing(true); setError(""); setResult(null);
    playDrawSound();
    try {
      const body = await request("/api/gacha", { method: "POST", body: "{}" });
      const refreshedPromise = request("/api/gacha").catch(() => null);
      if (!skip) await new Promise((resolve) => window.setTimeout(resolve, 2100));
      setResult(body);
      playWinSound();
      const refreshed = await refreshedPromise;
      if (refreshed) setState(refreshed);
      else setState((current) => ({
        ...current, points: body.points,
        history: [{ id: body.drawId, rewardName: body.reward.name, rewardImage: body.reward.image, rewardKind: body.reward.kind, mealPoint: body.mealPoint, pointsUsed: current.cost, status: "pending", createdAt: body.createdAt }, ...(current.history || [])],
        pendingCount: Number(current.pendingCount || 0) + 1,
      }));
    } catch (e) { setError(e.message); }
    finally { setDrawing(false); }
  };

  if (!state && !error) return <main className="gacha-state">ガチャを準備しています…</main>;
  if (error && !state) return <main className="gacha-state"><p>{error}</p><button onClick={() => router.push("/mypage")}>マイページへ戻る</button></main>;
  if (!state?.eligible) return <main className="gacha-state"><p>このガチャは中3の講習参加者限定です。</p><button onClick={() => router.push("/mypage")}>マイページへ戻る</button></main>;

  return (
    <main className="gacha-page">
      <header className="gacha-header">
        <button onClick={() => router.push("/mypage")} aria-label="戻る">←</button>
        <div><span>GACHA</span><h1>ガチャ</h1></div>
        <div className="gacha-balance"><small>所持ポイント</small><strong>{state.points.toLocaleString()}<i>pt</i></strong></div>
      </header>

      <section className={`gacha-stage ${drawing ? "is-drawing" : ""}`}>
        <div className="gacha-badge">{state.adminPreview ? "管理者確認モード" : "中3・講習参加者限定"}</div>
        <div className="gacha-machine" aria-hidden="true">
          <div className="machine-glow" />
          <div className="machine-window"><span>🎟</span><span>🍬</span><span>🍨</span></div>
          <div className="machine-body"><div className="machine-knob">●</div><div className="machine-slot" /></div>
          <div className="gacha-capsule">★</div>
        </div>
        <h2>必ず景品が当たる！</h2>
        <p>食事代券・お菓子・アイスが入っています</p>
        {error && <div className="gacha-error" role="alert">{error}</div>}
        <button className="draw-button" disabled={drawing || state.points < state.cost || !state.rewards.length} onClick={draw}>
          {drawing ? "抽選中…" : `${state.cost}ptで1回引く`}
        </button>
        {state.points < state.cost && <p className="point-shortage">あと{(state.cost - state.points).toLocaleString()}pt必要です</p>}
        <div className="gacha-options">
          <label className="skip-option"><input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />演出を短くする</label>
          <label className="skip-option"><input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />音を出す</label>
        </div>
      </section>

      <section className="gacha-card rates-card">
        <div className="section-title"><div><span>PRIZE LINEUP</span><h2>景品と提供割合</h2></div><strong>合計100%</strong></div>
        <div className="rate-group">
          {state.rewards.map((reward) => (
            <div className="rate-row" key={reward.id}>
              <div>{reward.image ? <img src={reward.image} alt="" loading="lazy" /> : <span className="rate-icon">{icons[reward.kind]}</span>}<span className="rate-copy"><strong>{reward.name}</strong><small>{labels[reward.kind]}</small></span></div>
              <b>{Number(reward.probability).toFixed(2)}%</b>
            </div>
          ))}
        </div>
        {!state.rewards.length && <p className="empty-gacha">現在提供できる景品がありません。</p>}
        <p className="rate-note">在庫切れの景品は提供を終了し、表示中の景品で割合を再計算します。</p>
      </section>

      <section className="gacha-card history-card">
        <div className="section-title"><div><span>YOUR RESULTS</span><h2>当選履歴</h2></div>{state.pendingCount > 0 && <strong>{state.pendingCount}件 受取待ち</strong>}</div>
        {(state.history || []).slice(0, showCount).map((item) => (
          <article className="gacha-history-row" key={item.id}>
            <span className="history-icon">{icons[item.rewardKind] || "🎁"}</span>
            <div><strong>{item.rewardName}</strong><small>{dateLabel(item.createdAt)}・{Number(item.pointsUsed || 500)}pt</small></div>
            <b className={`status-${item.status}`}>{item.status === "delivered" ? "受取済み" : item.status === "canceled" ? "取消" : "受取待ち"}</b>
          </article>
        ))}
        {!state.history?.length && <p className="empty-gacha">まだ抽選履歴はありません。</p>}
        {showCount < state.history?.length && <button className="more-button" onClick={() => setShowCount((value) => value + 10)}>さらに表示</button>}
      </section>

      {result && <div className="result-overlay" role="dialog" aria-modal="true"><div className={`result-modal result-${result.reward.kind}`}>
        <div className="result-rays" /><span className="result-kicker">YOU GOT IT!</span>
        {result.reward.image ? <img src={result.reward.image} alt="" /> : <div className="result-icon">{icons[result.reward.kind]}</div>}
        <h2>{result.reward.name}</h2><p>が当たりました！</p>
        {result.mealPoint > 0 && <div className="meal-added">夏期イベントの食事代に<br /><strong>{result.mealPoint}pt</strong> 加算しました</div>}
        <div className="result-actions"><button onClick={() => setResult(null)}>閉じる</button><button className="again" disabled={state.points < state.cost} onClick={() => { setResult(null); window.setTimeout(draw, 50); }}>もう1回引く</button></div>
      </div></div>}
    </main>
  );
}
