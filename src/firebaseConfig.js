import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ✅ あなたのFirebase設定スニペット
const firebaseConfig = {
  apiKey: "AIzaSyDKbQmTRal7wNooG21bCR09faktue6gMQ8",
  authDomain: "juku-point.firebaseapp.com",
  projectId: "juku-point",
  storageBucket: "juku-point.appspot.com",
  messagingSenderId: "296241905027",
  appId: "1:296241905027:web:195a93c3d1c11941f7cab6",
};

// ✅ すでに初期化済みなら再利用（Next.jsでの重複初期化を防止）
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ 各サービスの初期化
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export { app, firebaseConfig };

