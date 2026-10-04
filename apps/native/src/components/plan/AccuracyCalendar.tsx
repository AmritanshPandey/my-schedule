import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconChevronLeft, IconChevronRight, IconLayoutGrid, IconPlus } from '@tabler/icons-react-native';
import type { DayKey, Task } from '@planr/core/lib/scheduleTypes';
import { todayISO, localISODate } from '@planr/core/lib/dateUtils';
import { completedOnDate } from '@planr/core/lib/consistency/calculateDailyStats';
import { isTrackedTask } from '@planr/core/lib/taskCompletion';
import { isTaskScheduledOn } from '@planr/core/lib/taskOccurrence';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

// ── Constants ─────────────────────────────────────────────────────────────────

const JS_DOW_KEY: DayKey[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];
const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ── Types ─────────────────────────────────────────────────────────────────────

type DayStatus = 'completed' | 'missed' | 'partial' | 'upcoming' | 'none';

interface CalDay {
  day: number;
  dateISO: string;
  status: DayStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCalendarDays(
  year: number,
  month: number,
  planId: string,
  activities: Record<DayKey, Task[]>,
  today: string,
  planStart?: string,
  planEnd?: string,
  /** Settings → Tracking → 'Tracking starts' (schedule.preferences?.startDate). */
  trackingStart?: string,
): CalDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: CalDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const iso = localISODate(date);
    const dayKey = JS_DOW_KEY[date.getDay()];

    if ((planStart && iso < planStart) || (planEnd && iso > planEnd) || (trackingStart && iso < trackingStart)) {
      result.push({ day: d, dateISO: iso, status: 'none' });
      continue;
    }

    const tasks = (activities[dayKey] ?? []).filter(
      (t) => t.planId === planId && isTrackedTask(t) && isTaskScheduledOn(t, iso, true, trackingStart),
    );

    if (!tasks.length) {
      result.push({ day: d, dateISO: iso, status: 'none' });
      continue;
    }

    if (iso > today) {
      result.push({ day: d, dateISO: iso, status: 'upcoming' });
      continue;
    }

    const done = completedOnDate(tasks, iso, iso === today);
    const status: DayStatus =
      done === tasks.length ? 'completed' : done > 0 ? 'partial' : 'missed';
    result.push({ day: d, dateISO: iso, status });
  }

  return result;
}

function cellStyles(status: DayStatus): { box: string; text: string } {
  switch (status) {
    case 'completed':
      return { box: 'bg-emerald-100 dark:bg-emerald-500/[0.18]', text: 'text-emerald-900 dark:text-emerald-300' };
    case 'missed':
      return { box: 'bg-red-100 dark:bg-red-500/[0.18]', text: 'text-red-700 dark:text-red-300' };
    case 'partial':
      return { box: 'bg-amber-100 dark:bg-amber-500/[0.18]', text: 'text-amber-800 dark:text-amber-300' };
    case 'upcoming':
      return { box: 'bg-neutral-100 dark:bg-white/[0.05]', text: 'text-neutral-500 dark:text-neutral-400' };
    case 'none':
      return { box: '', text: 'text-neutral-400 dark:text-neutral-500' };
  }
}

const CELL = { width: `${100 / 7}%` as const, padding: 3 };

/**
 * Native port of components/plan/AccuracyCalendar.tsx — a plan's month grid of
 * completed / partial / missed / upcoming days with the month accuracy.
 */
