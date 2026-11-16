/**
 * The header menu: Routine, Tracking, Notes, Wallpaper, Settings, Cloud Sync
 * and the light/dark switch. Native twin of components/ios/IOSMenu.tsx — a
 * glass panel dropping from the menu button over a dimmed page. Tapping
 * outside closes it; picking a row closes it, then acts.
 */
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColorScheme } from 'nativewind';
import {
  IconChartLine,
  IconCloudCheck,
  IconCloudOff,
  IconCloudUpload,
  IconMoon,
  IconPencil,
  IconPhoto,
  IconRepeat,
  IconSettings,
  IconSun,
} from '@tabler/icons-react-native';
import { useAuth } from '../../contexts/AuthProvider';
import { useSyncStatus } from '../../lib/useSyncStatus';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useModalTurn } from '../../lib/modalTurn';
import { haptic } from '../../lib/haptics';
import { setStoredThemePreference } from '../../storage/themeStore';
import { Glass } from '../ui/Glass';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text } from '../ui/Text';

export type MenuDestination = 'routine' | 'tracking' | 'notes' | 'wallpaper' | 'settings';

const ROWS: Array<{ key: MenuDestination; label: string; icon: TablerIcon }> = [
  { key: 'routine', label: 'Routine', icon: IconRepeat },
  { key: 'tracking', label: 'Tracking', icon: IconChartLine },
  { key: 'notes', label: 'Notes', icon: IconPencil },
  { key: 'wallpaper', label: 'Wallpaper', icon: IconPhoto },
  { key: 'settings', label: 'Settings', icon: IconSettings },
];

export default function IOSMenu({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (to: MenuDestination) => void;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const turn = useModalTurn(open, reducedMotion ? 60 : 250);
  const { colorScheme, setColorScheme } = useColorScheme();
  const { isGuest } = useAuth();
  const { tone, label, isBusy, syncNow } = useSyncStatus();
  const theme = colorScheme === 'dark' ? 'dark' : 'light';

  const go = (to: MenuDestination) => {
    haptic('light');
    onClose();
    onNavigate(to);
  };

  const pickTheme = (t: 'light' | 'dark') => {
    haptic('light');
    setStoredThemePreference(t);
    try {
      setColorScheme(t);
    } catch {
      // nativewind runtime unavailable (tests)
    }
  };

  // Guest: leads to Settings to sign in. Signed in: syncs on tap, and the
  // row's color is the state (green synced, amber pending, rose failing).
  const syncTone = isGuest
    ? 'text-neutral-900 dark:text-white'
    : tone === 'error'
      ? 'text-rose-600 dark:text-rose-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-[#008236] dark:text-[#2FD46E]';
  const syncIcon = isGuest ? IconCloudUpload : tone === 'error' || tone === 'warn' ? IconCloudOff : IconCloudCheck;

  return (
    <Modal visible={turn} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close menu" onPress={onClose} className="absolute inset-0 bg-black/25 dark:bg-black/45" />
      <Glass
        accessibilityViewIsModal
        className="absolute right-4 w-[300px] max-w-[78%] rounded-[30px] px-3 pb-3 pt-3"
        style={{ top: insets.top + 10 }}
      >
        {ROWS.map(({ key, label: rowLabel, icon }) => (
          <Pressable
            key={key}
            accessibilityRole="menuitem"
            onPress={() => go(key)}
            className="min-h-[52px] flex-row items-center gap-4 rounded-2xl px-3 active:bg-black/[0.06] dark:active:bg-white/[0.08]"
          >
            <Icon icon={icon} size={24} strokeWidth={1.8} className="text-neutral-900 dark:text-white" />
            <Text className="text-[18px] font-medium text-neutral-900 dark:text-white">{rowLabel}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="menuitem"
          disabled={isBusy}
          onPress={() => {
            if (isGuest) return go('settings');
            haptic('light');
            void syncNow();
          }}
          className="min-h-[52px] flex-row items-center gap-4 rounded-2xl px-3 active:bg-black/[0.06] dark:active:bg-white/[0.08]"
        >
          <Icon icon={syncIcon} size={24} strokeWidth={1.8} className={syncTone} />
          <View className="min-w-0 shrink">
            <Text className={`text-[18px] font-medium ${syncTone}`}>Cloud Sync</Text>
            <Text numberOfLines={1} className={`text-[12px] font-medium opacity-75 ${syncTone}`}>
              {isGuest ? 'Sign in to back up' : label}
            </Text>
          </View>
        </Pressable>

        <View accessibilityRole="radiogroup" accessibilityLabel="Theme" className="mt-6 flex-row rounded-full bg-black/[0.06] p-1 dark:bg-white/[0.08]">
          {(['light', 'dark'] as const).map((t) => {
            const active = theme === t;
            return (
              <Pressable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => pickTheme(t)}
                className={`min-h-[44px] flex-1 flex-row items-center justify-center gap-2 rounded-full ${active ? 'bg-white dark:bg-neutral-700' : ''}`}
              >
                <Icon icon={t === 'light' ? IconSun : IconMoon} size={18} strokeWidth={2} className={active ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'} />
                <Text className={`text-[15px] font-semibold ${active ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>
                  {t === 'light' ? 'Light' : 'Dark'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Glass>
    </Modal>
  );
}
