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
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const isClient = typeof window !== "undefined";

// Only initialize if the required keys are present — missing env vars on
// Vercel/preview deployments should degrade gracefully (guest-only mode).
const isConfigured = !!(
  config.apiKey &&
  config.authDomain &&
  config.projectId &&
  config.appId
);

let _app: FirebaseApp | null = null;
if (isClient && isConfigured) {
  _app = getApps().length > 0 ? getApp() : initializeApp(config);
}

export const auth: Auth | null = _app ? getAuth(_app) : null;
export const db: Firestore | null = _app ? getFirestore(_app) : null;

export async function initializeAnalytics(): Promise<Analytics | null> {
  if (!isClient || !_app) return null;
  const supported = await isSupported();
  if (!supported) return null;
  return getAnalytics(_app);
}

export default _app;
