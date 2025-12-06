          "use client";

          import "./guide.css";

          export default function GuidePage() {
            return (
              <div className="guide-container">
                <h1 className="guide-title">📘 アプリの使い方</h1>

                {/* ---- ポイント ---- */}
                <section className="guide-section">
                  <h2>💎 ポイントについて</h2>
                  <ul>
                    <li>宿題提出：+50pt</li>
                    <li>単語テスト：正答数に応じて +50〜166pt</li>
                    <li>自習：10分ごとに +2pt（入退室のPIN入力で計測）</li>
                  </ul>
                </section>

                {/* ---- レベル ---- */}
                <section className="guide-section">
                  <h2>📈 レベルについて</h2>
                  <p>獲得ポイント = 経験値として加算されます。</p>
                  <p>レベルアップに必要な経験値：100 + (現レベル - 1) × 10</p>
                </section>

                {/* ---- 自習 ---- */}
                <section className="guide-section">
                  <h2>⏱ 自習（入退室）</h2>
                  <ul>
                    <li>入室 → PIN入力でチェックイン</li>
                    <li>退室 → PIN入力でチェックアウト</li>
                    <li>自習時間に応じてポイント・経験値が自動付与されます</li>
                  </ul>
                </section>

                {/* ---- 宿題 ---- */}
                <section className="guide-section">
                  <h2>📚 宿題提出</h2>
                  <p>先生が提出を確認してポイントと経験値が付与されます。</p>
                  <p>答え合わせ忘れ・未完成の宿題は「未提出扱い」となりポイントは付与されません。</p>
                </section>

                {/* ---- 単語テスト ---- */}
                <section className="guide-section">
                  <h2>✏️ 単語テスト</h2>
                  <p>問題数と正答率に応じて獲得ポイントが増えます。</p>
                  <p>努力した分がしっかり反映される仕組みです。</p>
                  <p>再テストになった場合はポイントはつきません。</p>
                </section>

                {/* ---- 景品 ---- */}
                <section className="guide-section">
                  <h2>🎁 景品交換</h2>
                  <p>ためたポイントで景品を交換できます。</p>
                  <p>限定景品は季節講習の参加者限定で交換可能です。</p>
                </section>

                {/* ---- 不正行為 ---- */}
                <section className="guide-section">
                  <h2>🚨 不正行為について</h2>
                  <p>単語テストのカンニングや宿題の丸写しが発覚したら、所持ポイントを没収します。</p>
                  <p>また、自習室での迷惑行為は出禁となる場合があります。</p>
                  <p>出禁期間中はポイントが一切付与されません。</p>
                </section>

                <button
                  className="guide-back-btn"
                  onClick={() => (window.location.href = "/mypage")}
                >
                  ⬅ マイページへ戻る
                </button>
              </div>
            );
          }
