import {
  applicationDefault,
  getApp,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      credential: applicationDefault(),
      projectId:
        process.env.GCLOUD_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        "juku-point",
    });

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
