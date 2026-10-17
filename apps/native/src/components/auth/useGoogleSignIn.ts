import { useCallback, useState } from 'react';
import { statusCodes } from '@react-native-google-signin/google-signin';
import { useAuth } from '../../contexts/AuthProvider';
import { authErrorMessage, isUserDismissal } from '@planr/core/lib/authErrors';
import { logError } from '../../lib/errorLog';

/**
 * Native port of components/auth/useGoogleSignIn.ts — the whole "Continue
 * with Google" interaction: busy state, swallow-vs-surface, logging. The
 * native SDK reports a dismissed sheet / a sign-in already in flight with its
 * own status codes; those are treated as the user's decision, like the web's
 * popup-closed codes.
 */
function isNativeDismissal(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  return code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS;
}

export function useGoogleSignIn() {
  const { login, isAuthAvailable, isGoogleSignInReady } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setError(null);
    try {
      await login();
    } catch (err) {
      if (isUserDismissal(err) || isNativeDismissal(err)) return;
      setError(err instanceof Error && !('code' in err) ? err.message : authErrorMessage(err));
      logError('auth:login', err);
    } finally {
      setSigningIn(false);
    }
  }, [login]);

  return { signingIn, error, isAuthAvailable, isGoogleSignInReady, signIn, clearError };
}
