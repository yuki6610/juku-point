"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../../firebaseConfig";
import "../gacha/gacha-admin.css";
import "../gacha/gacha-inventory.css";
import { availableStudentGrades } from "@/lib/studentFilterOptions.mjs";

const statusLabel = {
  pending: "未引き渡し",
  delivered: "引き渡し済み",
  canceled: "取消済み",
};
const kindLabel = {
  meal: "食事代券",
  snack: "お菓子",
  regular: "アイス・通常景品",
};
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function AdminGachaPage() {
  const [data, setData] = useState({ draws: [], summary: {}, inventory: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    status: "pending",
    grade: "",
    kind: "",
    program: "",
    date: "",
  });

  const api = async (options, after = null) => {
    const user = auth.currentUser;
    if (!user) throw new Error("ログインしてください。");
    const token = await user.getIdToken();
    const response = await fetch(
      "/api/admin/gacha" + (after ? "?after=" + encodeURIComponent(after) : ""),
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "通信に失敗しました。");
    return body;
  };
  const more = async () => {
    if (loading || !data.next) return;
    setLoading(true);
    try {
      const page = await api(undefined, data.next);
      setData((old) => {
        const draws = [
            ...new Map(
              [...old.draws, ...page.draws].map((item) => [item.id, item]),
            ).values(),
          ],
          active = draws.filter((item) => item.status !== "canceled");
        return {
          ...old,
          draws,
          next: page.next,
          summary: {
            ...old.summary,
            delivered: active.filter((item) => item.status === "delivered")
              .length,
            pointsUsed: active.reduce(
              (sum, item) => sum + Number(item.pointsUsed || 0),
              0,
            ),
            mealCount: active.filter((item) => item.rewardKind === "meal")
              .length,
            mealPoints: active.reduce(
              (sum, item) => sum + Number(item.mealPoint || 0),
              0,
            ),
          },
        };
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  const load = async () => {
    setError("");
    try {
      setData(await api());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(
    () =>
      onAuthStateChanged(auth, (user) =>
        user ? load() : (window.location.href = "/login"),
      ),
    [],
  );

  const filtered = useMemo(
    () =>
      data.draws.filter((item) => {
        return (
          (!filters.status || item.status === filters.status) &&
          (!filters.grade || String(item.grade) === filters.grade) &&
          (!filters.kind || item.rewardKind === filters.kind) &&
          (!filters.program || item.programId === filters.program) &&
          (!filters.date || item.createdAt?.slice(0, 10) === filters.date)
        );
      }),
    [data.draws, filters],
  );
  const programs = useMemo(
    () =>
      [
        ...new Map(
          data.draws.map((item) => [
            item.programId,
            { id: item.programId, name: item.programName || "講習" },
          ]),
        ).values(),
      ].filter((item) => item.id),
    [data.draws],
  );
  const availableGrades = useMemo(
    () => availableStudentGrades(data.draws),
    [data.draws],
  );

  const update = async (draw, action) => {
    if (busy) return;
    let reason = "";
    let note = "";
    if (action === "deliver") {
      if (
        !window.confirm(
          `${draw.userName}さんへ「${draw.rewardName}」を引き渡しますか？`,
        )
      )
        return;
      note = window.prompt("管理者メモ（任意）", draw.adminNote || "") ?? "";
    }
    if (
      action === "reopen" &&
      !window.confirm("この記録を未引き渡しに戻しますか？")
    )
      return;
    if (action === "cancel") {
      reason = window.prompt("抽選を取り消す理由を入力してください。") || "";
      if (!reason.trim()) return;
      if (
        !window.confirm("500pt・在庫・食事代加算を戻して抽選を取り消しますか？")
      )
        return;
    }
    setBusy(draw.id);
    setError("");
    try {
      await api({
        method: "PATCH",
        body: JSON.stringify({ drawId: draw.id, action, reason, note }),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <main className="gacha-admin-page">
      {data.next && (
        <button disabled={loading} onClick={more}>
          以前の抽選結果を表示
        </button>
      )}
      <p>{data.summaryScope}</p>
      <header className="gacha-admin-heading">
        <div>
          <span>GACHA OPERATIONS</span>
          <h1>ガチャ管理</h1>
          <p>抽選結果と景品の引き渡しを確認します。</p>
        </div>
        <button onClick={load}>再読み込み</button>
      </header>
      {error && <div className="gacha-admin-error">{error}</div>}
      <section className="gacha-summary">
        <article>
          <span>本日の抽選</span>
          <strong>
            {data.summary.today || 0}
            <small>回</small>
          </strong>
        </article>
        <article className="pending">
          <span>未引き渡し</span>
          <strong>
            {data.summary.pending || 0}
            <small>件</small>
          </strong>
        </article>
        <article>
          <span>引き渡し済み</span>
          <strong>
            {data.summary.delivered || 0}
            <small>件</small>
          </strong>
        </article>
        <article>
          <span>使用ポイント</span>
          <strong>
            {Number(data.summary.pointsUsed || 0).toLocaleString()}
            <small>pt</small>
          </strong>
        </article>
        <article>
          <span>食事代券</span>
          <strong>
            {data.summary.mealCount || 0}
            <small>
              件 / {Number(data.summary.mealPoints || 0).toLocaleString()}pt
            </small>
          </strong>
        </article>
      </section>
      <section className="gacha-admin-panel">
        <div className="gacha-filters">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="pending">未引き渡し</option>
            <option value="delivered">引き渡し済み</option>
            <option value="canceled">取消済み</option>
            <option value="">すべて</option>
          </select>
          <select
            value={filters.grade}
            onChange={(e) => setFilters({ ...filters, grade: e.target.value })}
          >
            <option value="">全学年</option>
            {availableGrades.map((grade) => (
              <option key={grade} value={grade}>
                {grade >= 7 && grade <= 9 ? `中${grade - 6}` : grade}
              </option>
            ))}
          </select>
          <select
            value={filters.kind}
            onChange={(e) => setFilters({ ...filters, kind: e.target.value })}
          >
            <option value="">全景品</option>
            <option value="meal">食事代券</option>
            <option value="snack">お菓子</option>
            <option value="regular">アイス・通常景品</option>
          </select>
          <select
            value={filters.program}
            onChange={(e) =>
              setFilters({ ...filters, program: e.target.value })
            }
          >
            <option value="">全講習</option>
            {programs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filters.date}
            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
          />
        </div>
        <div className="gacha-result-count">{filtered.length}件を表示</div>
        {loading ? (
          <p className="gacha-admin-empty">読み込み中…</p>
        ) : filtered.length === 0 ? (
          <p className="gacha-admin-empty">該当する抽選結果はありません。</p>
        ) : (
          <div className="gacha-admin-table-wrap">
            <table className="gacha-admin-table">
              <thead>
                <tr>
                  <th>抽選日時</th>
                  <th>生徒</th>
                  <th>当選景品</th>
                  <th>講習</th>
                  <th>状態・引渡日時</th>
                  <th>対応</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className={`row-${item.status}`}>
                    <td>
                      <strong>{formatDate(item.createdAt)}</strong>
                      <small>当選番号 {item.id.slice(0, 8)}</small>
                    </td>
                    <td>
                      <strong>{item.userName}</strong>
                      <small>
                        {item.grade >= 7 && item.grade <= 9
                          ? `中${item.grade - 6}`
                          : "学年未設定"}
                      </small>
                    </td>
                    <td>
                      <strong>{item.rewardName}</strong>
                      <small>
                        {kindLabel[item.rewardKind]}・{item.pointsUsed}pt
                        {item.mealPoint ? `・食事代 ${item.mealPoint}pt` : ""}
                      </small>
                    </td>
                    <td>{item.programName || "講習"}</td>
                    <td>
                      <b className={`gacha-status ${item.status}`}>
                        {statusLabel[item.status]}
                      </b>
                      <small>
                        {item.status === "delivered"
                          ? `${formatDate(item.deliveredAt)} / ${item.deliveredByName || "管理者"}`
                          : item.status === "canceled"
                            ? item.cancelReason
                            : ""}
                      </small>
                    </td>
                    <td>
                      <div className="gacha-admin-actions">
                        {item.status === "pending" && (
                          <button
                            disabled={busy === item.id}
                            className="deliver"
                            onClick={() => update(item, "deliver")}
                          >
                            引き渡し完了
                          </button>
                        )}
                        {item.status === "delivered" && (
                          <button
                            disabled={busy === item.id}
                            onClick={() => update(item, "reopen")}
                          >
                            未に戻す
                          </button>
                        )}
                        {item.status !== "canceled" && (
                          <button
                            disabled={busy === item.id}
                            className="cancel"
                            onClick={() => update(item, "cancel")}
                          >
                            抽選取消
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="gacha-inventory-panel">
        <div>
          <span>PRIZE INVENTORY</span>
          <h2>現在の対象景品</h2>
        </div>
        <div className="gacha-inventory-grid">
          {data.inventory.map((item) => (
            <article key={item.id}>
              <strong>{item.name}</strong>
              <span>在庫 {item.stock}個</span>
              <b>{Number(item.probability).toFixed(2)}%</b>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
