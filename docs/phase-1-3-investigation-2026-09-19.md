# Phase 1〜3 既存実装調査報告

調査日: 2026-09-19  
対象: `/Users/tanakayuuki/Desktop/juku-point`  
Git: `main` / `ae0c598 Add school-specific score submission calendar`  
調査方針: 読取専用。アプリ本体・Firestoreデータ・Rulesは変更していない。

## 調査範囲と確認方法

- Next.js画面、API、共通ライブラリ、Firestore Rules、テスト、Git履歴を確認した。
- `next build` は成功した。
- 既存テスト73件中72件成功。1件は提出予定カレンダー追加後にテスト用モックが追随していない失敗で、現時点では本番障害の証拠ではない。
- 本番Firestoreのドキュメント値は変更していない。本報告のDB構造はコード、Rules、テスト、Git履歴から確認した。実装着手前に本番データを匿名化した読取専用監査を追加する。

## 1. 現在の実装状況

### 学期・カレンダー

- `adminTermSettings/{year}` が年度別学期期間の共通設定になっている。
- `adminLessonCalendars/{year}` が年度別授業日の保存先になっている。
- `academicCalendar.mjs`、`academicCalendarServer.js`、`useAcademicContext.js` が共通年度・学期解決を提供している。
- 2027年以降の年度ドキュメントを画面から追加でき、固定の2026年一覧に限定されていない。
- 一方、旧 `src/app/utils/season.js` には2026年日付が残る。ランキングでは現在未使用、チェックインの未使用旧処理から参照されている。

### 学習記録・出欠・設定

- `/admin/lesson-records` に学習記録と出欠確認を集約済み。
- 小中高を一覧に含み、校種別に入力欄を切り替える実装がある。
- `/admin/settings` は授業・年度、入試日、教材・定型文、保護者向け情報、アカウントをタブ化済み。
- 旧 `/admin/lesson-attendance` は統合先案内を表示するが、同じ管理コンポーネントも再表示しており完全なリダイレクトではない。

### 主なFirestoreデータ

| 目的 | 現在形式 | 旧形式・派生形式 |
|---|---|---|
| 生徒 | `users/{uid}`、小学生は `adminStudents/{id}` | 生徒キーは `user_{uid}` / `elementary_{id}` |
| 中学生学習記録 | `users/{uid}/lessonTerms/{YYYY_T}/records/{date}` | 出欠が `adminLessonAttendance` にも存在し得る |
| 共通出欠・振替 | `adminLessonAttendance/{studentKey}/records/{date}` | 高校生は `users/{uid}/classAttendance/{date}` |
| 保護者公開授業 | `lessonPublic/{studentKey}/records/{date}` | 元記録から作る公開用投影 |
| 宿題 | `homeworkAssignments/{studentKey}/items/{id}` | `homeworkPublic` は公開用投影 |
| 学期集計 | `users/{uid}/behaviorSummary/{YYYY_T}` | `{YYYY_T}学期` も互換読取 |
| 交換履歴 | `users/{uid}/rewardHistory/{id}` | `users/{uid}.rewardHistory[]` |
| 自習 | `users/{uid}/checkins/{YYYY-MM-DD}` | 数値時刻とTimestampが混在可能 |
| 保護者 | `parentAccounts/{uid}`、`parentLinks/{uid}/children/{studentKey}` | `accountInvites/{id}` が登録前情報 |
| 年度・学期 | `adminTermSettings/{year}` | 一部旧クライアント計算が残る |
| 授業日 | `adminLessonCalendars/{year}` | なし |

## 2. 各不具合の原因

### 交換履歴

原因は旧配列形式と新サブコレクション形式の併存である。管理者画面は両方を併読するが、生徒画面の最初の読取はサブコレクションを `date` で並べるため、`date` がない旧サブコレクション文書は結果から除外される。「日時がない旧履歴も確認」を押した場合だけ別APIで取得する。また最初の新形式クエリが失敗すると旧配列だけへフォールバックせず、画面全体がエラーになる。

### 自習中の確認

管理画面だけが全 `users` を取得し、生徒ごとに `checkins` を `currentSessionActive == true` で直接検索するN+1読取になっている。1生徒分の読取失敗でも `Promise.all` 相当の処理全体が失敗する。さらに判定が `currentSessionActive === true` の1フィールドだけなので、不完全な旧文書や途中保存された文書を `lastEnterAt` / `exitAt` から復元できない。チェックイン保存は現在サーバーAPI化されているが、管理者の現在一覧は共通API化されていない。

### 振替管理

同じ出欠が最大3系統に存在することが根本原因である。中学生は `lessonTerms` と `adminLessonAttendance`、高校生は `classAttendance` と `adminLessonAttendance` が併存する。現在は優先順位付きマージ、取消マーカー、振替元・振替先の相互更新が追加済みで、関連テストは成功している。ただし、旧記録の片側だけに欠席・振替情報がある場合、年度設定がない日付、または過去の異なる値が残る場合に照合結果が変わり得る。画面側とAPI側の正本を明示する必要がある。

### サイドバー遷移エラー

