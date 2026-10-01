/**
 * Firebase init for native — same project, same `firebase` package as
 * lib/firebase.ts, so Firestore reads/writes here land on the exact
 * `users/{uid}/data/snapshot` document the web app and the Cloudflare
 * reminders Worker already read and write. The one platform difference is
 * Auth persistence: the web SDK defaults to browser storage, which doesn't
 * exist here, so it's pointed at AsyncStorage explicitly via
 * getReactNativePersistence (the SDK's own React Native entry point,
 * resolved automatically by Metro's "react-native" package export condition
 * — see @firebase/auth/dist/index.rn.d.ts).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, type Auth } from "firebase/auth";
import { initializeFirestore, getFirestore, type Firestore } from "firebase/firestore";
import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig";

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

if (isFirebaseConfigured) {
  const isNew = getApps().length === 0;
  _app = isNew ? initializeApp(firebaseConfig) : getApp();
  _auth = isNew
    ? initializeAuth(_app, { persistence: getReactNativePersistence(AsyncStorage) })
    : getAuthOrFallback(_app);
  _db = isNew
    ? initializeFirestore(_app, { ignoreUndefinedProperties: true })
    : getFirestore(_app);
}

// initializeAuth throws if called twice on the same app (fast refresh during
// dev can re-run this module) — fall back to whatever instance already
// exists rather than crashing the app over a hot-reload artifact.
function getAuthOrFallback(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("firebase/auth").getAuth(app);
  }
}

export { isFirebaseConfigured };
export const auth: Auth | null = _auth;
export const db: Firestore | null = _db;
export default _app;
