import {
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const adminApp = getApps().length
  ? getApp()
  // App Hosting が実行環境へ注入する FIREBASE_CONFIG とサービス
  // アカウントを利用する。ローカルの認証ファイルを要求しない。
  : initializeApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
