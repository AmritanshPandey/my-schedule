/**
 * Native port of contexts/AuthProvider.tsx. Same responsibilities — own the
 * Firebase Auth session, start/stop the cloud sync engine as it changes —
 * with Google Sign-In driven through the native SDK
 * (@react-native-google-signin/google-signin) instead of a browser popup,
 * since `signInWithPopup` has no meaning without a window. The native flow
 * gets a Google ID token first, then hands it to Firebase the same way the
 * web flow ultimately does: a GoogleAuthProvider credential.
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
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  type User,
} from 'firebase/auth';
import {
  GoogleSignin,
  isSuccessResponse,
  isCancelledResponse,
} from '@react-native-google-signin/google-signin';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import { googleSignInWebClientId, googleSignInIosClientId, isGoogleSignInConfigured } from '../lib/firebaseConfig';
import { AuthUnavailableError } from '@planr/core/lib/authErrors';
import { initSync, destroySync, flushNow, getLastSchedule } from '../lib/cloudSync';

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
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authLoading: true,
  isGuest: true,
  isAuthAvailable: false,
  isGoogleSignInReady: false,
  login: async () => {},
  logout: async () => {},
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
        initSync(firebaseUser.uid);
      } else {
        destroySync();
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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authLoading,
      isGuest: !user,
      isAuthAvailable: isFirebaseConfigured,
      isGoogleSignInReady: isGoogleSignInConfigured,
      login,
      logout,
    }),
    [user, authLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