export default function AccuracyCalendar({
  planId,
  activities,
  planStartDate,
  planEndDate,
  trackingStart,
  onAddTask,
}: {
  planId: string;
  activities: Record<DayKey, Task[]>;
  planStartDate?: string;
  planEndDate?: string;
  trackingStart?: string;
  onAddTask: () => void;
}) {
  const today = useMemo(() => todayISO(), []);
  const now = new Date(today + 'T00:00:00');

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const calDays = useMemo(
    () => buildCalendarDays(year, month, planId, activities, today, planStartDate, planEndDate, trackingStart),
    [year, month, planId, activities, today, planStartDate, planEndDate, trackingStart],
  );

  const stats = useMemo(() => {
    let completed = 0, missed = 0, partial = 0, upcoming = 0;
    for (const d of calDays) {
      if (d.status === 'completed') completed++;
      else if (d.status === 'missed') missed++;
      else if (d.status === 'partial') partial++;
      else if (d.status === 'upcoming') upcoming++;
    }
    const scheduled = completed + missed + partial;
    const accuracy = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
    return { completed, missed, partial, upcoming, accuracy };
  }, [calDays]);

  const firstDow = new Date(year, month, 1).getDay();

  const hasTasks = useMemo(() => Object.values(activities).some((tasks) => tasks.some((t) => t.planId === planId)), [activities, planId]);

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
  }

  if (!hasTasks) {
    return (
      <View className="items-center rounded-[24px] border border-neutral-200 bg-white px-6 py-10 dark:border-white/[0.08] dark:bg-neutral-900">
        <View className="mb-3 h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
          <Icon icon={IconLayoutGrid} size={24} strokeWidth={1.8} className="text-neutral-500 dark:text-neutral-400" />
        </View>
        <Text className="mb-1 text-[14px] font-semibold text-neutral-900 dark:text-white">No linked tasks yet</Text>
        <Text className="mb-4 max-w-[200px] text-center text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          Link activities to this plan to start tracking accuracy.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onAddTask}
          className="flex-row items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 active:bg-neutral-50 dark:border-white/10 dark:active:bg-white/[0.04]"
        >
          <Icon icon={IconPlus} size={16} strokeWidth={1.5} className="text-neutral-600 dark:text-neutral-400" />
          <Text className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">Add activity</Text>
        </Pressable>
      </View>
    );
  }

  const statCell = (value: string | number, label: string, tone: string) => (
    <View className="flex-1 items-center">
      <Text className={`text-[22px] font-extrabold leading-none tabular-nums ${tone}`}>{value}</Text>
      <Text className="mt-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{label}</Text>
    </View>
  );

  return (
    <View>
      <View className="mb-3 flex-row items-start justify-between">
        <View>
          <Text accessibilityRole="header" className="text-[20px] font-bold leading-tight tracking-[-0.35px] text-neutral-950 dark:text-white">
            Accuracy
          </Text>
          <Text className="mt-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            {MONTHS[month]} · {stats.completed + stats.missed + stats.partial} scheduled days
          </Text>
        </View>
        <Text className="text-[26px] font-extrabold leading-none tracking-tight text-emerald-600 dark:text-emerald-400">{stats.accuracy}%</Text>
      </View>

      <View className="rounded-[20px] border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
        <View className="px-4 pt-[18px]">
          <View className="mb-4 flex-row items-center justify-between">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={prevMonth}
              className="h-7 w-7 items-center justify-center rounded-[7px] active:bg-neutral-100 dark:active:bg-white/[0.06]"
            >
              <Icon icon={IconChevronLeft} size={24} strokeWidth={2} className="text-neutral-600 dark:text-neutral-400" />
            </Pressable>
            <Text className="text-[16px] font-bold tracking-[-0.3px] text-neutral-900 dark:text-white">
              {MONTHS[month]} {year}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={nextMonth}
              className="h-7 w-7 items-center justify-center rounded-[7px] active:bg-neutral-100 dark:active:bg-white/[0.06]"
            >
              <Icon icon={IconChevronRight} size={24} strokeWidth={2} className="text-neutral-600 dark:text-neutral-400" />
            </Pressable>
          </View>

          <View className="mb-2 flex-row">
            {DOW_LABELS.map((label) => (
              <View key={label} style={CELL}>
                <Text className="py-1 text-center text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{label}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {Array.from({ length: firstDow }, (_, i) => (
              <View key={`blank-${i}`} style={CELL} />
            ))}
            {calDays.map(({ day, dateISO, status }) => {
              const tone = cellStyles(status);
              return (
                <View key={dateISO} style={CELL}>
                  <View accessibilityLabel={`${dateISO} ${status}`} className={`aspect-square items-center justify-center rounded-[10px] ${tone.box}`}>
                    <Text className={`text-[13px] font-semibold ${tone.text}`}>{day}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <View className="mt-[18px] flex-row gap-2 border-t border-neutral-100 pt-4 dark:border-white/[0.06]">
            {statCell(stats.completed, 'Completed', 'text-emerald-600 dark:text-emerald-400')}
            {statCell(stats.missed, 'Missed', 'text-red-500 dark:text-red-400')}
            {statCell(stats.upcoming, 'Remaining', 'text-neutral-500 dark:text-neutral-400')}
            {statCell(`${stats.accuracy}%`, 'Accuracy', 'text-neutral-950 dark:text-white')}
          </View>
        </View>

        <View className="mt-4 flex-row flex-wrap justify-center gap-x-4 gap-y-2 border-t border-neutral-100 px-4 pb-4 pt-3.5 dark:border-white/[0.06]">
          {[
            { label: 'Completed', cls: 'bg-emerald-500 dark:bg-emerald-400' },
            { label: 'Missed', cls: 'bg-red-500 dark:bg-red-400' },
            { label: 'Partial', cls: 'bg-amber-500 dark:bg-amber-400' },
            { label: 'Upcoming', cls: 'bg-neutral-100 border border-neutral-200 dark:bg-white/[0.1] dark:border-white/[0.05]' },
          ].map(({ label, cls }) => (
            <View key={label} className="flex-row items-center gap-1.5">
              <View className={`h-3 w-3 shrink-0 rounded-[3px] ${cls}`} />
              <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