現在のサイドバーは `router.push` を使用し、全リンク先はビルドに成功しているため、以前の単純なリンク切れは現行コードでは確認できない。残る不安定要因は、学習記録ページが未保存警告のためにドキュメント全体のクリックをキャプチャし、`stopImmediatePropagation()` する独自処理である。入力状態と遷移イベントが競合すると、遷移が止まったように見える可能性がある。共通の遷移ガードへ置き換えるべきである。

### 志望校判定の単語テスト平均

選択学期に記録がある場合は `総正答数 / 総問題数 × 100` を表示しているが、表示名が「平均点」で単位もない。選択学期に完了記録がない場合は、生徒プロフィールの累計 `totalWordTestScore / wordTestCount` へフォールバックするため、別学期のデータが混ざる。学期別表示として不正確である。選択学期の記録だけから正答率を計算し、「平均正答率（%）」等に名称を統一する必要がある。

### 講師画面で前回宿題選択時に縮小

宿題選択肢に、確認日、全教材名、全範囲を1行で連結している。モバイルのネイティブ `select` とグリッドの最小幅計算が長い選択肢に引っ張られる構造だった。現行CSSには `min-width: 0; width: 100%` の緩和が追加済みだが、端末依存をなくすには選択肢を短い識別情報だけにし、詳細は選択後のカードへ表示する仕様変更が必要である。

### 保護者招待URL

登録・紐付け処理自体は実装済みで、1回限り、7日、有効期限、秘密値のハッシュ保存、ロール衝突確認がある。ただしURL生成が `new URL(request.url).origin` 依存で、リバースプロキシ環境の内部Originが `0.0.0.0:8080` なら、そのまま外部アクセス不能URLを返す。公開ベースURLを環境設定で固定し、許可ホスト検証を加える必要がある。

### 保護者登録フロー

`/invite/{id}` で招待確認、Firebase Auth登録、`parentAccounts` 作成、`parentLinks` 作成、招待消費、サインアウト、保護者ログイン画面への移動までコード上はつながっている。実際の公開URLを使った本番E2Eは未確認である。またAuthユーザー作成後にFirestore確定が失敗すると、権限を持たない孤立Authアカウントが残る可能性があるため、再試行案内と管理者側の状態表示が必要である。

### 講師アカウント作成

現行は保護者と同じ招待URL方式で、仕様と不一致である。安全な自己登録には、誰でも講師権限を得られないよう「本人がAuth登録→承認待ち記録→管理者承認→`teachers/{uid}.active=true`」の流れが必要である。

### ログイン画面の「管理者」表示

生徒用ログインの見出し、説明、他ロールから戻るリンクに「生徒・管理者」が残っている。認証後のロール判定は維持し、表示だけ「生徒ログイン」へ変更できる。

## 3. 仕様と現在実装との差分

- Phase 1は互換処理が部分実装済みだが、交換履歴の自動併読、自習一覧API、招待URL、講師自己登録、学期別単語平均が未完了。
- Phase 2の共通学期基盤と将来年度カレンダーは概ね実装済み。旧 `season.js` と未使用の旧チェックイン処理が残る。
- 学習記録の年度・学期選択はあるが、日付から自動解決した値との整合チェックが強く、編集時に「登録時と同じ全項目を自由に修正する」操作はまだ整理されていない。
- Phase 3の画面統合と設定タブは概ね実装済み。旧出欠URLが同じ画面を重複表示し、正本データが統一されていない。
- フィルタは学習記録、出欠、生徒、成績等に存在するが、年度・学期・状態を共通部品として統一していない。

## 4. 変更が必要なファイル

### Phase 1

- `src/app/rewards/history/page.js`
- `src/app/admin/rewards/RewardHistory.js`
- `src/app/api/rewards/undated-history/route.js`
- `src/lib/historyCompatibility.mjs`
- `src/app/admin/study-log/CurrentStudy.js`
- `src/app/api/admin/study-logs/route.js`
- `src/app/admin/lesson-attendance/LessonAttendanceManager.js`
- `src/app/api/admin/lesson-attendance/route.js`
- `src/components/BehaviorSummary.jsx`
- `src/lib/behaviorSummary.mjs`
- `src/app/teacher/page.js`
- `src/app/teacher/teacher.css` とモバイル補助CSS
- `src/app/api/admin/invites/route.js`
- `src/app/invite/[id]/page.js`
- `src/app/admin/settings/TeacherManager.js`
- `src/components/RoleLogin.js`
- `firestore.rules`
- 対応する `tests/*.test.mjs`

### Phase 2〜3

- `src/app/utils/season.js` と参照元
- `src/lib/academicCalendar.mjs`
- `src/lib/academicCalendarServer.js`
- `src/lib/useAcademicContext.js`
- `src/app/admin/lesson-records/LearningRecordForm.js`
- `src/app/admin/lesson-records/page.js`
- `src/app/admin/lesson-attendance/page.js`
- `src/app/admin/settings/page.js`
- `src/components/AdminNavigation.js`
- 共通フィルタ／遷移ガードの新規部品

## 5. DBマイグレーションの必要性

