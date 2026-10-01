import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import {
  IconCheck,
  IconMoon,
  IconSun,
  IconDeviceMobile,
  IconCloud,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react-native';
import { colors } from '../theme/colors';
import { getStoredThemePreference, setStoredThemePreference, type ThemePreference } from '../storage/themeStore';
import { useAuth } from '../contexts/AuthProvider';
import {
  deleteCloudData,
  flushNow,
  getLastSchedule,
  getLastSyncedAt,
  getSyncStatus,
  onSyncStatusChange,
  type SyncStatus,
} from '../lib/cloudSync';
import { clearAllData, clearProgressOnly, getSchedule } from '../storage/scheduleStore';
import { authErrorMessage } from '@planr/core/lib/authErrors';
import pkg from '../../package.json';

const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  idle: 'Synced',
  syncing: 'Syncing…',
  offline: 'Offline — will sync when reconnected',
  error: "Couldn't sync — will retry",
  merged: 'Synced (combined with another device)',
};

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
      {children}
    </Text>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <View className="mb-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
      {children}
    </View>
  );
}

function Divider() {
  return <View className="mx-4 border-t border-neutral-100 dark:border-white/[0.06]" />;
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof IconSun }[] = [
  { value: 'light', label: 'Light', icon: IconSun },
  { value: 'dark', label: 'Dark', icon: IconMoon },
  { value: 'system', label: 'System', icon: IconDeviceMobile },
];

function ThemeRow({
  option,
  active,
  onPress,
  tintColor,
  mutedColor,
}: {
  option: (typeof THEME_OPTIONS)[number];
  active: boolean;
  onPress: () => void;
  tintColor: string;
  mutedColor: string;
}) {
  const Icon = option.icon;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="flex-row items-center gap-3 px-4 py-3.5 active:bg-black/[0.03] dark:active:bg-white/[0.04]"
    >
      <Icon size={19} strokeWidth={1.8} color={mutedColor} />
      <Text className="flex-1 text-[15px] font-medium text-black dark:text-white">{option.label}</Text>
      {active && <IconCheck size={18} strokeWidth={2.5} color={tintColor} />}
    </Pressable>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between px-4 py-3.5">
      <Text className="text-[15px] font-medium text-black dark:text-white">{label}</Text>
      <Text className="text-[14px] text-neutral-500 dark:text-neutral-400">{value}</Text>
    </View>
  );
}

/** The real 4-color Google "G" — native port of web's inline GoogleLogo SVG
 *  (components/auth/SettingsSheet.tsx), via react-native-svg (already a
 *  dependency) rather than a generic cloud icon, so the button reads exactly
 *  like web's "Continue with Google". */
function GoogleLogo() {
  return (
    <Svg viewBox="0 0 24 24" width={15} height={15}>
      <Path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <Path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <Path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <Path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </Svg>
  );
}

/** Sign in/out + live sync status — the same cloud sync engine web uses
 *  (apps/native/src/lib/cloudSync.ts), just surfaced here instead of a
 *  settings sheet. Renders nothing when Firebase isn't configured
 *  (apps/native/src/lib/firebaseConfig.ts still has placeholder values),
 *  matching the app's guest-only graceful degradation everywhere else. */
