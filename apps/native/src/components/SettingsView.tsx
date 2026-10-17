import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, Share, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import { IconClock, IconCloud, IconCompass, IconMoon, IconRefresh, IconShield, IconSun, IconTerminal2, IconTrash, IconX } from '@tabler/icons-react-native';
import type { Schedule, SchedulePreferences } from '@planr/core/lib/scheduleTypes';
import { TOUR_IDS } from '@planr/core/lib/onboarding/tours';
import { formatDisplayTime, minutesToInputTime } from '@planr/core/lib/timeUtils';
import { buildDeleteConfirmationCopy } from '@planr/core/lib/deleteConfirm';
import { normalizeDayStartTime } from '@planr/core/lib/timeline/displayWindow';
import { MAX_SLEEP_HOURS, MIN_SLEEP_HOURS } from '@planr/core/lib/timeline/sleepWindow';
import { localISODate } from '@planr/core/lib/dateUtils';
import { useAuth } from '../contexts/AuthProvider';
import { useGoogleSignIn } from './auth/useGoogleSignIn';
import { AuthErrorNote } from './auth/AuthErrorNote';
import { deleteCloudData } from '../lib/cloudSync';
import { useSyncStatus } from '../lib/useSyncStatus';
import { haptic } from '../lib/haptics';
import { versionLabel } from '../lib/buildInfo';
import { collectDiagnostics, formatDiagnostics, type DiagnosticsSnapshot } from '../lib/diagnostics';
import { clearErrorLog } from '../lib/errorLog';
import { isErrorTelemetryEnabled, setErrorTelemetryEnabled } from '../lib/errorTelemetry';
import { resetTour } from '../lib/onboarding/useCoachTour';
import { setStoredThemePreference } from '../storage/themeStore';
import CategoryManager from './category/CategoryManager';
import BackupRows from './settings/BackupRows';
import RemindersRows from './settings/RemindersRows';
import ConfirmSheet from './ui/ConfirmSheet';
import Toggle from './ui/Toggle';
import Select from './ui/Select';
import DateInput from './ui/DateInput';
import { CARD as CARD_SURFACE } from './ui/surfaces';
import { SETTINGS_ICON_BUTTON_CLASS } from './ui/Input';
import { Icon, type TablerIcon } from './ui/Icon';
import { Text } from './ui/Text';

// ── Primitives ────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: ReactNode }) {
  return <Text className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.10em] text-neutral-500 dark:text-neutral-400">{children}</Text>;
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`overflow-hidden ${CARD_SURFACE} ${className}`}>{children}</View>;
}

