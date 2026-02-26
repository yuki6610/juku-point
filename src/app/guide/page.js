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
                    <li>自習：10分ごとに +5pt</li>
                    <li>成績承認：入力したテストと内申点の数値が相違なければ点数分のポイント付与</li>
                    <li>高校生：通常授業出席：+100pt（※振替授業は対象外）</li>
                    <p>※高校生は単語テストと宿題がないため、
                        通常授業出席でポイントを付与します。
                      </p>
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
                    
                    {/* ---- 学年別機能 ---- */}
                    <section className="guide-section">
                      <h2>🎓 学年別の機能について</h2>

                      <h3>🏫 中学生</h3>
                      <ul>
                        <li>成績入力（五教科テスト・内申点）</li>
                        <li>入力した成績を使った志望校判定</li>
                        <li>生活態度（宿題・出席・忘れ物）の円グラフ表示</li>
                      </ul>
                      <h3>🎓 高校生</h3>
                      <ul>
                        <li>大学入試情報の閲覧</li>
                        <li>入試方式・日程・必要科目などの確認</li>
                        <li>志望校の比較・検討</li>
                      </ul>
                      <p>※表示される機能は学年によって自動で切り替わります。</p>
                    </section>
                    
                    {/* ---- アバター ---- */}
                    <section className="guide-section">
                      <h2>🧑‍🎨 アバターについて</h2>
                      <p>
                        本アプリでは、自分専用のアバターを設定できます。
                      </p>
                      <ul>
                        <li>
                    設定画面にある外部サイト「Ready Player Me」のリンクからアバターを作成します
                        </li>
                        <li>
                          作成後に表示されるURLをコピー
                        </li>
                        <li>
                          本アプリの設定画面に貼り付けるだけで変更できます
                        </li>
                      </ul>

                      
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

                
              </div>
            );
          }
