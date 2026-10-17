import { View } from 'react-native';
import { IconAlertTriangle } from '@tabler/icons-react-native';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/** Native port of components/auth/AuthErrorNote.tsx — the line beneath "Continue with Google". */
export function AuthErrorNote({
  message,
  unavailable = false,
  className = 'text-[12px]',
}: {
  message: string | null;
  unavailable?: boolean;
  className?: string;
}) {
  if (unavailable) {
    return <Text className={`mt-2 leading-snug text-neutral-500 dark:text-neutral-400 ${className}`}>Sync is unavailable in this build.</Text>;
  }
  if (!message) return null;
  return (
    <View accessibilityRole="alert" className="mt-2 flex-row items-start gap-1.5">
      <Icon icon={IconAlertTriangle} size={12} strokeWidth={2} className="mt-px shrink-0 text-rose-600 dark:text-rose-400" />
      <Text className={`flex-1 leading-snug text-rose-600 dark:text-rose-400 ${className}`}>{message}</Text>
    </View>
  );
}
