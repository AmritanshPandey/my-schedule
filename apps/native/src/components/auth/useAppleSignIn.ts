import { useCallback, useState } from 'react';
import { useAuth } from '../../contexts/AuthProvider';
import { authErrorMessage } from '@planr/core/lib/authErrors';
import { logError } from '../../lib/errorLog';

/**
 * The "Sign in with Apple" interaction, shaped like useGoogleSignIn: busy
 * state and a surfaced error. A cancelled Apple sheet already resolves
 * quietly in AuthProvider.loginWithApple, so anything thrown here is real.
 */
export function useAppleSignIn() {
  const { loginWithApple, isAppleSignInAvailable } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setError(null);
    try {
      await loginWithApple();
    } catch (err) {
      setError(err instanceof Error && !('code' in err) ? err.message : authErrorMessage(err));
      logError('auth:apple', err);
    } finally {
      setSigningIn(false);
    }
  }, [loginWithApple]);

  return { signingIn, error, isAppleSignInAvailable, signIn };
}
