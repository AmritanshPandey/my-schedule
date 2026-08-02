"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/contexts/AuthProvider";
import { authErrorMessage, isUserDismissal } from "@/lib/authErrors";
import { logError } from "@/lib/errorLog";

/**
 * Owns the whole "Continue with Google" interaction: busy state, the
 * swallow-vs-surface decision, and diagnostic logging.
 *
 * Three components render this button (LoginButton, SettingsSheet,
 * SettingsView) and each had its own empty `catch`. Centralizing here is what
 * keeps them from silently drifting apart again. Note that only SettingsView
 * is currently reachable: LoginButton is never imported, and SettingsSheet is
 * mounted with `open` hard-wired false because DesktopSidebar always receives
 * `onOpenSettingsTab`. Both are kept in sync anyway so they aren't broken if
 * they're wired back up.
 *
 * Covers sign-in only — components keep their own `busy` state for sign-out.
 * The guest and signed-in branches are mutually exclusive, so the two never
 * overlap.
 */
export function useGoogleSignIn() {
  const { login, isAuthAvailable } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setError(null);
    try {
      await login();
    } catch (err) {
      if (isUserDismissal(err)) {
        // Closing the popup is a decision, not a failure — stay quiet.
        return;
      }
      setError(authErrorMessage(err));
      // Routes into ErrorReporter, the ring buffer, the diagnostics snapshot
      // and opt-in telemetry. No auth code logged here before.
      logError("auth:login", err);
    } finally {
      setSigningIn(false);
    }
  }, [login]);

  return { signingIn, error, isAuthAvailable, signIn, clearError };
}
