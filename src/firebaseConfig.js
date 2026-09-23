import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { app, firebaseConfig } from "./firebaseApp";

// ✅ 各サービスの初期化
export const db = getFirestore(app);
export const auth = getAuth(app);
export const authReady = typeof window === "undefined"
  ? Promise.resolve()
  : setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn("ログイン状態の永続化を設定できませんでした。", error);
    });
export const storage = getStorage(app);

export { app, firebaseConfig };