function AccountSection({ mutedColor }: { mutedColor: string }) {
  const { user, isGuest, authLoading, isAuthAvailable, isGoogleSignInReady, login, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());

  useEffect(() => onSyncStatusChange(setStatus), []);

  if (!isAuthAvailable) return null;

  async function handleLogin() {
    if (!isGoogleSignInReady) {
      Alert.alert(
        'Not set up yet',
        "This build is missing the iOS OAuth client id Google Sign-In needs (see apps/native/src/lib/firebaseConfig.ts).",
      );
      return;
    }
    setBusy(true);
    try {
      await login();
    } catch (err) {
      const message = authErrorMessage(err);
      if (message) Alert.alert('Sign-in failed', message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mb-5">
      {authLoading ? (
        <SettingsCard>
          <View className="items-center px-4 py-5">
            <ActivityIndicator color={mutedColor} />
          </View>
        </SettingsCard>
      ) : isGuest ? (
        <SettingsCard>
          <View className="p-4">
            <Text className="mb-0.5 text-[13px] font-semibold text-black dark:text-white">Sign in to sync</Text>
            <Text className="mb-3.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
              Back up your data and access it across all your devices.
            </Text>
            <Pressable
              onPress={handleLogin}
              disabled={busy}
              accessibilityRole="button"
              className="w-full flex-row items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 active:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:active:bg-white/[0.08]"
              style={{ opacity: busy ? 0.5 : 1 }}
            >
              {busy ? <ActivityIndicator size="small" color={mutedColor} /> : <GoogleLogo />}
              <Text className="text-[13px] font-semibold text-neutral-700 dark:text-white">
                {busy ? 'Signing in…' : 'Continue with Google'}
              </Text>
            </Pressable>
            {!isGoogleSignInReady && (
              <Text className="mt-2 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                Sync is unavailable in this build — it's missing its iOS sign-in configuration.
              </Text>
            )}
          </View>
        </SettingsCard>
      ) : (
        <SettingsCard>
          <View className="flex-row items-center gap-3 p-4">
            {user?.photoURL ? (
              <Image
                source={{ uri: user.photoURL }}
                className="h-11 w-11 rounded-full border border-neutral-100 dark:border-white/10"
              />
            ) : (
              <View className="h-11 w-11 rounded-full border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-800" />
            )}
            <View className="min-w-0 flex-1">
              <Text className="truncate text-[14px] font-bold text-black dark:text-white" numberOfLines={1}>
                {user?.displayName ?? 'User'}
              </Text>
              {!!user?.email && (
                <Text className="truncate text-[12px] text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                  {user.email}
                </Text>
              )}
            </View>
          </View>
          <Divider />
          <View className="flex-row items-center justify-between gap-3 px-4 py-3">
            <View className="flex-1 flex-row items-center gap-1.5">
              <IconCloud size={14} strokeWidth={2.5} color={mutedColor} />
              <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                {SYNC_STATUS_LABEL[status]}
              </Text>
            </View>
            <Pressable
              onPress={handleLogout}
              disabled={busy}
              accessibilityRole="button"
              className="rounded-xl border border-neutral-200 px-3 py-1.5 active:bg-neutral-50 dark:border-white/[0.08] dark:active:bg-white/[0.04]"
            >
              <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                {busy ? '…' : 'Sign out'}
              </Text>
            </Pressable>
          </View>
        </SettingsCard>
      )}
    </View>
  );
}

function timeAgo(ms: number): string {
  if (!ms) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/**
 * Manual sync + destructive data actions — native port of
 * components/auth/SettingsSheet.tsx's SyncRow/ClearProgressRow/ClearDataRow.
 * Rendered for guests too (mirrors web: BackupRows/ClearDataRow always show,
 * only SyncRow itself is signed-in-only) since local data can be cleared
 * without ever having synced.
 */
function DataSection({ mutedColor }: { mutedColor: string }) {
  const { isGuest } = useAuth();
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [, tick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [progressPhase, setProgressPhase] = useState<'idle' | 'confirm' | 'clearing'>('idle');
  const [dataPhase, setDataPhase] = useState<'idle' | 'confirm' | 'clearing'>('idle');

  useEffect(() => onSyncStatusChange(setStatus), []);
  // Refresh the "X ago" label periodically while idle, same as web.
  useEffect(() => {
    if (status !== 'idle') return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [status]);

  async function handleSyncNow() {
    if (syncing || status === 'syncing') return;
    const snapshot = getLastSchedule() ?? getSchedule();
    setSyncing(true);
    try {
      await flushNow(snapshot);
    } finally {
      setSyncing(false);
    }
  }

  async function handleClearProgress() {
    setProgressPhase('clearing');
    try {
      clearProgressOnly();
    } finally {
      setProgressPhase('idle');
    }
  }

  async function handleClearData() {
    setDataPhase('clearing');
    try {
      clearAllData();
      if (!isGuest) await deleteCloudData();
    } finally {
      setDataPhase('idle');
    }
  }

  return (
    <>
      <SectionLabel>Data</SectionLabel>
      <SettingsCard>
        {!isGuest && (
          <>
            <View className="flex-row items-center gap-3 px-4 py-3.5">
              <View className="h-8 w-8 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 dark:border-white/[0.06] dark:bg-white/[0.04]">
                <IconCloud size={15} strokeWidth={2} color={mutedColor} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] font-semibold text-black dark:text-white">Sync</Text>
                <Text className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {status === 'syncing' || syncing
                    ? 'Syncing…'
                    : status === 'error'
                    ? "Couldn't sync — will retry"
                    : status === 'offline'
                    ? 'Offline — will sync when reconnected'
                    : `Last synced ${timeAgo(getLastSyncedAt())}`}
                </Text>
              </View>
              <Pressable
                onPress={handleSyncNow}
                disabled={syncing || status === 'syncing'}
                accessibilityRole="button"
                className="shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 active:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:active:bg-white/[0.08]"
                style={{ opacity: syncing || status === 'syncing' ? 0.5 : 1 }}
              >
                <Text className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">Sync now</Text>
              </Pressable>
            </View>
            <Divider />
          </>
        )}

        <View className="px-4 py-3.5">
          {progressPhase === 'idle' ? (
            <View className="flex-row items-center gap-3">
              <View className="h-8 w-8 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10">
                <IconRefresh size={15} strokeWidth={2} color="#D97706" />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] font-semibold text-black dark:text-white">Clear progress</Text>
                <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Resets completions & logs · keeps plans and tasks
                </Text>
              </View>
              <Pressable
                onPress={() => setProgressPhase('confirm')}
                accessibilityRole="button"
                className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 active:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10"
              >
                <Text className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Reset</Text>
              </Pressable>
            </View>
          ) : progressPhase === 'confirm' ? (
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-[12px] font-medium text-neutral-600 dark:text-neutral-300">
                Reset all completions and logs?
              </Text>
              <Pressable onPress={() => setProgressPhase('idle')} className="rounded-xl px-3 py-1.5 active:bg-neutral-100 dark:active:bg-white/[0.06]">
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Cancel</Text>
              </Pressable>
              <Pressable onPress={handleClearProgress} className="rounded-xl bg-amber-600 px-3 py-1.5 active:opacity-80">
                <Text className="text-[11px] font-semibold text-white">Reset</Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center py-1">
              <ActivityIndicator size="small" color={mutedColor} />
            </View>
          )}
        </View>
        <Divider />

        <View className="px-4 py-3.5">
          {dataPhase === 'idle' ? (
            <View className="flex-row items-center gap-3">
              <View className="h-8 w-8 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10">
                <IconTrash size={15} strokeWidth={2} color="#E7000B" />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-[13px] font-semibold text-black dark:text-white">Clear all data</Text>
                <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">Removes everything on this device</Text>
              </View>
              <Pressable
                onPress={() => setDataPhase('confirm')}
                accessibilityRole="button"
                className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 active:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10"
              >
                <Text className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">Clear</Text>
              </Pressable>
            </View>
          ) : dataPhase === 'confirm' ? (
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-[12px] font-medium text-neutral-600 dark:text-neutral-300">
                Delete everything? This can't be undone.
              </Text>
              <Pressable onPress={() => setDataPhase('idle')} className="rounded-xl px-3 py-1.5 active:bg-neutral-100 dark:active:bg-white/[0.06]">
                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Cancel</Text>
              </Pressable>
              <Pressable onPress={handleClearData} className="rounded-xl bg-rose-600 px-3 py-1.5 active:opacity-80">
                <Text className="text-[11px] font-semibold text-white">Delete</Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center py-1">
              <ActivityIndicator size="small" color={mutedColor} />
            </View>
          )}
        </View>
      </SettingsCard>
    </>
  );
}

export default function SettingsScreen() {
  const { colorScheme, setColorScheme } = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredThemePreference());
  const c = colors[colorScheme ?? 'light'];

  function choose(pref: ThemePreference) {
    setPreference(pref);
    setStoredThemePreference(pref);
    setColorScheme(pref);
  }

  return (
    <ScrollView
      className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
    >
      <AccountSection mutedColor={c.muted} />

      <SectionLabel>Appearance</SectionLabel>
      <SettingsCard>
        {THEME_OPTIONS.map((option, i) => (
          <View key={option.value}>
            {i > 0 && <Divider />}
            <ThemeRow
              option={option}
              active={preference === option.value}
              onPress={() => choose(option.value)}
              tintColor={c.momentumGreen}
              mutedColor={c.muted}
            />
          </View>
        ))}
      </SettingsCard>

      <DataSection mutedColor={c.muted} />

      <SectionLabel>About</SectionLabel>
      <SettingsCard>
        <InfoRow label="Version" value={pkg.version} />
        <Divider />
        <InfoRow label="Platform" value="iOS (React Native)" />
      </SettingsCard>
    </ScrollView>
  );
}
