import { getApp, getApps, initializeApp } from "firebase/app";

const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export const firebaseConfig = demo ? {
  apiKey: "demo-juku-point-key",
  authDomain: "demo-juku-point.firebaseapp.com",
  projectId: "demo-juku-point",
  storageBucket: "demo-juku-point.appspot.com",
  appId: "demo-juku-point-app",
} : {
  apiKey: "AIzaSyDKbQmTRal7wNooG21bCR09faktue6gMQ8",
  authDomain: "juku-point.firebaseapp.com",
  projectId: "juku-point",
  storageBucket: "juku-point.firebasestorage.app",
  messagingSenderId: "296241905027",
  appId: "1:296241905027:web:195a93c3d1c11941f7cab6",
};

if (demo && getApps().some(app => app.options.projectId !== firebaseConfig.projectId)) {
  throw new Error("本番Firebaseアプリとの混在を拒否しました。");
}
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
