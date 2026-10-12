import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, View } from 'react-native';
import { IconAlertTriangle, IconBell, IconBellOff, IconClock, IconSend } from '@tabler/icons-react-native';
import { formatDisplayTime, minutesToInputTime } from '@planr/core/lib/timeUtils';
import { haptic } from '../../lib/haptics';
import {
  batteryOptimizationOn,
  cancelAllReminders,
  exactAlarmAccess,
  getReminderDelivery,
  getReminderSettings,
  notificationSupport,
  openBatteryOptimizationSettings,
  openExactAlarmSettings,
  requestNotificationPermission,
  sendTestNotification,
  setReminderDelivery,
  setReminderSettings,
  type ExactAlarmAccess,
  type NotificationSupport,
  type ReminderDelivery,
  type ReminderSettings,
  type TestNotificationResult,
} from '../../lib/reminders';
import Toggle from '../ui/Toggle';
import Select from '../ui/Select';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text } from '../ui/Text';

const NUDGE_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const value = minutesToInputTime(16 * 60 + i * 30); // 16:00 → 21:30
  return { value, label: formatDisplayTime(value) };
});

function SubRow({ label, description, on, onChange }: { label: string; description?: string; on: boolean; onChange: (next: boolean) => void }) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View className="min-w-0 flex-1">
        <Text className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">{label}</Text>
        {description && <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">{description}</Text>}
      </View>
      <Toggle on={on} onChange={onChange} label={label} />
    </View>
  );
}

