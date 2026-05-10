"use client";

import {
  createContext,
  useContext,
  useEffect,
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
import { auth, initializeAnalytics } from "@/lib/firebase";
import {
  initSync,
  destroySync,
  flushNow,
  getLastSchedule,
  mergeCloudIfNewer,
} from "@/lib/cloudSync";
import { getLocalLastUpdated } from "@/lib/localMeta";

// ── Context types ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  /** True while the SDK is restoring the previous session. */
  authLoading: boolean;
  isGuest: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  authLoading: true,
  isGuest: true,
  login: async () => {},
  logout: async () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Stable GoogleAuthProvider instance — never recreated.
  const provider = useRef(new GoogleAuthProvider());

  useEffect(() => {
    // Initialize analytics once on mount — fire-and-forget, non-blocking.
    initializeAnalytics().catch(() => {});

    // ONE auth observer for the entire app lifetime.
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Authenticated: start sync engine, then pull cloud if newer.
        initSync(firebaseUser.uid);
        const localTs = getLocalLastUpdated();
        // Fire-and-forget — UI never blocks on this.
        mergeCloudIfNewer(firebaseUser.uid, localTs).catch(() => {});
      } else {
        // Signed out or guest: stop sync.
        destroySync();
      }

      setUser(firebaseUser);
      setAuthLoading(false);
    });

    return unsubscribe; // cleans up on unmount (app tear-down)
  }, []);

  const login = useCallback(async () => {
    await signInWithPopup(auth, provider.current);
    // onAuthStateChanged fires automatically after login.
  }, []);

  const logout = useCallback(async () => {
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

  return (
    <AuthContext.Provider value={{ user, authLoading, isGuest: !user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
