import {
  initializeApp,
  getApps,
  getApp,
  type FirebaseApp,
} from "firebase/app";

import {
  getAuth,
  type Auth,
} from "firebase/auth";

import {
  getFirestore,
  type Firestore,
} from "firebase/firestore";

import {
  getAnalytics,
  isSupported,
  type Analytics,
} from "firebase/analytics";

const config = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY,

  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,

  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,

  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,

  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,

  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID,

  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const isClient =
  typeof window !== "undefined";

const app: FirebaseApp = isClient
  ? getApps().length > 0
    ? getApp()
    : initializeApp(config)
  : (null as unknown as FirebaseApp);

export const auth: Auth = isClient
  ? getAuth(app)
  : (null as unknown as Auth);

export const db: Firestore = isClient
  ? getFirestore(app)
  : (null as unknown as Firestore);

export async function initializeAnalytics():
  Promise<Analytics | null> {

  if (!isClient) return null;

  const supported =
    await isSupported();

  if (!supported) return null;

  return getAnalytics(app);
}

export default app;
