"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions, isFirebaseConfigured } from "@/lib/firebase";
import { AuthUnavailableError } from "@/lib/authErrors";
import {
  initSync,
  destroySync,
  flushNow,
  getLastSchedule,
} from "@/lib/cloudSync";
import { bootLog } from "@/lib/iosSafeMode";
import { initErrorTelemetry } from "@/lib/errorTelemetry";

// ── Context types ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  /** True while the SDK is restoring the previous session. */
  authLoading: boolean;
  isGuest: boolean;
  /**
   * False when Firebase was never configured, so signing in is impossible in
   * this build. Distinct from `isGuest`, which only means "no user yet" — the
   * UI needs to tell "you can sign in" from "you can't" to avoid a dead click.
   */
  isAuthAvailable: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Permanently delete the signed-in account: its cloud data and the login.
   * `wipeLocal` runs after the server delete succeeds and before sign-out, so
   * the caller can erase this device's copy while it is still addressable.
   * Throws (and keeps syncing) when the delete fails.
   */
  deleteAccount: (wipeLocal: () => Promise<void>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authLoading: true,
  isGuest: true,
  isAuthAvailable: false,
  login: async () => {},
  logout: async () => {},
  deleteAccount: async () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Stable GoogleAuthProvider instance — never recreated.
  const provider = useRef(new GoogleAuthProvider());

  useEffect(() => {
    if (!auth) {
      // Firebase not configured (missing env vars) — run as guest.
      setAuthLoading(false);
      // Terminate the boot log the same way the configured path does, so the
      // diagnostics snapshot isn't left stuck mid-boot in guest-only builds.
      bootLog("AUTH_READY");
      return;
    }

    // ONE auth observer for the entire app lifetime.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Authenticated: start sync engine. useScheduleDB pulls cloud after
        // its local, per-user IndexedDB record and merge listener are ready.
        initSync(firebaseUser.uid);
        initErrorTelemetry(firebaseUser.uid); // no-op unless the user opted in
      } else {
        // Signed out or guest: stop sync.
        destroySync();
        initErrorTelemetry(null);
      }

      // Keep the existing User reference when only the token refreshed (same
      // uid). onAuthStateChanged re-fires on token refresh and app resume with
      // a brand-new User object; swapping it would change the context value and
      // cascade a full-tree re-render (a visible "flash" during background
      // processing) even though nothing the UI reads has changed.
      setUser((prev) =>
        prev && firebaseUser && prev.uid === firebaseUser.uid ? prev : firebaseUser,
      );
      setAuthLoading(false);
      bootLog("AUTH_READY");
    });

    return unsubscribe; // cleans up on unmount (app tear-down)
  }, []);

  const login = useCallback(async () => {
    // Throw rather than resolve: a silent success here is indistinguishable
    // from actually signing in, which is exactly how this failed invisibly.
    if (!auth) throw new AuthUnavailableError();
    await signInWithPopup(auth, provider.current);
    // onAuthStateChanged fires automatically after login.
  }, []);

  const logout = useCallback(async () => {
    if (!auth) return;
    // Best-effort flush before signing out.
    try {
      const schedule = getLastSchedule();
      if (schedule) await flushNow(schedule);
    } catch {
      // non-fatal
    }
    await signOut(auth);
    // onAuthStateChanged fires automatically → destroySync() called there.
  }, []);

  const deleteAccount = useCallback(async (wipeLocal: () => Promise<void>) => {
    const current = auth?.currentUser;
    if (!auth || !current || !functions) throw new AuthUnavailableError();
    // Stop syncing first: a debounced push that lands after the server-side
    // delete would recreate the account's data under a uid nobody owns.
    destroySync();
    try {
      await httpsCallable(functions, "deleteAccount")({});
    } catch (err) {
      initSync(current.uid);
      throw err;
    }
    await wipeLocal();
    // The Auth user is gone server-side; this just drops the cached session.
    await signOut(auth).catch(() => {});
  }, []);

  // Memoized so consumers only re-render when user/authLoading actually change,
  // not on every AuthProvider render (login/logout are stable useCallbacks).
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authLoading,
      isGuest: !user,
      isAuthAvailable: isFirebaseConfigured,
      login,
      logout,
      deleteAccount,
    }),
    [user, authLoading, login, logout, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