function Row({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <View className={`flex-row items-center gap-3 px-4 py-3.5 ${className}`}>{children}</View>;
}

function Divider() {
  return <View className="mx-4 border-t border-neutral-100 dark:border-white/[0.05]" />;
}

function RowIcon({ icon, tone = 'text-neutral-500 dark:text-neutral-300', box = 'border-neutral-100 bg-neutral-50 dark:border-white/[0.06] dark:bg-white/[0.04]' }: { icon: TablerIcon; tone?: string; box?: string }) {
  return (
    <View className={`h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${box}`}>
      <Icon icon={icon} size={14} strokeWidth={2} className={tone} />
    </View>
  );
}

function SmallButton({ label, onPress, disabled = false, tone = 'text-neutral-700 dark:text-neutral-200' }: { label: string; onPress: () => void; disabled?: boolean; tone?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 active:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:active:bg-white/[0.07] ${disabled ? 'opacity-50' : ''}`}
    >
      <Text className={`text-[11px] font-semibold ${tone}`}>{label}</Text>
    </Pressable>
  );
}

const DAY_START_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const value = minutesToInputTime(index * 30);
  return { value, label: formatDisplayTime(value) };
});

const DAY_END_OPTIONS = Array.from({ length: 9 }, (_, i) => {
  const minutes = 24 * 60 + i * 30; // 1440..1680
  const baseLabel = formatDisplayTime(minutesToInputTime(minutes % 1440));
  const label = minutes >= 1440 ? `${baseLabel} (next day)` : baseLabel;
  return { value: String(minutes), label };
});

const SLEEP_HOURS_OPTIONS = Array.from({ length: (MAX_SLEEP_HOURS - MIN_SLEEP_HOURS) * 2 + 1 }, (_, i) => {
  const hours = MIN_SLEEP_HOURS + i * 0.5;
  return { value: String(hours), label: `${hours % 1 === 0 ? hours : hours.toFixed(1)}h` };
});

type ThemeMode = 'light' | 'dark';

// ── Replay tours row ─────────────────────────────────────────────────────────

function ReplayToursRow() {
  const [justReset, setJustReset] = useState(false);

  function handleReplay() {
    haptic('light');
    TOUR_IDS.forEach(resetTour);
    setJustReset(true);
    setTimeout(() => setJustReset(false), 2200);
  }

  return (
    <Row>
      <RowIcon icon={IconCompass} />
      <View className="min-w-0 flex-1">
        <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Guided tours</Text>
        <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
          {justReset ? "Reset — they'll show again as you visit each tab." : 'Short intro to Today, Plans, and Routine'}
        </Text>
      </View>
      <SmallButton label={justReset ? 'Done' : 'Replay'} onPress={handleReplay} disabled={justReset} />
    </Row>
  );
}

// ── Sync row ──────────────────────────────────────────────────────────────────

function SyncRow() {
  const { tone, label, isBusy, lastResult, syncNow } = useSyncStatus();
  const color = tone === 'warn' ? 'text-amber-500' : tone === 'error' ? 'text-rose-500' : 'text-emerald-500 dark:text-emerald-400';

  return (
    <Row>
      <RowIcon icon={IconCloud} tone="text-neutral-500" />
      <View className="min-w-0 flex-1">
        <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Cloud sync</Text>
        <Text className={`text-[11px] font-medium ${color}`}>{lastResult || label}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => void syncNow()}
        disabled={isBusy}
        className={`flex-row items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 active:scale-[0.93] dark:border-white/[0.08] dark:bg-white/[0.04] ${isBusy ? 'opacity-40' : ''}`}
      >
        {isBusy ? <ActivityIndicator size="small" /> : <Icon icon={IconCloud} size={11} strokeWidth={2} className="text-neutral-600 dark:text-neutral-300" />}
        <Text className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">{isBusy ? 'Syncing…' : 'Sync now'}</Text>
      </Pressable>
    </Row>
  );
}

function ErrorTelemetryRow() {
  const { isGuest } = useAuth();
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(isErrorTelemetryEnabled());
  }, []);
  if (isGuest) return null;
  const toggle = () => {
    const next = !on;
    setOn(next);
    setErrorTelemetryEnabled(next);
  };
  return (
    <>
      <Divider />
      <Row>
        <RowIcon icon={IconShield} />
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Share error reports</Text>
          <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
            Sends crash details to your own cloud space to help fix bugs · no schedule content
          </Text>
        </View>
        <Toggle on={on} onChange={toggle} label="Share error reports" />
      </Row>
    </>
  );
}

function DiagnosticsCard() {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);

  const refresh = useCallback(() => {
    void collectDiagnostics().then(setSnapshot);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // The web copies to the clipboard; the share sheet is the native route
  // (Copy is one of its actions) without a clipboard module.
  async function shareDiagnostics() {
    if (!snapshot) return;
    try {
      await Share.share({ message: formatDiagnostics(snapshot), title: 'PlanR diagnostics' });
    } catch {
      // dismissed or unavailable — nothing to report
    }
  }

  const latestError = snapshot?.errors.at(-1);
  const platformMode = snapshot ? `${snapshot.platform.os === 'ios' ? (snapshot.platform.isPad ? 'iPad' : 'iPhone') : 'Android'} app` : '';

  return (
    <Card>
      <Row className="items-start">
        <RowIcon icon={IconTerminal2} tone="text-neutral-500" />
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Diagnostics</Text>
          <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
            {snapshot ? `${platformMode} · Sync ${snapshot.sync.status} · ${snapshot.errors.length} errors` : 'Collecting app diagnostics…'}
          </Text>
          {latestError && (
            <Text className="mt-1 truncate font-mono text-[10px] text-rose-500 dark:text-rose-400">
              Last error: {latestError.source}: {latestError.message}
            </Text>
          )}
        </View>
      </Row>
      <Divider />
      <View className="flex-row gap-2 px-4 py-3">
        {[
          { label: 'Share', onPress: () => void shareDiagnostics(), disabled: !snapshot, tone: 'text-neutral-700 dark:text-neutral-200' },
          { label: 'Refresh', onPress: refresh, disabled: false, tone: 'text-neutral-700 dark:text-neutral-200' },
          {
            label: 'Clear logs',
            onPress: () => {
              clearErrorLog();
              refresh();
            },
            disabled: false,
            tone: 'text-neutral-500 dark:text-neutral-300',
          },
        ].map((b) => (
          <Pressable
            key={b.label}
            accessibilityRole="button"
            onPress={b.onPress}
            disabled={b.disabled}
            className={`flex-1 items-center rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.04] ${b.disabled ? 'opacity-40' : ''}`}
          >
            <Text className={`text-[11px] font-semibold ${b.tone}`}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
      <ErrorTelemetryRow />
    </Card>
  );
}

// ── Google logo ───────────────────────────────────────────────────────────────

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

// ── Main view ─────────────────────────────────────────────────────────────────

interface SettingsViewProps {
  schedule: Schedule;
  /** Needed by the category manager, which edits schedule.categories. */
  setSchedule: (updater: (prev: Schedule) => Schedule) => void;
  onClearData: () => Promise<void>;
  onClearProgress?: () => Promise<void>;
  onRestoreData?: (raw: unknown) => boolean;
  onUpdatePreferences?: (patch: Partial<SchedulePreferences>) => void;
  onClose?: () => void;
}

/**
 * Native port of components/SettingsView.tsx — the full-page Settings tab:
 * account (Google sign-in / sign-out), help (replay tours), categories,
 * appearance, reminders, timeline (start/end of day, sleep), tracking start,
 * app version, diagnostics with opt-in error reports, and data (cloud sync,
 * backup/restore/version history/demo data, clear progress, clear all).
 *
 * Two web rows have no native meaning and are left out: the Intelligence
 * card (the on-device AI isn't part of the native build — the web hides it
 * the same way when AI is locked off) and "Check for updates" (an App Store
 * app updates through the store, not by clearing a service-worker cache).
 */
export function SettingsView({ schedule, setSchedule, onClearData, onClearProgress, onRestoreData, onUpdatePreferences, onClose }: SettingsViewProps) {
  const { user, isGuest, authLoading, logout } = useAuth();
  const { signingIn, error: signInError, isAuthAvailable, isGoogleSignInReady, signIn } = useGoogleSignIn();
  const { colorScheme, setColorScheme } = useColorScheme();
  const [busy, setBusy] = useState(false);
  const [clearPhase, setClearPhase] = useState<'idle' | 'clearing'>('idle');
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [progressPhase, setProgressPhase] = useState<'idle' | 'confirm' | 'clearing'>('idle');
  const clearCopy = buildDeleteConfirmationCopy('everything', {
    title: 'Delete everything?',
    description: 'This permanently deletes all local and cloud data. Cannot be undone.',
    confirmLabel: 'Delete everything',
  });
  const theme: ThemeMode = colorScheme === 'dark' ? 'dark' : 'light';

  function setAppTheme(t: ThemeMode) {
    setStoredThemePreference(t);
    try {
      setColorScheme(t);
    } catch {
      // nativewind runtime unavailable (tests)
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
  const handleClear = useCallback(async () => {
    setClearPhase('clearing');
    try {
      await onClearData();
      await deleteCloudData();
    } finally {
      setClearPhase('idle');
      onClose?.();
    }
  }, [onClearData, onClose]);
  const handleClearProgress = useCallback(async () => {
    if (!onClearProgress) return;
    setProgressPhase('clearing');
    try {
      await onClearProgress();
    } finally {
      setProgressPhase('idle');
    }
  }, [onClearProgress]);
  const dayStartTime = schedule.preferences?.dayStartTime ?? '';
  const handleDayStartChange = useCallback(
    (value: string) => {
      onUpdatePreferences?.({ dayStartTime: normalizeDayStartTime(value) });
    },
    [onUpdatePreferences],
  );
  // "" = the fixed 4:00 AM default; "auto" = follow the last task.
  const dayEndSelectValue = schedule.preferences?.dayEndAuto
    ? 'auto'
    : typeof schedule.preferences?.dayEndMinutes === 'number'
      ? String(schedule.preferences.dayEndMinutes)
      : '';
  const trackingStart = schedule.preferences?.startDate ?? '';
  const handleTrackingStartChange = useCallback(
    (value: string) => {
      onUpdatePreferences?.({ startDate: value || undefined });
    },
    [onUpdatePreferences],
  );

  const settingTitle = 'text-[13px] font-semibold text-neutral-800 dark:text-white';
  const settingHint = 'mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400';

  return (
    <View className="min-h-full bg-[#F5F5F5] dark:bg-[#111111]">
      <View className="px-4 pb-12 pt-6">
        {/* Page title */}
        <View className="mb-6">
          <Text accessibilityRole="header" className="text-[26px] font-black tracking-[-0.5px] text-neutral-900 dark:text-white">
            Settings
          </Text>
          <Text className="mt-0.5 text-[13px] text-neutral-500 dark:text-neutral-400">Account, appearance, and data</Text>
        </View>

        <View className="gap-6">
          {/* ── Account ─────────────────────────────────────────────────────── */}
          {!authLoading && (
            <View>
              <SectionLabel>Account</SectionLabel>
              {isGuest ? (
                <Card>
                  <View className="px-4 py-4">
                    <Text className="mb-0.5 text-[14px] font-bold text-neutral-900 dark:text-white">Sign in to sync</Text>
                    <Text className="mb-3.5 text-[12px] text-neutral-500 dark:text-neutral-400">Back up your data and access it across all your devices.</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void signIn()}
                      disabled={signingIn || !isAuthAvailable}
                      className={`w-full flex-row items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 active:scale-[0.97] active:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:active:bg-white/[0.07] ${
                        signingIn || !isAuthAvailable ? 'opacity-50' : ''
                      }`}
                    >
                      {signingIn ? <ActivityIndicator size="small" /> : <GoogleLogo />}
                      <Text className="text-[13px] font-semibold text-neutral-700 dark:text-white">{signingIn ? 'Signing in…' : 'Continue with Google'}</Text>
                    </Pressable>
                    <AuthErrorNote
                      message={signInError ?? (isAuthAvailable && !isGoogleSignInReady ? "Google Sign-In isn't set up for this build yet." : null)}
                      unavailable={!isAuthAvailable}
                    />
                  </View>
                </Card>
              ) : (
                <Card>
                  <Row>
                    {user?.photoURL ? (
                      <Image
                        source={{ uri: user.photoURL }}
                        accessibilityIgnoresInvertColors
                        className="h-10 w-10 shrink-0 rounded-full border border-neutral-100 dark:border-white/10"
                        style={{ width: 40, height: 40 }}
                      />
                    ) : (
                      <View className="h-10 w-10 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                    )}
                    <View className="min-w-0 flex-1">
                      <Text className="truncate text-[14px] font-bold text-neutral-900 dark:text-white">{user?.displayName ?? 'User'}</Text>
                      <Text className="truncate text-[12px] text-neutral-500 dark:text-neutral-400">{user?.email}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void handleLogout()}
                      disabled={busy}
                      className={`rounded-lg border border-neutral-200 px-3 py-2 active:scale-[0.94] dark:border-white/[0.08] ${busy ? 'opacity-50' : ''}`}
                    >
                      <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{busy ? '…' : 'Sign out'}</Text>
                    </Pressable>
                  </Row>
                </Card>
              )}
            </View>
          )}

          {/* ── Help ───────────────────────────────────────────────────────── */}
          <View>
            <SectionLabel>Help</SectionLabel>
            <Card>
              <ReplayToursRow />
            </Card>
          </View>

          {/* ── Categories ──────────────────────────────────────────────────── */}
          <View>
            <SectionLabel>Categories</SectionLabel>
            <Card>
              <View className="px-4 py-3">
                <Text className="mb-3 text-[12px] text-neutral-500 dark:text-neutral-400">
                  A task's category sets its icon and colour, and groups it in “Where the day goes”.
                </Text>
                <CategoryManager schedule={schedule} setSchedule={setSchedule} />
              </View>
            </Card>
          </View>

          {/* ── Appearance ──────────────────────────────────────────────────── */}
          <View>
            <SectionLabel>Appearance</SectionLabel>
            <Card>
              <Row>
                <RowIcon icon={theme === 'dark' ? IconMoon : IconSun} tone="text-neutral-500" />
                <Text className="flex-1 text-[13px] font-semibold text-neutral-800 dark:text-white">Appearance</Text>
                <View className="flex-row rounded-xl border border-neutral-200 bg-neutral-50 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                  {(['light', 'dark'] as ThemeMode[]).map((t) => (
                    <Pressable
                      key={t}
                      accessibilityRole="button"
                      accessibilityState={{ selected: theme === t }}
                      onPress={() => setAppTheme(t)}
                      className={`flex-row items-center gap-1.5 rounded-[9px] px-3 py-1.5 ${theme === t ? 'bg-neutral-900 dark:bg-white' : ''}`}
                    >
                      <Icon
                        icon={t === 'light' ? IconSun : IconMoon}
                        size={11}
                        strokeWidth={2}
                        className={theme === t ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400'}
                      />
                      <Text className={`text-[11px] font-semibold capitalize ${theme === t ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400'}`}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </Row>
            </Card>
          </View>

          <View>
            <SectionLabel>Reminders</SectionLabel>
            <Card>
              <RemindersRows />
            </Card>
          </View>

          <View>
            <SectionLabel>Timeline</SectionLabel>
            <Card>
              <View className="gap-3 px-4 py-3.5">
                <View className="min-w-0">
                  <Text className={settingTitle}>Start of day</Text>
                  <Text className={settingHint}>
                    Where the timeline scrolls to, and the day boundary for missed-task and free-time checks. The Overview breakdown always runs a fixed 4 AM–4 AM day.
                  </Text>
                </View>
                <Select
                  label="Start of day"
                  value={dayStartTime}
                  options={[{ value: '', label: 'Auto (first task)' }, ...DAY_START_OPTIONS]}
                  onChange={handleDayStartChange}
                  icon={IconClock}
                  muted={!dayStartTime}
                  className="w-full"
                />
              </View>

              <Divider />

              <View className="gap-3 px-4 py-3.5">
                <View className="min-w-0">
                  <Text className={settingTitle}>End of day</Text>
                  <Text className={settingHint}>How far past midnight your day can run (12–4 AM), or follow your last task. Times show as "(next day)".</Text>
                </View>
                <Select
                  label="End of day"
                  value={dayEndSelectValue}
                  options={[{ value: '', label: 'Default (4:00 AM)' }, { value: 'auto', label: 'Follow last task' }, ...DAY_END_OPTIONS]}
                  onChange={(v) => {
                    if (v === 'auto') {
                      onUpdatePreferences?.({ dayEndAuto: true, dayEndMinutes: undefined });
                    } else if (v === '') {
                      onUpdatePreferences?.({ dayEndAuto: undefined, dayEndMinutes: undefined });
                    } else {
                      onUpdatePreferences?.({ dayEndAuto: undefined, dayEndMinutes: Number(v) });
                    }
                  }}
                  icon={IconClock}
                  muted={dayEndSelectValue === ''}
                  className="w-full"
                />
              </View>

              <Divider />

              <View className="gap-3 px-4 py-3.5">
                <View className="min-w-0">
                  <Text className={settingTitle}>Sleep needed</Text>
                  <Text className={settingHint}>The night you're aiming for. Sets your waking day and warns when the schedule eats into it.</Text>
                </View>
                <Select
                  label="Sleep needed"
                  value={schedule.preferences?.sleepHours != null ? String(schedule.preferences.sleepHours) : ''}
                  options={[{ value: '', label: 'Default (8h)' }, ...SLEEP_HOURS_OPTIONS]}
                  onChange={(v) => onUpdatePreferences?.({ sleepHours: v ? Number(v) : undefined })}
                  icon={IconMoon}
                  muted={schedule.preferences?.sleepHours == null}
                  className="w-full"
                />
              </View>
            </Card>
          </View>

          <View>
            <SectionLabel>Tracking</SectionLabel>
            <Card>
              <View className="gap-3 px-4 py-3.5">
                <View className="min-w-0">
                  <Text className={settingTitle}>Tracking starts</Text>
                  <Text className={settingHint}>Tasks, routines, streaks and trends are all ignored before this date. Off = show and count all history.</Text>
                </View>
                <View className="w-full min-w-0 flex-row items-start gap-2">
                  <View className="min-w-0 flex-1">
                    <DateInput value={trackingStart} onChange={handleTrackingStartChange} max={localISODate(new Date())} placeholder="All history" />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Use all history"
                    onPress={() => handleTrackingStartChange('')}
                    disabled={!trackingStart}
                    className={`${SETTINGS_ICON_BUTTON_CLASS} h-11 w-11 ${!trackingStart ? 'opacity-40' : ''}`}
                  >
                    <Icon icon={IconX} size={15} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
                  </Pressable>
                </View>
              </View>
            </Card>
          </View>

          {/* ── App ─────────────────────────────────────────────────────────── */}
          <View>
            <SectionLabel>App</SectionLabel>
            <Card>
              <View className="px-4 py-2.5">
                <Text className="text-[10px] text-neutral-500 dark:text-neutral-400">{versionLabel()}</Text>
              </View>
            </Card>
          </View>

          <View>
            <SectionLabel>Debug</SectionLabel>
            <DiagnosticsCard />
          </View>

          {/* ── Data ────────────────────────────────────────────────────────── */}
          <View>
            <SectionLabel>Data</SectionLabel>
            <Card>
              {!isGuest && (
                <>
                  <SyncRow />
                  <Divider />
                </>
              )}
              <BackupRows schedule={schedule} onRestoreData={onRestoreData} />
              <Divider />
              {/* Clear progress — keeps plans/tasks/trackers, wipes completions & logs */}
              {onClearProgress && (
                <>
                  <View className="px-4 py-3.5">
                    {progressPhase === 'idle' && (
                      <View className="flex-row items-center gap-3">
                        <RowIcon
                          icon={IconRefresh}
                          tone="text-amber-600 dark:text-amber-400"
                          box="border-amber-100 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
                        />
                        <View className="min-w-0 flex-1">
                          <Text className={settingTitle}>Clear progress</Text>
                          <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">Resets completions & logged values · keeps your plans and tasks</Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setProgressPhase('confirm')}
                          className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 active:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10"
                        >
                          <Text className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Reset</Text>
                        </Pressable>
                      </View>
                    )}
                    {progressPhase === 'confirm' && (
                      <View>
                        <Text className="mb-3 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                          Clears all task completions, completion history, routine check-ins, logged metrics, and milestone progress. Your plans, tasks, trackers, milestones, and
                          routines stay. Cannot be undone.
                        </Text>
                        <View className="flex-row gap-2">
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setProgressPhase('idle')}
                            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-2 active:bg-neutral-50 dark:border-white/[0.08] dark:bg-white/[0.04]"
                          >
                            <Icon icon={IconX} size={12} strokeWidth={2.5} className="text-neutral-600 dark:text-neutral-300" />
                            <Text className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">Cancel</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => void handleClearProgress()}
                            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2 active:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10"
                          >
                            <Icon icon={IconRefresh} size={12} strokeWidth={2} className="text-amber-700 dark:text-amber-400" />
                            <Text className="text-[12px] font-semibold text-amber-700 dark:text-amber-400">Clear progress</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                    {progressPhase === 'clearing' && (
                      <View className="flex-row items-center gap-3">
                        <ActivityIndicator size="small" />
                        <Text className="text-[13px] font-medium text-neutral-500">Clearing progress…</Text>
                      </View>
                    )}
                  </View>
                  <Divider />
                </>
              )}

              {/* Clear data */}
              <View className="px-4 py-3.5">
                {clearPhase === 'idle' && (
                  <View className="flex-row items-center gap-3">
                    <RowIcon icon={IconTrash} tone="text-rose-500" box="border-rose-100 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10" />
                    <Text className="flex-1 text-[13px] font-semibold text-neutral-800 dark:text-white">Clear all data</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        haptic('light');
                        setClearConfirmOpen(true);
                      }}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 active:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10"
                    >
                      <Text className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">Clear</Text>
                    </Pressable>
                  </View>
                )}
                {clearPhase === 'clearing' && (
                  <View className="flex-row items-center gap-3">
                    <ActivityIndicator size="small" />
                    <Text className="text-[13px] font-medium text-neutral-500">Clearing…</Text>
                  </View>
                )}
              </View>
            </Card>
          </View>

          <Text className="text-center text-[10px] text-neutral-500 dark:text-neutral-400">PlanR · Personal Execution OS</Text>
        </View>
      </View>

      <ConfirmSheet
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          setClearConfirmOpen(false);
          void handleClear();
        }}
        title={clearCopy.title}
        description={clearCopy.description}
        confirmLabel={clearCopy.confirmLabel}
      />
    </View>
  );
}

export default SettingsView;
