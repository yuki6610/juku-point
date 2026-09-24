import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { app, firebaseConfig } from "./firebaseApp";

// ✅ 各サービスの初期化
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
if (process.env.NEXT_PUBLIC_DEMO_MODE === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}
export const authReady = typeof window === "undefined"
  ? Promise.resolve()
  : setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.warn("ログイン状態の永続化を設定できませんでした。", error);
    });
export { app, firebaseConfig };
