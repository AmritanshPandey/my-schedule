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
  initializeFirestore,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

import {
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

const config = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
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
let _db: Firestore | null = null;
if (isClient && isConfigured) {
  const isNew = getApps().length === 0;
  _app = isNew ? initializeApp(config) : getApp();
  _db = isNew
    ? initializeFirestore(_app, { ignoreUndefinedProperties: true })
    : getFirestore(_app);
}

export const auth: Auth | null = _app ? getAuth(_app) : null;
export const db: Firestore | null = _db;
export const storage: FirebaseStorage | null = _app ? getStorage(_app) : null;

export default _app;
