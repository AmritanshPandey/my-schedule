import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import {
  IconCalendarEvent,
  IconCalendarPlus,
  IconChartLine,
  IconClipboardData,
  IconClipboardPlus,
  IconLayoutDashboard,
  IconNotes,
  IconPlus,
  IconRepeat,
} from '@tabler/icons-react-native';
import { haptic } from '../../lib/haptics';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text } from '../ui/Text';

interface IOSBottomNavProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
  onCreateTask: () => void;
  onCreatePlan: () => void;
  onCreateRitual: () => void;
  onCreateNote: () => void;
}

/**
 * Native port of components/ios/IOSBottomNav.tsx — the floating pill with the
 * centre "+" FAB and its Task / Note / Plan / Habit create menu. Same tab
 * indices as the web shell (4 Overview, 0 Today, 1 Plans, 2 Routine, 8 Track),
 * same split halves around the FAB slot. The web's backdrop blur has no
 * native equivalent without a blur module, so the pill is a solid translucent
 * surface. Tapping anywhere outside the open menu closes it, like the web's
 * outside-touch listener.
 */
export default function IOSBottomNav({ activeTab, onTabChange, onCreateTask, onCreatePlan, onCreateRitual, onCreateNote }: IOSBottomNavProps) {
  const [expanded, setExpanded] = useState(false);
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();

  function changeTab(tab: number) {
    haptic('light');
    setExpanded(false);
    onTabChange(tab);
  }

  function runCreate(fn: () => void) {
    haptic('medium');
    setExpanded(false);
    fn();
  }

  const bottom = Math.max(20, insets.bottom + 8);

  function TabButton({ tab, label, icon, a11y }: { tab: number; label: string; icon: TablerIcon; a11y: string }) {
    const active = activeTab === tab;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={a11y}
        accessibilityState={{ selected: active }}
        onPress={() => changeTab(tab)}
        className={`h-[56px] min-w-[44px] max-w-[64px] flex-1 items-center justify-center gap-[2px] rounded-full ${
          active ? 'bg-black/[0.05] dark:bg-white/[0.10]' : ''
        }`}
      >
        <Icon icon={icon} size={20} strokeWidth={2} className={active ? 'text-neutral-950 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'} />
        <Text
          className={`text-[10.5px] font-medium leading-none ${active ? 'text-neutral-950 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}
        >
          {label}
        </Text>
      </Pressable>
    );
  }

  function CreateButton({ label, a11y, icon, onPress }: { label: string; a11y: string; icon: TablerIcon; onPress: () => void }) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={() => runCreate(onPress)} className="items-center gap-1.5">
        <View className="h-[52px] w-[60px] items-center justify-center rounded-[18px] bg-white/[0.09]">
          <Icon icon={icon} size={24} strokeWidth={2} className="text-white" />
        </View>
        <Text className="text-[11px] font-semibold text-white/75">{label}</Text>
      </Pressable>
    );
  }

  return (
    <>
      {expanded && (
        <Pressable
          accessibilityLabel="Close create menu"
          onPress={() => setExpanded(false)}
          className="absolute inset-0 z-[38] bg-black/[0.03] dark:bg-black/[0.12]"
        />
      )}
      <View pointerEvents="box-none" className="absolute inset-x-0 z-40 items-center px-4" style={{ bottom }}>
        <View pointerEvents="box-none" className="relative w-full max-w-md">
          {expanded && (
            <View pointerEvents="box-none" className="absolute inset-x-0 z-30 items-center" style={{ bottom: 68 + 36 }}>
              <View className="flex-row items-start gap-3 rounded-[24px] border border-white/[0.10] bg-neutral-950 px-5 py-4">
                <CreateButton label="Task" a11y="Add task" icon={IconCalendarPlus} onPress={onCreateTask} />
                <CreateButton label="Note" a11y="Quick note" icon={IconNotes} onPress={onCreateNote} />
                <CreateButton label="Plan" a11y="Add plan" icon={IconClipboardPlus} onPress={onCreatePlan} />
                <CreateButton label="Habit" a11y="Add habit" icon={IconRepeat} onPress={onCreateRitual} />
              </View>
            </View>
          )}

          <View
            accessibilityRole="tablist"
            accessibilityLabel="Main navigation"
            className="relative h-[68px] w-full flex-row items-center rounded-full border border-neutral-200/70 bg-white/95 px-2 dark:border-white/[0.09] dark:bg-neutral-900/95"
            style={{
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: colorScheme === 'dark' ? 0.4 : 0.12,
              shadowRadius: 24,
              elevation: 8,
            }}
          >
            <View className="flex-1 flex-row items-center justify-evenly">
              <TabButton tab={4} label="Overview" a11y="Overview" icon={IconLayoutDashboard} />
              <TabButton tab={0} label="Today" a11y="Today" icon={IconCalendarEvent} />
            </View>
            <View className="w-[52px] shrink-0" />
            <View className="flex-1 flex-row items-center justify-evenly">
              <TabButton tab={1} label="Plans" a11y="Plans" icon={IconClipboardData} />
              <TabButton tab={2} label="Routine" a11y="Routine" icon={IconRepeat} />
              <TabButton tab={8} label="Track" a11y="Tracking" icon={IconChartLine} />
            </View>

            <View pointerEvents="box-none" className="absolute inset-0 items-center justify-center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create"
                accessibilityState={{ expanded }}
                onPress={() => {
                  haptic('medium');
                  setExpanded((v) => !v);
                }}
                className="h-[52px] w-[52px] items-center justify-center rounded-full bg-neutral-950 dark:bg-white"
              >
                <View style={{ transform: [{ rotate: expanded ? '45deg' : '0deg' }] }}>
                  <Icon icon={IconPlus} size={24} strokeWidth={2} className="text-white dark:text-neutral-950" />
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}
