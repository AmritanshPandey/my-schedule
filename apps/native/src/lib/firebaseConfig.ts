/**
 * Firebase Web SDK config — the same project the web app points at
 * (lib/firebase.ts's NEXT_PUBLIC_FIREBASE_* env vars), copied in as plain
 * constants because bare React Native has no NEXT_PUBLIC_*-style env
 * pipeline of its own. These values are not secrets: they identify the
 * Firebase project, not authorize access to it — access control lives in
 * firestore.rules (server-side) and Firebase Auth, exactly as it already
 * does for the web build whose bundle embeds the same six values.
 *
 * Fill these in from the Firebase Console → Project settings → General →
 * "Your apps" → the Web app (the same one lib/firebase.ts uses — Cloud
 * Functions/Firestore/Auth are all per-PROJECT, not per-platform-app, so
 * there's no separate "native" config to create).
 */
export const firebaseConfig = {
  apiKey: "AIzaSyA9ADsGC8KW9KT0xtuy_6HKsKyISdF4CCU",
  authDomain: "planr-75429.firebaseapp.com",
  projectId: "planr-75429",
  storageBucket: "planr-75429.firebasestorage.app",
  messagingSenderId: "704686654641",
  appId: "1:704686654641:web:4f8ae76b38bd564ef24e90",
};

/**
 * The OAuth "Web client ID" from Firebase Console → Authentication →
 * Sign-in method → Google → Web SDK configuration. Required by
 * @react-native-google-signin even on native: Firebase verifies the ID
 * token's audience against this, not a platform-specific client id.
 */
export const googleSignInWebClientId = "REPLACE_WITH_GOOGLE_WEB_CLIENT_ID";

/**
 * The iOS app's OWN OAuth client ID — a second, separate id from the web one
 * above. This is what the native Google Sign-In SDK itself needs to run the
 * iOS sign-in flow; the web client id alone only covers Firebase's later
 * token-verification step. It only exists once an iOS app is registered for
 * this Firebase project (Firebase Console → Project settings → General →
 * "Your apps" → Add app → iOS, bundle id org.reactjs.native.example.PlanRNative)
 * — that registration generates a GoogleService-Info.plist containing it
 * (the CLIENT_ID key), which is the standard place to get this value from.
 * Without it, @react-native-google-signin's `configure()` throws at runtime
 * ("failed to determine clientID") — so it's guarded below rather than
 * called unconditionally.
 */
export const googleSignInIosClientId = "REPLACE_WITH_GOOGLE_IOS_CLIENT_ID";

/** True once the placeholders above have actually been filled in. Mirrors
 *  lib/firebase.ts's isFirebaseConfigured — the same graceful-degrade-to-
 *  guest-mode behavior, just gated on "not still a placeholder" instead of
 *  "env var present". */
export const isFirebaseConfigured =
  !firebaseConfig.apiKey.startsWith("REPLACE_WITH_") &&
  !firebaseConfig.projectId.startsWith("REPLACE_WITH_");

/** Firebase Auth itself (email/session persistence, Firestore sync) doesn't
 *  need this — only the Google Sign-In button does. Kept separate from
 *  isFirebaseConfigured so the rest of auth/sync isn't held hostage by one
 *  provider's extra setup step. */
export const isGoogleSignInConfigured =
  !googleSignInWebClientId.startsWith("REPLACE_WITH_") &&
  !googleSignInIosClientId.startsWith("REPLACE_WITH_");
