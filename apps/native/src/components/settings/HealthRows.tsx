import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { IconHeartbeat } from '@tabler/icons-react-native';
import { connectHealth, disconnectHealth, isHealthAvailable, isHealthConnected, onHealthConnectionChange } from '../../lib/health';
import { haptic } from '../../lib/haptics';
import Button from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/**
 * Settings → Apple Health. Read-only: runs you record fill in your planned
 * run sessions. Shows nothing where Health isn't available.
 */
export default function HealthRows() {
  const [available] = useState(isHealthAvailable);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isHealthConnected().then(setConnected);
    return onHealthConnectionChange(setConnected);
  }, []);

  if (!available) return null;

  return (
    <View className="flex-row items-center gap-3 px-4 py-3.5">
      <View className="h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 dark:border-white/[0.06] dark:bg-white/[0.04]">
        <Icon icon={IconHeartbeat} size={14} strokeWidth={2} className="text-neutral-500 dark:text-neutral-300" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-semibold text-neutral-900 dark:text-white">Apple Health</Text>
        <Text className="text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">
          {connected ? 'Runs you record fill in your planned runs.' : 'Fill in planned runs from the runs you record.'}
        </Text>
      </View>
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        onPress={async () => {
          haptic('light');
          setBusy(true);
          if (connected) await disconnectHealth();
          else await connectHealth();
          setBusy(false);
        }}
      >
        {connected ? 'Disconnect' : 'Connect'}
      </Button>
    </View>
  );
}
