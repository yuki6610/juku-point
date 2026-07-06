import { getApp, getApps, initializeApp } from "firebase/app";

export const firebaseConfig = {
  apiKey: "AIzaSyDKbQmTRal7wNooG21bCR09faktue6gMQ8",
  authDomain: "juku-point.firebaseapp.com",
  projectId: "juku-point",
  storageBucket: "juku-point.firebasestorage.app",
  messagingSenderId: "296241905027",
  appId: "1:296241905027:web:195a93c3d1c11941f7cab6",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
