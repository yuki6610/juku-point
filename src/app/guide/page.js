"use client";

import { useState } from "react";
import "./guide.css";

const guides = [
  {
    icon: "P",
    title: "ポイントについて",
    summary: "ポイントの獲得方法と使い道",
    body: (
      <ul>
        <li>宿題提出：+50pt</li>
        <li>宿題未提出：-50pt</li>
        <li>単語テスト：正答数に応じて+50〜166pt</li>
        <li>自習：10分ごとに+5pt</li>
        <li>成績承認：確認された点数に応じて付与</li>
        <li>高校生の通常授業出席：+100pt（振替授業を除く）</li>
      </ul>
    ),
  },
  {
    icon: "↗",
    title: "レベルについて",
    summary: "経験値とレベルアップの仕組み",
    body: <><p>獲得ポイントは経験値としても加算されます。</p><p>必要経験値は「100＋（現在レベル−1）×10」です。</p></>,
  },
  {
    icon: "◷",
    title: "自習の入退室",
    summary: "PINを使った学習時間の記録",
    body: <ul><li>教室の入室PINで自習を開始します。</li><li>帰る前に退出PINを入力します。</li><li>自習時間に応じてポイントと経験値が加算されます。</li></ul>,
  },
  {
    icon: "✓",
    title: "宿題と単語テスト",
    summary: "提出・採点・再テストの扱い",
    body: <><p>先生の確認後にポイントが反映されます。</p><p>答え合わせ忘れや未完成は未提出扱いになります。単語の再テストにはポイントが付きません。</p></>,
  },
  {
    icon: "◇",
    title: "景品交換",
    summary: "ポイントを景品と交換する方法",
    body: <><p>景品ストアで所持ポイントを使って交換できます。</p><p>限定景品は対象講習の参加者だけに表示されます。交換後は履歴から確認できます。</p></>,
  },
  {
    icon: "◎",
    title: "学年別の機能",
    summary: "中学生と高校生で異なるメニュー",
    body: <><h3>中学生</h3><p>成績・志望校判定、宿題、単語テスト、生活態度を利用できます。</p><h3>高校生</h3><p>大学入試情報、大学検索、志望校の比較・検討を利用できます。</p></>,
  },
  {
    icon: "☺",
    title: "アバター",
    summary: "VRMファイルの作成と設定",
    body: <ol><li>設定画面からVket Avatar Makerを開きます。</li><li>作成したVRMファイルを端末へ保存します。</li><li>設定画面でファイルを選択し、プレビュー後に保存します。</li></ol>,
  },
  {
    icon: "!",
    title: "利用ルール",
    summary: "不正行為と自習室利用について",
    body: <><p>カンニング、宿題の丸写し、位置情報の不正利用は禁止です。</p><p>迷惑行為が続いた場合は、自習室の利用やポイント付与を停止することがあります。</p></>,
  },
];

export default function GuidePage() {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const visibleGuides = guides.filter((guide) =>
    `${guide.title} ${guide.summary}`.toLowerCase().includes(normalized)
  );

  return (
    <main className="guide-shell">
      <div className="guide-container">
        <header className="guide-heading">
          <span>HELP CENTER</span>
          <h1>アプリの使い方</h1>
          <p>知りたい項目を検索するか、一覧から選んでください。</p>
        </header>

        <label className="guide-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例：ポイント、アバター、自習"
          />
        </label>

        <div className="guide-list">
          {visibleGuides.map((guide, index) => (
            <details className="guide-section" key={guide.title} open={!query && index === 0}>
              <summary>
                <span className="guide-icon">{guide.icon}</span>
                <span>
                  <strong>{guide.title}</strong>
                  <small>{guide.summary}</small>
                </span>
                <b>＋</b>
              </summary>
              <div className="guide-content">{guide.body}</div>
            </details>
          ))}
        </div>

        {visibleGuides.length === 0 && (
          <p className="guide-empty">該当する項目がありません。</p>
        )}
      </div>
    </main>
  );
}
