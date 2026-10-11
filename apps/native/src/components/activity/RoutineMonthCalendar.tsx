import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react-native';
import type { RitualCalendarDay, RitualCalendarStatus } from '@planr/core/lib/consistency/ritualCalendar';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const DOW_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** One seventh of the row, with the web grid's gap carried as padding. */
const CELL = { width: `${100 / 7}%` as const, padding: 3 };

function cellStyles(status: RitualCalendarStatus): { box: string; text: string } {
  switch (status) {
    case 'complete':
      return { box: 'bg-emerald-100 dark:bg-emerald-500/[0.18]', text: 'text-emerald-900 dark:text-emerald-300' };
    case 'missed':
      return { box: 'bg-red-100 dark:bg-red-500/[0.18]', text: 'text-red-700 dark:text-red-300' };
    case 'future':
      return { box: 'bg-neutral-100 dark:bg-white/[0.05]', text: 'text-neutral-500 dark:text-neutral-400' };
    case 'not-scheduled':
      return { box: '', text: 'text-neutral-400 dark:text-neutral-500' };
  }
}

interface RoutineMonthCalendarProps {
  year: number;
  month: number; // 0-indexed
  days: RitualCalendarDay[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay?: (dateISO: string) => void;
  title?: string;
}

/**
 * Native port of components/activity/RoutineMonthCalendar.tsx — a routine's
 * month of complete / missed / upcoming days with the adherence percentage.
 * The web's CSS grid becomes a wrapped row of seventh-width cells.
 */
export default function RoutineMonthCalendar({
  year,
  month,
  days,
  onPrevMonth,
  onNextMonth,
  onSelectDay,
  title = 'This month',
}: RoutineMonthCalendarProps) {
  const firstDow = new Date(year, month, 1).getDay();

  const stats = useMemo(() => {
    let complete = 0,
      missed = 0;
    for (const d of days) {
      if (d.status === 'complete') complete++;
      else if (d.status === 'missed') missed++;
    }
    const scheduled = complete + missed;
    const pct = scheduled > 0 ? Math.round((complete / scheduled) * 100) : 0;
    return { complete, missed, pct, scheduled };
  }, [days]);

  return (
    <View>
      <View className="mb-3 flex-row items-start justify-between">
        <View>
          <Text accessibilityRole="header" className="text-[15px] font-bold leading-tight tracking-[-0.2px] text-neutral-950 dark:text-white">
            {title}
          </Text>
          <Text className="mt-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            {MONTHS[month]} · {stats.scheduled} scheduled days
          </Text>
        </View>
        {stats.scheduled > 0 && (
          <Text className="text-[20px] font-extrabold leading-none tracking-tight text-emerald-600 dark:text-emerald-400">{stats.pct}%</Text>
        )}
      </View>

      <View className="rounded-[20px] border border-neutral-200 bg-white px-4 pb-4 pt-[18px] dark:border-white/[0.08] dark:bg-neutral-900">
        <View className="mb-4 flex-row items-center justify-between">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={onPrevMonth}
            hitSlop={8}
            className="h-7 w-7 items-center justify-center rounded-[7px] active:bg-neutral-100 dark:active:bg-white/[0.06]"
          >
            <Icon icon={IconChevronLeft} size={22} strokeWidth={2} className="text-neutral-600 dark:text-neutral-400" />
          </Pressable>
          <Text className="text-[15px] font-bold tracking-[-0.2px] text-neutral-900 dark:text-white">
            {MONTHS[month]} {year}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={onNextMonth}
            hitSlop={8}
            className="h-7 w-7 items-center justify-center rounded-[7px] active:bg-neutral-100 dark:active:bg-white/[0.06]"
          >
            <Icon icon={IconChevronRight} size={22} strokeWidth={2} className="text-neutral-600 dark:text-neutral-400" />
          </Pressable>
        </View>

        <View className="mb-2 flex-row">
          {DOW_LABELS.map((label) => (
            <View key={label} style={{ width: CELL.width }} className="py-1">
              <Text className="text-center text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{label}</Text>
            </View>
          ))}
        </View>

        <View className="flex-row flex-wrap">
          {Array.from({ length: firstDow }, (_, i) => (
            <View key={`blank-${i}`} style={CELL}>
              <View className="aspect-square" />
            </View>
          ))}
          {days.map(({ day, dateISO, status }) => {
            const tone = cellStyles(status);
            return (
              <View key={dateISO} style={CELL}>
                <Pressable
                  accessibilityLabel={`${dateISO} ${status}`}
                  onPress={onSelectDay ? () => onSelectDay(dateISO) : undefined}
                  disabled={!onSelectDay}
                  className={`aspect-square items-center justify-center rounded-[10px] ${tone.box} ${onSelectDay ? 'active:scale-95' : ''}`}
                >
                  <Text className={`text-[13px] font-semibold ${tone.text}`}>{day}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View className="mt-3 flex-row flex-wrap justify-center gap-x-4 gap-y-2 border-t border-neutral-100 pt-3.5 dark:border-white/[0.06]">
          {[
            { label: 'Complete', cls: 'bg-emerald-500 dark:bg-emerald-400' },
            { label: 'Missed', cls: 'bg-red-500 dark:bg-red-400' },
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