/** A 36pt pill whose hit area reaches 44pt. */
function RowButton({
  label,
  accessibilityLabel,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  accessibilityLabel?: string;
  icon?: TablerIcon;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 4, bottom: 4 }}
      className={`h-9 shrink-0 flex-row items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 active:bg-neutral-50 dark:border-white/10 dark:active:bg-white/[0.04] ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      {icon && <Icon icon={icon} size={13} strokeWidth={2.2} className="text-neutral-600 dark:text-neutral-300" />}
      <Text className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">{label}</Text>
    </Pressable>
  );
}

/** Something on this device that makes reminders late, and the way to fix it. */
function FixRow({ label, description, action, actionLabel, onPress }: { label: string; description: string; action: string; actionLabel: string; onPress: () => void }) {
  return (
    <View className="flex-row items-center gap-3 border-t border-neutral-100 py-2.5 dark:border-white/[0.05]">
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Icon icon={IconAlertTriangle} size={12} strokeWidth={2.2} className="text-amber-600 dark:text-amber-400" />
          <Text className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">{label}</Text>
        </View>
        <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">{description}</Text>
      </View>
      <RowButton label={action} accessibilityLabel={actionLabel} onPress={onPress} />
    </View>
  );
}

// iOS can't ring a local notification on repeat; its closest thing is
// time-sensitive delivery.
const ALARM_MODE =
  Platform.OS === 'android'
    ? { label: 'Alarm mode', description: 'Rings with your alarm tone until you snooze or dismiss it' }
    : { label: 'Time-sensitive', description: 'Reminders get through Focus and notification summaries' };

const ICON_TILE = 'h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 dark:border-white/[0.06] dark:bg-white/[0.04]';

/**
 * Native port of components/settings/RemindersRows.tsx — the permission
 * dance, the per-device reminder settings, and "Send test". Where the web
 * subscribes this browser to Web Push (so a Worker can reach it when the PWA
 * is closed), native schedules local notifications with the OS directly —
 * they fire whether or not PlanR is open, with no subscription to manage — so
 * the copy is the web's background-capable variant.
 *
 * Native adds how reminders alert (alarm mode, kept on this device) and, on
 * Android, the two device settings that make reminders late — exact-alarm
 * access and battery optimization — each with a shortcut to fix it. Every
 * status is re-read on return from the system Settings app.
 */
export default function RemindersRows() {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [support, setSupport] = useState<NotificationSupport>('unsupported');
  const [delivery, setDelivery] = useState<ReminderDelivery>(getReminderDelivery);
  const [exactAlarm, setExactAlarm] = useState<ExactAlarmAccess>('not-needed');
  const [batteryOptimized, setBatteryOptimized] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<TestNotificationResult | null>(null);
  const clearResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      void Promise.all([notificationSupport(), exactAlarmAccess(), batteryOptimizationOn()]).then(([s, exact, battery]) => {
        if (cancelled) return;
        setSupport(s);
        setExactAlarm(exact);
        setBatteryOptimized(battery);
        setSettings(getReminderSettings());
      });
    };
    check();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  const patch = useCallback((p: Partial<ReminderSettings>) => {
    const next = setReminderSettings(p);
    setSettings(next);
  }, []);

  const handleMainToggle = useCallback(
    async (next: boolean) => {
      if (!next) {
        patch({ enabled: false });
        void cancelAllReminders();
        return;
      }
      const perm = support === 'granted' ? 'granted' : await requestNotificationPermission();
      setSupport(perm);
      patch({ enabled: perm === 'granted' });
    },
    [support, patch],
  );

  const handleSendTest = useCallback(async () => {
    if (sendingTest) return;
    haptic('light');
    setSendingTest(true);
    setTestResult(null);
    if (clearResultTimer.current) clearTimeout(clearResultTimer.current);
    try {
      setTestResult(await sendTestNotification());
    } catch {
      setTestResult({ ok: false, error: 'Something went wrong sending the test.' });
    } finally {
      setSendingTest(false);
      clearResultTimer.current = setTimeout(() => setTestResult(null), 6000);
    }
  }, [sendingTest]);

  useEffect(
    () => () => {
      if (clearResultTimer.current) clearTimeout(clearResultTimer.current);
    },
    [],
  );

  if (!settings) return null;

  if (support === 'unsupported') {
    return (
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <View className={ICON_TILE}>
          <Icon icon={IconBellOff} size={14} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Reminders</Text>
          <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">Notifications aren't available in this build.</Text>
        </View>
      </View>
    );
  }

  const enabled = settings.enabled && support === 'granted';

  return (
    <View className="px-4 py-3.5">
      <View className="flex-row items-center gap-3">
        <View className={ICON_TILE}>
          <Icon icon={IconBell} size={14} strokeWidth={2} className="text-neutral-500 dark:text-neutral-300" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[13px] font-semibold text-neutral-800 dark:text-white">Reminders</Text>
          <Text className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">At your task and routine times — even when PlanR is closed</Text>
        </View>
        <Toggle on={enabled} onChange={(v) => void handleMainToggle(v)} label="Reminders" />
      </View>

      {support === 'denied' && (
        <Text className="mt-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          Notifications are blocked for PlanR — allow them in Settings, then try again.
        </Text>
      )}

      {enabled && (
        <View className="mt-2 border-t border-neutral-100 dark:border-white/[0.05]">
          <SubRow label="Task start times" on={settings.tasks} onChange={(v) => patch({ tasks: v })} />
          <View className="border-t border-neutral-100 dark:border-white/[0.05]">
            <SubRow label="Routine times" on={settings.rituals} onChange={(v) => patch({ rituals: v })} />
          </View>
          <View className="border-t border-neutral-100 dark:border-white/[0.05]">
            <SubRow
              label="Evening nudge"
              description="One heads-up if tasks are still open"
              on={settings.streakNudge}
              onChange={(v) => patch({ streakNudge: v })}
            />
          </View>
          {settings.streakNudge && (
            <View className="flex-row items-center gap-3 border-t border-neutral-100 py-2.5 dark:border-white/[0.05]">
              <Text className="min-w-0 flex-1 text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">Nudge time</Text>
              <Select value={settings.nudgeTime} options={NUDGE_OPTIONS} onChange={(v) => patch({ nudgeTime: v })} label="Nudge time" icon={IconClock} className="w-36" />
            </View>
          )}
          <View className="border-t border-neutral-100 dark:border-white/[0.05]">
            <SubRow
              label={ALARM_MODE.label}
              description={ALARM_MODE.description}
              on={delivery.alarmMode}
              onChange={(v) => setDelivery(setReminderDelivery({ alarmMode: v }))}
            />
          </View>
          {exactAlarm === 'denied' && (
            <FixRow
              label="Exact timing is off"
              description="Reminders can arrive minutes late. Allow “Alarms & reminders” for PlanR."
              action="Allow"
              actionLabel="Allow exact timing"
              onPress={() => void openExactAlarmSettings()}
            />
          )}
          {batteryOptimized && (
            <FixRow
              label="Battery optimization is on"
              description="Some phones hold back reminders to save battery. Set PlanR to Unrestricted."
              action="Fix"
              actionLabel="Turn off battery optimization"
              onPress={() => void openBatteryOptimizationSettings()}
            />
          )}
          <View className="flex-row items-center justify-between gap-3 border-t border-neutral-100 py-2.5 dark:border-white/[0.05]">
            <View className="min-w-0 flex-1">
              <Text className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">Test this device</Text>
              {testResult && (
                <Text
                  className={`mt-0.5 text-[11px] leading-snug ${
                    testResult.ok ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                  }`}
                >
                  {testResult.ok ? 'Sent — check your notifications' : testResult.error}
                </Text>
              )}
            </View>
            <RowButton label={sendingTest ? 'Sending…' : 'Send test'} icon={IconSend} onPress={() => void handleSendTest()} disabled={sendingTest} />
          </View>
        </View>
      )}
    </View>
  );
}
