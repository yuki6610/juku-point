# ローカルデモ

本番Firebaseとは別の `demo-juku-point` プロジェクトを、ローカルの Auth・Firestore・Storage エミュレーターだけで動かします。実在の生徒情報は投入しません。

Node.js 20以上、Java 21、Firebase CLI が必要です。Java が標準の場所にない場合は、最初のコマンドに `JAVA_HOME` と Java の `bin` を含む `PATH` を指定します。リポジトリのルートで、別々の端末を使用します。

この端末では Java 21 を `/Users/tanakayuuki/Documents/Codex/2026-09-23/db/work/jdk-21.0.12.1+1/Contents/Home` に置いています。Firebase CLI の起動時はこのパスを `JAVA_HOME` に、同ディレクトリの `bin` を `PATH` の先頭に指定してください。Node.js は `/Users/tanakayuuki/.nvm/versions/node/v22.20.0/bin` を `PATH` に指定して動作確認しました。

```sh
firebase emulators:start --project demo-juku-point --config firebase.demo.json --only auth,firestore,storage
```

```sh
JUKU_DEMO_MODE=1 GCLOUD_PROJECT=demo-juku-point FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/demo-seed.mjs
```

```sh
JUKU_DEMO_MODE=1 NEXT_PUBLIC_DEMO_MODE=1 GCLOUD_PROJECT=demo-juku-point FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 npm run dev -- --port 3001
```

`http://localhost:3001` で開きます。管理者は `admin@demo.example.test`、講師は `teacher@demo.example.test`、保護者は `parent@demo.example.test`、生徒は `student@demo.example.test` です。共通パスワードは `DemoOnly!2026`。デモ環境だけで有効です。

エミュレーターのデータは終了時に消えます。再起動後はシードを再実行してください。同じエミュレーターを稼働したままシードを再実行しても、作成済みの生徒・講習日程・シフトは上書きしません。デモモードのサーバーはエミュレーター接続設定が揃わない場合、起動時に停止します。