Phase 1〜3で破壊的マイグレーションは不要である。先に互換読取と書込先統一を行う。

任意の安全なバックフィル候補は以下である。

- 旧 `users.rewardHistory[]` を新 `rewardHistory` に複製する。ただし重複判定キーを先に定義する。
- `date` がない交換履歴へ、信頼できる `createdAt` がある場合だけ `date` を補う。
- 出欠の旧 `classAttendance` / `lessonTerms` を走査し、共通出欠に不足する日だけ補完する。
- 学期集計を元の授業記録から再生成する。

いずれも dry-run、件数比較、差分出力、冪等ID、バックアップを必須とし、自動削除は行わない。

## 6. 既存データへの影響

- 読取互換追加だけなら既存データへの書込影響はない。
- 招待URL修正は新規発行分だけに適用でき、既存招待を壊さない。
- 講師自己登録は既存 `teachers` 文書をそのまま利用し、承認待ちだけ別状態として追加できる。
- 出欠の正本を急に切り替えると、振替済み判定、学期集計、高校生ポイント、保護者公開記録へ影響する。併読期間が必要である。
- 年度・学期は文書IDに含まれるため、日付や所属学期の変更は単純なフィールド更新ではなく、旧文書の取消マーカーと新文書作成を1トランザクションで行う必要がある。

## 7. 実装する具体的な順番

1. 本番DBを匿名化・読取専用で棚卸しし、旧形式ごとの件数と欠損フィールドを記録する。
2. 交換履歴を1つのサーバーAPIから旧・新形式とも自動取得し、重複排除・ページングする。
3. 自習中一覧を管理者APIへ移し、1件の異常で全体が消えないようにする。
4. 出欠ソース別の差分診断を追加し、正本と優先順位を固定してから振替保存・変更・削除を整える。
5. 単語テスト平均を選択学期の元記録から再計算する。
6. 講師の前回宿題選択を短縮し、詳細カードへ分離する。
7. 公開ベースURLを設定し、保護者招待フローを本番URLでE2E確認する。
8. 講師の自己登録＋管理者承認方式を追加し、旧講師招待の新規発行を停止する。
9. ログイン表示を整理する。
10. 旧 `season.js` と未使用チェックイン処理を削除し、共通学期基盤へ一本化する。
11. 学習記録編集で年度・学期・日付を安全に移動できるトランザクションを設計する。
12. 旧出欠ページをリダイレクト化し、設定・学習記録の役割と共通フィルタを整理する。

## 8. 既存機能を再利用できる部分

- `historyCompatibility.mjs` の時刻正規化と1対1重複排除。
- `academicCalendar.mjs` の学期解決と年度横断対応。
- `useAcademicContext.js` と `/api/admin/academic-context`。
- `normalizeAttendanceRecord`、`mergeAttendanceRecord`、取消マーカー方式。
- `staffAccess.js`、`parentAccess.js` のサーバー側権限確認。
- `accountInvites.mjs` の秘密値生成・ハッシュ・ID検証。保護者招待に継続利用する。
- `lessonPublic`、`homeworkPublic` の公開用投影とRules。
- 既存の学期・カレンダー検証テスト、出欠互換テスト、履歴互換テスト。

## 9. 削除・統合候補

- 未使用の `handleCheckLegacy` と、そのためだけの `getCurrentSeason` 参照。
- 固定2026年を持つ旧 `src/app/utils/season.js`。共通学期APIへ統合後に削除する。
- `/admin/lesson-attendance` の重複本体表示。互換URLとしてリダイレクトだけ残す。
- 管理者自習画面の生徒別クライアントN+1読取。管理者APIへ統合する。
- 講師向け招待UIと `teacher` 招待ロール。自己登録承認方式の移行後に停止する。
- 出欠の二重書込は直ちに削除せず、正本決定・互換検証後に段階的に縮小する。

## 10. 実装上のリスク

- 旧記録に日付・状態・Timestamp型のばらつきがあり、誤った重複排除で履歴を隠す危険がある。
- 振替元と振替先を別々に修正するとリンクが片側だけ残る危険がある。
- 年度・学期変更は文書パス変更を伴い、ポイント履歴・集計・公開投影も同期が必要である。
- 公開用投影へ内部メモを混入させると保護者への情報漏えいになる。
- 講師自己登録を即時有効にすると第三者が講師権限を取得できるため、管理者承認が必須である。
- 招待URLのベースURLをリクエストヘッダーだけで決めるとHostヘッダー汚染の危険がある。
- 全生徒×全履歴をクライアントで読む画面は無料枠と性能の両方に不利で、サーバーページングが必要である。
- 互換期間中の複数表現を合算すると二重計上になる。集計は優先順位付きで1件に正規化してから行う。

## 実装開始前のゲート

- 本番DBの読取専用棚卸し結果を保存する。
- 交換履歴・自習・出欠について旧形式の実例を匿名化してテストfixtureにする。
- 正本、派生集計、公開投影、旧形式の一覧を確定する。
- バックフィルが必要な場合はdry-run結果とロールバック手順を提示する。
- 上記確認後、Phase 1から小さい変更単位で実装する。
