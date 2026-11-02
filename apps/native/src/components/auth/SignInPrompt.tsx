import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { IconCloudUp, IconX } from '@tabler/icons-react-native';
import { useAuth } from '../../contexts/AuthProvider';
import { useGoogleSignIn } from './useGoogleSignIn';
import { AuthErrorNote } from './AuthErrorNote';
import { haptic } from '../../lib/haptics';
import { storage } from '../../storage/mmkv';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import Button from '../ui/Button';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';

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
      <IconButton label="Dismiss" variant="ghost" size="sm" onPress={dismiss} className="absolute right-2 top-2 z-10">
        <Icon icon={IconX} size={16} strokeWidth={2} className={ICON_BUTTON_TONE.ghost} />
      </IconButton>
      <View className="flex-row items-start gap-3 pr-6">
        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12">
          <Icon icon={IconCloudUp} size={18} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">Back up your plan</Text>
          <Text className="mt-0.5 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
            Sign in to sync across devices and never lose your progress.
          </Text>
          <Button
            size="sm"
            loading={signingIn}
            onPress={() => {
              haptic('light');
              void signIn();
            }}
            className="mt-2.5 self-start"
          >
            {signingIn ? 'Signing in…' : 'Continue with Google'}
          </Button>
          <AuthErrorNote message={error} className="text-[11px]" />
        </View>
      </View>
    </View>
  );
}
