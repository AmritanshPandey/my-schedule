import { Pressable, Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { colors } from '../theme/colors';

/** Native counterpart of IOSScheduleApp.tsx's `EmptyPanel`. */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  title: string;
  description: string;
  /** Optional CTA below the description — mirrors web's EmptyState `action` prop. */
  action?: { label: string; onPress: () => void };
}) {
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  return (
    <View className="rounded-2xl border border-dashed border-neutral-200 bg-white px-5 py-8 dark:border-white/10 dark:bg-neutral-900">
      <View className="mx-auto mb-3 h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
        <Icon size={19} strokeWidth={1.8} color={c.muted} />
      </View>
      <Text className="text-center text-[16px] font-extrabold text-neutral-900 dark:text-white">{title}</Text>
      <Text className="mx-auto mt-1 max-w-[260px] text-center text-[13px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">
        {description}
      </Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          className="mx-auto mt-4 rounded-xl bg-black px-4 py-2.5 active:opacity-80 dark:bg-white"
        >
          <Text className="text-[14px] font-bold text-white dark:text-black">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
