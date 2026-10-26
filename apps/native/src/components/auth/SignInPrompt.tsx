import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconCloudUp, IconX } from '@tabler/icons-react-native';
import { useAuth } from '../../contexts/AuthProvider';
import { useGoogleSignIn } from './useGoogleSignIn';
import { AuthErrorNote } from './AuthErrorNote';
import { haptic } from '../../lib/haptics';
import { storage } from '../../storage/mmkv';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const DISMISS_KEY = 'planr-signin-prompt-dismissed';

/**
 * Native port of components/auth/SignInPrompt.tsx — the dismissible "sign in
 * to back up" card for guests. Also hidden while Google Sign-In's native
 * client ids are unset, since the button could only fail there.
 */
export default function SignInPrompt({ className = '' }: { className?: string }) {
  const { isGuest, authLoading } = useAuth();
  const { signingIn, error, isAuthAvailable, isGoogleSignInReady, signIn } = useGoogleSignIn();
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

  if (authLoading || !isGuest || !isAuthAvailable || !isGoogleSignInReady || dismissed) return null;

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
          <Pressable
            accessibilityRole="button"
            disabled={signingIn}
            onPress={() => {
              haptic('light');
              void signIn();
            }}
            className={`mt-2.5 h-9 flex-row items-center gap-2 self-start rounded-full bg-neutral-950 px-4 active:bg-neutral-800 dark:bg-white dark:active:bg-neutral-200 ${
              signingIn ? 'opacity-60' : ''
            }`}
          >
            <Text className="text-[13px] font-bold text-white dark:text-neutral-950">{signingIn ? 'Signing in…' : 'Continue with Google'}</Text>
          </Pressable>
          <AuthErrorNote message={error} className="text-[11px]" />
        </View>
      </View>
    </View>
  );
}
