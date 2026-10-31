/**
 * Native port of contexts/AuthProvider.tsx. Same responsibilities — own the
 * Firebase Auth session, start/stop the cloud sync engine as it changes —
 * with Google Sign-In driven through the native SDK
 * (@react-native-google-signin/google-signin) instead of a browser popup,
 * since `signInWithPopup` has no meaning without a window. The native flow
 * gets a Google ID token first, then hands it to Firebase the same way the
 * web flow ultimately does: a GoogleAuthProvider credential.
 *
 * Sign in with Apple is native-only (App Store guideline 4.8: an app that
 * offers a third-party login must offer Apple's too). Same shape: Apple's
 * identity token plus the raw nonce become an OAuthProvider credential.
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  revokeAccessToken,
  signInWithCredential,
  signOut,
  type User,
} from 'firebase/auth';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import {
  GoogleSignin,
  isSuccessResponse,
  isCancelledResponse,
} from '@react-native-google-signin/google-signin';
import { httpsCallable } from 'firebase/functions';
import { auth, functions, isFirebaseConfigured } from '../lib/firebase';
import { googleSignInWebClientId, googleSignInIosClientId, isGoogleSignInConfigured } from '../lib/firebaseConfig';
import { AuthUnavailableError } from '@planr/core/lib/authErrors';
import { initSync, destroySync, flushNow, getLastSchedule } from '../lib/cloudSync';
import { initErrorTelemetry } from '../lib/errorTelemetry';

interface AuthContextValue {
  user: User | null;
  authLoading: boolean;
  isGuest: boolean;
  isAuthAvailable: boolean;
  /** False when Firebase itself is fine but Google Sign-In's iOS-specific
   *  setup (firebaseConfig.ts's googleSignInIosClientId) is still a
   *  placeholder — login() would otherwise crash into a native error instead
   *  of failing cleanly. */
  isGoogleSignInReady: boolean;
  login: () => Promise<void>;
  /** True on devices that support Sign in with Apple (iOS 13+). */
  isAppleSignInAvailable: boolean;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  /** Same contract as web: delete cloud data and the login, then `wipeLocal`, then sign out. */
  deleteAccount: (wipeLocal: () => Promise<void>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authLoading: true,
  isGuest: true,
  isAuthAvailable: false,
  isGoogleSignInReady: false,
  login: async () => {},
  isAppleSignInAvailable: false,
  loginWithApple: async () => {},
  logout: async () => {},
  deleteAccount: async () => {},
});

if (isGoogleSignInConfigured) {
  // Safe to call at module scope — configure() only stores options locally,
  // it doesn't touch the network. Called once per app lifetime, matching how
  // the web provider's GoogleAuthProvider instance is created once via useRef.
  // Gated on the Google-specific flag (not isFirebaseConfigured) because this
  // needs a second id beyond Firebase's own config — see firebaseConfig.ts's
  // googleSignInIosClientId doc comment. Calling configure() without it
  // doesn't fail quietly; the native module throws a real runtime error the
  // first time it's used, so this is skipped entirely until both ids are in.
  GoogleSignin.configure({ webClientId: googleSignInWebClientId, iosClientId: googleSignInIosClientId });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Authenticated: start sync engine. useScheduleDB pulls the cloud
        // snapshot once its per-account local record and merge listener are up.
        initSync(firebaseUser.uid);
        initErrorTelemetry(firebaseUser.uid); // no-op unless the user opted in
      } else {
        destroySync();
        initErrorTelemetry(null);
      }
      // Same identity-preserving guard as web: onAuthStateChanged re-fires on
      // token refresh with a new User object for the same uid — keep the old
      // reference then so consumers don't re-render for nothing.
      setUser((prev) => (prev && firebaseUser && prev.uid === firebaseUser.uid ? prev : firebaseUser));
      setAuthLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = useCallback(async () => {
    if (!auth) throw new AuthUnavailableError();
    if (!isGoogleSignInConfigured) {
      throw new Error(
        "Google Sign-In isn't set up for this build yet — it needs an iOS OAuth client id (see firebaseConfig.ts).",
      );
    }
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isCancelledResponse(response)) return; // user backed out — not a failure
    if (!isSuccessResponse(response)) return; // defensive: no other response type exists today
    const { idToken } = response.data;
    if (!idToken) throw new Error('Google sign-in did not return an ID token.');
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
    // onAuthStateChanged fires automatically after this.
  }, []);

  const loginWithApple = useCallback(async () => {
    if (!auth) throw new AuthUnavailableError();
    let response;
    try {
      // The library generates a nonce, sends Apple its SHA-256 and returns the
      // raw value, which Firebase needs to check the token was minted for us.
      response = await appleAuth.performRequest({
        requestedOperation: appleAuth.Operation.LOGIN,
        requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
      });
    } catch (err) {
      if ((err as { code?: string }).code === appleAuth.Error.CANCELED) return; // backed out — not a failure
      throw err;
    }
    if (!response.identityToken) throw new Error('Apple sign-in did not return an identity token.');
    const credential = new OAuthProvider('apple.com').credential({
      idToken: response.identityToken,
      rawNonce: response.nonce,
    });
    await signInWithCredential(auth, credential);
    // onAuthStateChanged fires automatically after this.
  }, []);

  const logout = useCallback(async () => {
    if (!auth) return;
    try {
      const schedule = getLastSchedule();
      if (schedule) await flushNow(schedule);
    } catch {
      // non-fatal — best-effort flush before signing out
    }
    await signOut(auth);
    try {
      await GoogleSignin.signOut();
    } catch {
      // non-fatal — Firebase sign-out already succeeded, which is what matters
    }
    // onAuthStateChanged fires automatically → destroySync() called there.
  }, []);

  const deleteAccount = useCallback(async (wipeLocal: () => Promise<void>) => {
    const current = auth?.currentUser;
    if (!auth || !current || !functions) throw new AuthUnavailableError();
    // Apple requires an app to revoke its Sign in with Apple tokens when the
    // account is deleted. That needs a fresh authorization code, so an Apple
    // user confirms once more; cancelling here cancels the whole delete.
    if (current.providerData.some((p) => p.providerId === 'apple.com') && appleAuth.isSupported) {
      const response = await appleAuth.performRequest({ requestedOperation: appleAuth.Operation.LOGIN });
      if (!response.authorizationCode) throw new Error('Apple did not return an authorization code.');
      await revokeAccessToken(auth, response.authorizationCode);
    }
    // Stop syncing first: a push landing after the server-side delete would
    // recreate the account's data under a uid nobody owns.
    destroySync();
    try {
      await httpsCallable(functions, 'deleteAccount')({});
    } catch (err) {
      initSync(current.uid);
      throw err;
    }
    await wipeLocal();
    await signOut(auth).catch(() => {});
    try {
      await GoogleSignin.signOut();
    } catch {
      // non-fatal: not signed in with Google, or already signed out
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authLoading,
      isGuest: !user,
      isAuthAvailable: isFirebaseConfigured,
      isGoogleSignInReady: isGoogleSignInConfigured,
      login,
      isAppleSignInAvailable: isFirebaseConfigured && appleAuth.isSupported,
      loginWithApple,
      logout,
      deleteAccount,
    }),
    [user, authLoading, login, loginWithApple, logout, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
