import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";
import fs from "fs";

// ------------------------------
// Firebase 初期化（※内容はあなたの配置に合わせる）
// ------------------------------
import { firebaseConfig } from "./firebaseConfig.js";
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ------------------------------
// JSON 読み込み
// ------------------------------
const titles = JSON.parse(fs.readFileSync("./titles.json", "utf8"));

async function upload() {
  console.log(`アップロード開始：${titles.length} 件`);

  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];

    try {
      await addDoc(collection(db, "titles"), {
        ...title,
        createdAt: serverTimestamp(),
      });
      console.log(`✓ 追加: ${title.name}`);
    } catch (err) {
      console.error(`✗ 失敗: ${title.name}`, err);
    }
  }

  console.log("🎉 すべての称号データをアップロードしました！");
}

upload();
