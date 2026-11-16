import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import {
  IconCalendarEvent,
  IconCalendarEventFilled,
  IconClipboardData,
  IconClipboardDataFilled,
  IconLayoutDashboard,
  IconLayoutDashboardFilled,
} from '@tabler/icons-react-native';
import { haptic } from '../../lib/haptics';
import { Glass, isLiquidGlassSupported } from '../ui/Glass';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

interface IOSBottomNavProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
}

/** Visual left-to-right order — independent of the tab ids themselves, which
 *  don't run 0..4 (Overview is tab 4, Tracking is tab 8). */
// The three daily destinations; Routine, Tracking, Notes and Settings open
// from the header menu (IOSMenu). The active tab takes the filled icon.
const TABS = [
  { tab: 4, label: 'Overview', icon: IconLayoutDashboard, activeIcon: IconLayoutDashboardFilled },
  { tab: 0, label: 'Today', icon: IconCalendarEvent, activeIcon: IconCalendarEventFilled },
  { tab: 1, label: 'Plans', icon: IconClipboardData, activeIcon: IconClipboardDataFilled },
] as const;

/** Horizontal inset of the track inside the capsule (web: px-1.5). */
const INSET = 6;

/**
 * Native port of components/ios/IOSBottomNav.tsx — five equal destinations on
 * a floating capsule. The bar only navigates: creating lives where the thing
 * is made (Today's header adds a task, Plans' header adds a plan, Routine has
 * its own "Add routine", Notes composes).
 *
 * The active tab is one pill that glides between the five equal columns
 * rather than a highlight that snaps off one button and onto another. The
 * capsule is the system's liquid glass on iOS 26+ (see ui/Glass), the same
 * material as iOS's own tab bar; older systems get a solid translucent one.
 */
export default function IOSBottomNav({ activeTab, onTabChange }: IOSBottomNavProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const activeIndex = TABS.findIndex((t) => t.tab === activeTab);
  const pillX = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const columnWidth = trackWidth / TABS.length;

  useEffect(() => {
    if (activeIndex === -1 || columnWidth === 0) return;
    const to = activeIndex * columnWidth;
    // The first placement (and every move under reduce-motion) jumps; only a
    // real tab change glides.
    if (!placed.current || reduceMotion) {
      pillX.setValue(to);
      placed.current = true;
      return;
    }
    Animated.timing(pillX, {
      toValue: to,
      duration: 300,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, columnWidth, reduceMotion, pillX]);

  const bottom = Math.max(16, insets.bottom + 4);

  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 z-40 items-center px-4" style={{ bottom }}>
      <Glass
        accessibilityRole="tablist"
        accessibilityLabel="Main navigation"
        className="h-[64px] w-full max-w-[320px] flex-row items-center rounded-full"
        style={[
          { paddingHorizontal: INSET },
          // The glass casts its own soft shadow; the fallback needs the lift.
          !isLiquidGlassSupported && {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: colorScheme === 'dark' ? 0.4 : 0.12,
            shadowRadius: 24,
            elevation: 8,
          },
        ]}
      >
        <View className="h-full flex-1 flex-row items-center" onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}>
          {/* The pill rides behind the buttons; decoration only, so hidden
              from assistive tech and never intercepting a tap. */}
          {activeIndex !== -1 && columnWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              importantForAccessibility="no-hide-descendants"
              accessibilityElementsHidden
              className="absolute bottom-[5px] top-[5px] left-0 rounded-full bg-black/[0.06] dark:bg-white/[0.13]"
              style={{ width: columnWidth, transform: [{ translateX: pillX }] }}
            />
          )}
          {TABS.map(({ tab, label, icon, activeIcon }) => {
            const active = activeTab === tab;
            return (
              <Pressable
                key={tab}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                // Re-tapping the active tab still fires: it pops back to the
                // tab's root (e.g. from a plan to the plan list).
                onPress={() => {
                  haptic('light');
                  onTabChange(tab);
                }}
                className="h-[54px] min-w-0 flex-1 items-center justify-center gap-1 rounded-full active:scale-[0.96]"
              >
                <Icon
                  icon={active ? activeIcon : icon}
                  size={23}
                  strokeWidth={1.9}
                  className={active ? 'text-neutral-950 dark:text-white' : 'text-neutral-700 dark:text-neutral-300'}
                />
                <Text
                  numberOfLines={1}
                  className={`text-[11.5px] leading-none ${
                    active ? 'font-semibold text-neutral-950 dark:text-white' : 'font-medium text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}
