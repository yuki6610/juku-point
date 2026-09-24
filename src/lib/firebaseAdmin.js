import {
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const demo = process.env.JUKU_DEMO_MODE === '1' || process.env.NEXT_PUBLIC_DEMO_MODE === '1';
if (demo && (
  process.env.JUKU_DEMO_MODE !== '1' ||
  process.env.NEXT_PUBLIC_DEMO_MODE !== '1' ||
  process.env.GCLOUD_PROJECT !== 'demo-juku-point' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST !== '127.0.0.1:9199'
)) throw new Error('デモ用Firebaseエミュレーターの接続設定が不完全です。');
if (demo && getApps().some(app => app.options.projectId !== 'demo-juku-point')) {
  throw new Error('本番Firebaseアプリとの混在を拒否しました。');
}

const adminApp = getApps().length
  ? getApp()
  // App Hosting が実行環境へ注入する FIREBASE_CONFIG とサービス
  // アカウントを利用する。ローカルの認証ファイルを要求しない。
  : initializeApp(demo ? { projectId: 'demo-juku-point', storageBucket: 'demo-juku-point.appspot.com' } : undefined);

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminStorage = getStorage(adminApp);
