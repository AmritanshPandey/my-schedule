import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconCloudUp, IconX } from '@tabler/icons-react-native';
import { useAuth } from '../../contexts/AuthProvider';
import { useGoogleSignIn } from './useGoogleSignIn';
import { useAppleSignIn } from './useAppleSignIn';
import { AppleSignInButton } from './AppleSignInButton';
import { GoogleSignInButton } from './GoogleSignInButton';
import { AuthErrorNote } from './AuthErrorNote';
import { haptic } from '../../lib/haptics';
import { storage } from '../../storage/mmkv';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const DISMISS_KEY = 'planr-signin-prompt-dismissed';

/**
 * Native port of components/auth/SignInPrompt.tsx — the dismissible "sign in
 * to back up" card for guests. Offers Sign in with Apple where the device
 * supports it, and Google when its native client ids are set; hidden when
 * neither can work, since the buttons could only fail there.
 */
export default function SignInPrompt({ className = '' }: { className?: string }) {
  const { isGuest, authLoading } = useAuth();
  const { signingIn, error, isAuthAvailable, isGoogleSignInReady, signIn } = useGoogleSignIn();
  const apple = useAppleSignIn();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return storage.getString(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    haptic('light');
    setDismissed(true);
    try {
      storage.set(DISMISS_KEY, '1');
    } catch {
      /* the in-memory dismissal still holds */
    }
  }, []);

  if (authLoading || !isGuest || !isAuthAvailable || dismissed) return null;
  if (!isGoogleSignInReady && !apple.isAppleSignInAvailable) return null;

  return (
    <View className={`relative overflow-hidden rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-white/[0.03] ${className}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={dismiss}
        className="absolute right-2 top-2 z-10 h-7 w-7 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.06]"
      >
        <Icon icon={IconX} size={15} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
      </Pressable>
      <View className="flex-row items-start gap-3 pr-6">
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12">
          <Icon icon={IconCloudUp} size={18} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">Back up your plan</Text>
          <Text className="mt-0.5 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
            Sign in to sync across devices and never lose your progress.
          </Text>
          {apple.isAppleSignInAvailable && (
            <View className={`mt-2.5 ${apple.signingIn ? 'opacity-60' : ''}`} pointerEvents={apple.signingIn ? 'none' : 'auto'}>
              <AppleSignInButton onPress={() => void apple.signIn()} />
            </View>
          )}
          {isGoogleSignInReady && (
            <View className="mt-2.5">
              <GoogleSignInButton onPress={() => void signIn()} signingIn={signingIn} />
            </View>
          )}
          <AuthErrorNote message={error ?? apple.error} className="text-[11px]" />
        </View>
      </View>
    </View>
  );
}
