import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { app, firebaseConfig } from "./firebaseApp";

// ✅ 各サービスの初期化
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

export { app, firebaseConfig };
