import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import { IconNotes, IconPlus, IconSettings } from '@tabler/icons-react-native';
import { colors } from '../theme/colors';

interface HeaderProps {
  title: string;
  onNotes?: () => void;
  onSettings?: () => void;
  onCreate?: () => void;
  createLabel?: string;
}

/**
 * Native counterpart of components/ios/IOSScheduleApp.tsx's `IOSHeader` —
 * same title-left / actions-right layout, same off-white/off-black shell
 * background. Back button isn't ported yet (native-stack's own header covers
 * that for the screens that need one).
 */
export default function Header({ title, onNotes, onSettings, onCreate, createLabel }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  return (
    <View
      className="border-b border-black/[0.09] bg-[#F3F4F1] px-4 pb-2 dark:border-white/[0.09] dark:bg-[#0E0E0E]"
      style={{ paddingTop: insets.top + 10 }}
    >
      <View className="h-12 flex-row items-center justify-between gap-3">
        <Text
          numberOfLines={1}
          className="shrink text-[20px] font-bold leading-none text-black dark:text-white"
        >
          {title}
        </Text>
        <View className="flex-row items-center gap-1">
          {onNotes && (
            <TouchableOpacity
              onPress={onNotes}
              accessibilityRole="button"
              accessibilityLabel="Notes"
              className="h-10 w-10 items-center justify-center rounded-xl active:bg-black/[0.06] dark:active:bg-white/[0.08]"
            >
              <IconNotes size={20} strokeWidth={2} color={c.muted} />
            </TouchableOpacity>
          )}
          {onSettings && (
            <TouchableOpacity
              onPress={onSettings}
              accessibilityRole="button"
              accessibilityLabel="Settings"
              className="h-10 w-10 items-center justify-center rounded-xl active:bg-black/[0.06] dark:active:bg-white/[0.08]"
            >
              <IconSettings size={20} strokeWidth={2} color={c.muted} />
            </TouchableOpacity>
          )}
          {onCreate && (
            <TouchableOpacity
              onPress={onCreate}
              accessibilityRole="button"
              accessibilityLabel={createLabel ?? 'Create'}
              className="h-10 w-10 items-center justify-center rounded-xl bg-black dark:bg-white"
            >
              <IconPlus size={18} strokeWidth={2.4} color={colorScheme === 'dark' ? '#0A0A0A' : '#FFFFFF'} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}
