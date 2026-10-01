import { Pressable, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import {
  IconCalendarEvent,
  IconChartLine,
  IconClipboardData,
  IconLayoutDashboard,
  IconRepeat,
} from '@tabler/icons-react-native';
import { colors } from '../theme/colors';

/**
 * Native counterpart of components/ios/IOSBottomNav.tsx's floating pill —
 * minus the center FAB (create actions moved elsewhere) and its side-split
 * layout, so all 5 tabs space evenly across the full pill. True
 * backdrop-blur isn't available without a native blur library, so this uses
 * a solid translucent surface instead (the one deliberate visual departure
 * from the web version).
 */
const TABS: { route: string; label: string; icon: typeof IconLayoutDashboard }[] = [
  { route: 'Overview', label: 'Overview', icon: IconLayoutDashboard },
  { route: 'Today', label: 'Today', icon: IconCalendarEvent },
  { route: 'Plans', label: 'Plans', icon: IconClipboardData },
  { route: 'Routine', label: 'Routine', icon: IconRepeat },
  { route: 'Tracking', label: 'Track', icon: IconChartLine },
];

function TabButton({
  tab,
  active,
  onPress,
  tintColor,
  mutedColor,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  onPress: () => void;
  tintColor: string;
  mutedColor: string;
}) {
  const Icon = tab.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
      className={`h-14 min-w-[44px] max-w-[64px] flex-1 items-center justify-center gap-0.5 rounded-full ${
        active ? 'bg-black/[0.05] dark:bg-white/[0.10]' : ''
      }`}
    >
      <Icon size={20} strokeWidth={2} color={active ? tintColor : mutedColor} />
      <Text
        className={`text-[10.5px] font-medium leading-none ${
          active ? 'text-black dark:text-white' : 'text-neutral-500 dark:text-neutral-400'
        }`}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

export default function BottomNav({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  const activeRouteName = state.routes[state.index].name;

  function changeTab(route: string) {
    navigation.navigate(route);
  }

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center px-4"
      style={{ bottom: Math.max(20, insets.bottom + 8) }}
    >
      <View
        className="h-[68px] w-full max-w-md flex-row items-center justify-evenly rounded-full border border-black/[0.08] bg-white/95 px-2 dark:border-white/[0.09] dark:bg-neutral-900/95"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: colorScheme === 'dark' ? 0.4 : 0.12,
          shadowRadius: 24,
          elevation: 8,
        }}
      >
        {TABS.map((tab) => (
          <TabButton
            key={tab.route}
            tab={tab}
            active={activeRouteName === tab.route}
            onPress={() => changeTab(tab.route)}
            tintColor={c.text}
            mutedColor={c.muted}
          />
        ))}
      </View>
    </View>
  );
}
