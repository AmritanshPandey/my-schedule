import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Dimensions, Modal, Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  IconCalendarEvent,
  IconCalendarStats,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconInfinity,
  IconListCheck,
  IconMoon,
  IconPlus,
  IconRepeat,
  IconSun,
  IconSunrise,
} from '@tabler/icons-react-native';
import { useColorScheme } from 'nativewind';
import type { DayKey, Ritual, RitualCompletion } from '@planr/core/lib/scheduleTypes';
import { DAYS } from '@planr/core/lib/scheduleConstants';
import { localISODate, todayISO } from '@planr/core/lib/dateUtils';
import { ritualScheduledOnDate } from '@planr/core/lib/ritualRecurrence';
import { groupRitualsIntoBuckets, type RitualTimeBucketKey } from '@planr/core/lib/ritualGrouping';
import { summarizeRoutineDay } from '@planr/core/lib/consistency/ritualDayStatus';
import { buildAllRoutinesMonthDays } from '@planr/core/lib/consistency/ritualCalendar';
import { buildRoutineInsights } from '@planr/core/lib/consistency/routineInsights';
import { haptic } from '../../lib/haptics';
import EmptyState from '../ui/EmptyState';
import { MainTitleSection, CtaActionButton } from '../ui/MainTitleSection';
import ProgressBar from '../ui/ProgressBar';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useModalTurn } from '../../lib/modalTurn';
import { RitualSheet } from './RitualSheet';
import RoutineRow from './RoutineRow';
import RoutineMonthCalendar from './RoutineMonthCalendar';
import RoutineInsightsSection from './RoutineInsightsSection';
import TourTarget from '../onboarding/TourTarget';

// JS getDay() 0=Sunday → DayKey
const JS_TO_DAY: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const DAY_SHORT: Record<DayKey, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

const BUCKET_ICONS: Record<RitualTimeBucketKey, TablerIcon> = {
  morning: IconSunrise,
  afternoon: IconSun,
  evening: IconMoon,
  anytime: IconInfinity,
};

const SEVENTH = `${100 / 7}%` as const;

function appliesToDay(ritual: Ritual, dateISO: string, trackingStart?: string): boolean {
  return ritualScheduledOnDate(ritual, dateISO, trackingStart);
}

// The web's `pt-4 first:pt-1` — each header is the first child of its own
// group, so `first:` wins and every header renders at pt-1.
function GroupHeader({ bucketKey, label, count }: { bucketKey: RitualTimeBucketKey; label: string; count: number }) {
  return (
    <View className="flex-row items-center gap-2 pb-1 pt-1">
      <Icon icon={BUCKET_ICONS[bucketKey]} size={14} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
      <Text className="text-[12px] font-bold text-neutral-600 dark:text-neutral-300">{label}</Text>
      <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{count}</Text>
    </View>
  );
}

/** Progress ring for a single day in the week strip. Stroke fills by ratio. */
function DayRing({ ratio, size = 30, stroke = 3 }: { ratio: number; size?: number; stroke?: number }) {
  const { colorScheme } = useColorScheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, ratio)) * circ;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        stroke={colorScheme === 'dark' ? 'rgba(255,255,255,0.10)' : '#E5E5E5'}
      />
      {dash > 0 && (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          stroke="#00C950"
        />
      )}
    </Svg>
  );
}

function dateForCurrentWeekDay(day: DayKey): string {
  const today = new Date();
  const todayIndex = JS_TO_DAY[today.getDay()];
  const delta = DAYS.indexOf(day) - DAYS.indexOf(todayIndex);
  const date = new Date(today);
  date.setDate(today.getDate() + delta);
  return localISODate(date);
}

function formatDateButtonLabel(dateISO: string): string {
  const [year, month, day] = dateISO.split('-');
  return year && month && day ? `${day}/${month}/${year}` : dateISO;
}

function parseISODate(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00`);
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(viewMonth: Date, selectedISO: string) {
  const firstOfMonth = monthStart(viewMonth);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - mondayOffset);
  const today = todayISO();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = localISODate(date);
    return {
      iso,
      dayNumber: date.getDate(),
      inMonth: date.getMonth() === viewMonth.getMonth(),
      isSelected: iso === selectedISO,
      isToday: iso === today,
    };
  });
}

/**
 * The web's date button + anchored calendar popover. On a phone the web hides
 * the date label (`sm:inline`), leaving the icon button; the popover becomes a
 * transparent Modal positioned under the button (measured on open), with a
 * backdrop tap standing in for the web's outside-pointerdown close.
 */
function DateActionButton({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const buttonRef = useRef<ComponentRef<typeof View>>(null);
  const [open, setOpen] = useState(false);
  const popoverTurn = useModalTurn(open, 300);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const [viewMonth, setViewMonth] = useState(() => monthStart(parseISODate(value)));
  const calendarDays = useMemo(() => buildCalendarDays(viewMonth, value), [viewMonth, value]);
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  useEffect(() => {
    setViewMonth(monthStart(parseISODate(value)));
  }, [value]);

  function selectDate(dateISO: string) {
    haptic('light');
    onChange(dateISO);
    setOpen(false);
  }

  function toggle() {
    setViewMonth(monthStart(parseISODate(value)));
    if (open) {
      setOpen(false);
      return;
    }
    buttonRef.current?.measureInWindow((x, y, width, height) => {
      const screenWidth = Dimensions.get('window').width;
      setAnchor({ top: y + height + 8, right: Math.max(16, screenWidth - (x + width)) });
      setOpen(true);
    });
  }

  return (
    <View ref={buttonRef} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Select routine date, ${formatDateButtonLabel(value)}`}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        className={`min-h-[44px] flex-row items-center gap-2 rounded-full border-[1.5px] px-3 py-[10px] active:scale-[0.97] ${
          open
            ? 'border-neutral-300 bg-neutral-100 dark:border-white/20 dark:bg-neutral-800'
            : 'border-neutral-200 bg-white active:bg-neutral-100 dark:border-white/15 dark:bg-neutral-900 dark:active:bg-neutral-800'
        }`}
      >
        <Icon icon={IconCalendarEvent} size={14} strokeWidth={2.3} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
      </Pressable>

      <Modal visible={popoverTurn} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable accessibilityLabel="Close date picker" onPress={() => setOpen(false)} style={{ flex: 1 }}>
          {anchor && (
            <Pressable
              accessibilityViewIsModal
              accessibilityLabel="Select routine date"
              onPress={() => {}}
              style={{ position: 'absolute', top: anchor.top, right: anchor.right, width: 292, maxWidth: Dimensions.get('window').width - 32 }}
              className="rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900"
            >
              <View className="mb-3 flex-row items-center justify-between gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  onPress={() => setViewMonth((current) => addMonths(current, -1))}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.07]"
                >
                  <Icon icon={IconChevronLeft} size={16} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
                </Pressable>
                <Text className="text-[14px] font-extrabold text-neutral-950 dark:text-white">{monthLabel}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  onPress={() => setViewMonth((current) => addMonths(current, 1))}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.07]"
                >
                  <Icon icon={IconChevronRight} size={16} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
                </Pressable>
              </View>

              <View className="mb-1 flex-row">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => (
                  <View key={`${day}-${index}`} style={{ width: SEVENTH }} className="h-7 items-center justify-center">
                    <Text className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">{day}</Text>
                  </View>
                ))}
              </View>

              <View className="flex-row flex-wrap">
                {calendarDays.map((day) => (
                  <View key={day.iso} style={{ width: SEVENTH, padding: 2 }}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={day.isToday ? `Today, ${day.iso}` : day.iso}
                      accessibilityState={{ selected: day.isSelected }}
                      onPress={() => selectDate(day.iso)}
                      className={`h-8 items-center justify-center rounded-full ${
                        day.isSelected
                          ? 'bg-neutral-950 dark:bg-white'
                          : day.isToday
                            ? 'border border-neutral-950 active:bg-neutral-100 dark:border-white dark:active:bg-white/[0.08]'
                            : 'active:bg-neutral-100 dark:active:bg-white/[0.07]'
                      }`}
                    >
                      <Text
                        className={`text-[12px] font-extrabold tabular-nums ${
                          day.isSelected
                            ? 'text-white dark:text-neutral-950'
                            : day.isToday
                              ? 'text-neutral-950 dark:text-white'
                              : day.inMonth
                                ? 'text-neutral-700 dark:text-neutral-200'
                                : 'text-neutral-400 dark:text-neutral-500'
                        }`}
                      >
                        {day.dayNumber}
                      </Text>
                    </Pressable>
                  </View>
                ))}
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={() => selectDate(todayISO())}
                className="mt-3 h-10 w-full items-center justify-center rounded-full border border-neutral-200 active:bg-neutral-100 dark:border-white/10 dark:active:bg-white/[0.07]"
              >
                <Text className="text-[13px] font-extrabold text-neutral-700 dark:text-neutral-300">Today</Text>
              </Pressable>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface RitualViewProps {
  rituals: Ritual[];
  ritualCompletions: RitualCompletion[];
  /** Settings → Tracking → "Tracking starts" (schedule.preferences?.startDate). */
  trackingStart?: string;
  /** Mark a routine done for a day, rated 1–100 for how closely it was followed. */
  onMarkDone: (ritualId: string, dateISO: string, followed: number) => void;
  onUnmarkDone: (ritualId: string, dateISO: string) => void;
  onOpenDetail: (ritual: Ritual) => void;
  onAdd: (data: Omit<Ritual, 'id'>) => void;
  onUpdate: (id: string, data: Omit<Ritual, 'id'>) => void;
  onDelete: (id: string) => void;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}

/**
 * Native port of components/activity/RitualView.tsx (the Routine tab) at
 * phone width: title + view toggle + date picker + "Add routine", the earned
 * "all done" banner, the in-progress bar, the week strip of completion rings,
 * routine rows grouped by time of day, and the month consistency calendar
 * with insights. The web's xl-only sidebar has no phone layout and is omitted,
 * as it is on the PWA at this width.
 */
export default function RitualView({
  rituals,
  ritualCompletions,
  trackingStart,
  onMarkDone,
  onUnmarkDone,
  onOpenDetail,
  onAdd,
  onUpdate,
  onDelete,
  addOpen,
  onAddOpenChange,
}: RitualViewProps) {
  const [editRitual, setEditRitual] = useState<Ritual | null>(null);
  const [selectedDateISO, setSelectedDateISO] = useState(() => todayISO());
  const [viewMode, setViewMode] = useState<'day' | 'month'>('day');
  const monthNow = new Date(`${todayISO()}T00:00:00`);
  const [calYear, setCalYear] = useState(monthNow.getFullYear());
  const [calMonth, setCalMonth] = useState(monthNow.getMonth());
  const selectedDay = JS_TO_DAY[new Date(`${selectedDateISO}T00:00:00`).getDay()] as DayKey;

  const sorted = useMemo(
    () =>
      [...rituals].sort((a, b) => {
        const ao = a.sortOrder ?? Infinity,
          bo = b.sortOrder ?? Infinity;
        return ao !== bo ? ao - bo : a.time.localeCompare(b.time);
      }),
    [rituals],
  );

  const filteredRituals = useMemo(() => {
    return sorted.filter((r) => appliesToDay(r, selectedDateISO, trackingStart));
  }, [sorted, selectedDateISO, trackingStart]);

  // The day said back to you: what's done, what's open, and how much of the
  // routine you followed overall — the number that matters more than a tally.
  const daySummary = useMemo(
    () => summarizeRoutineDay(filteredRituals, ritualCompletions, selectedDateISO),
    [filteredRituals, ritualCompletions, selectedDateISO],
  );
  const completedToday = daySummary.done;
  const total = daySummary.total;
  const pct = daySummary.followedPct ?? 0;
  const allDone = total > 0 && completedToday === total;
  const dayWord = selectedDateISO === todayISO() ? 'today' : DAY_SHORT[selectedDay];

  // Week strip carries the reward loop: each day's ring fills with how much of
  // that day's routine was followed, not the raw schedule count.
  const weekStrip = useMemo(
    () =>
      DAYS.map((day) => {
        const dateISO = dateForCurrentWeekDay(day);
        const summary = summarizeRoutineDay(
          sorted.filter((r) => appliesToDay(r, dateISO, trackingStart)),
          ritualCompletions,
          dateISO,
        );
        return {
          day,
          dateISO,
          due: summary.total,
          done: summary.done,
          followedPct: summary.followedPct ?? 0,
          dayNum: new Date(`${dateISO}T00:00:00`).getDate(),
          isToday: dateISO === todayISO(),
        };
      }),
    [sorted, ritualCompletions, trackingStart],
  );

  // Group the selected day's routines into morning / afternoon / evening / anytime.
  const grouped = useMemo(() => groupRitualsIntoBuckets(filteredRituals), [filteredRituals]);

  const monthCalendarDays = useMemo(
    () => buildAllRoutinesMonthDays(sorted, ritualCompletions, calYear, calMonth, todayISO(), trackingStart),
    [sorted, ritualCompletions, calYear, calMonth, trackingStart],
  );

  const routineInsights = useMemo(
    () => buildRoutineInsights(sorted, ritualCompletions, todayISO(), trackingStart),
    [sorted, ritualCompletions, trackingStart],
  );

  function prevCalMonth() {
    if (calMonth === 0) {
      setCalYear((y) => y - 1);
      setCalMonth(11);
    } else setCalMonth((m) => m - 1);
  }
  function nextCalMonth() {
    if (calMonth === 11) {
      setCalYear((y) => y + 1);
      setCalMonth(0);
    } else setCalMonth((m) => m + 1);
  }

  return (
    <>
      <View className="px-4 py-6">
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <MainTitleSection
          label="Daily practice"
          title="Routines"
          actions={
            <>
              {rituals.length > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={viewMode === 'day' ? 'Show month view' : 'Show day view'}
                  accessibilityState={{ selected: viewMode === 'month' }}
                  onPress={() => {
                    haptic('light');
                    setViewMode((m) => (m === 'day' ? 'month' : 'day'));
                  }}
                  className={`h-11 w-11 items-center justify-center rounded-full border-[1.5px] active:scale-[0.97] ${
                    viewMode === 'month'
                      ? 'border-neutral-300 bg-neutral-100 dark:border-white/20 dark:bg-neutral-800'
                      : 'border-neutral-200 bg-white active:bg-neutral-100 dark:border-white/15 dark:bg-neutral-900 dark:active:bg-neutral-800'
                  }`}
                >
                  <Icon
                    icon={viewMode === 'day' ? IconCalendarStats : IconListCheck}
                    size={16}
                    strokeWidth={2.2}
                    className={viewMode === 'month' ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}
                  />
                </Pressable>
              )}
              {rituals.length > 0 && viewMode === 'day' && <DateActionButton value={selectedDateISO} onChange={setSelectedDateISO} />}
              <TourTarget id="new-item-button">
                <CtaActionButton
                  label="Add routine"
                  icon={<Icon icon={IconPlus} size={14} strokeWidth={2.5} className="text-neutral-700 dark:text-neutral-300" />}
                  onClick={() => {
                    haptic('medium');
                    onAddOpenChange(true);
                  }}
                />
              </TourTarget>
            </>
          }
          className="mb-4"
        />

        {/* ── Month view — aggregate consistency calendar ──────────────────── */}
        {rituals.length > 0 && viewMode === 'month' && (
          <View className="gap-5">
            <RoutineMonthCalendar
              year={calYear}
              month={calMonth}
              days={monthCalendarDays}
              onPrevMonth={prevCalMonth}
              onNextMonth={nextCalMonth}
              title="Routine consistency"
              onSelectDay={(iso) => {
                haptic('light');
                setSelectedDateISO(iso);
                setViewMode('day');
              }}
            />
            <RoutineInsightsSection insights={routineInsights} />
          </View>
        )}

        {/* ── Earned "all done" moment ─────────────────────────────────────── */}
        {viewMode === 'day' && allDone && (
          <View className="mb-5 flex-row items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]">
            <View className="h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500">
              <Icon icon={IconCheck} size={20} strokeWidth={3} className="text-white" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[16px] font-black leading-tight text-emerald-700 dark:text-emerald-300">Daily practice complete</Text>
              <Text className="mt-0.5 text-[13px] font-semibold text-emerald-700/80 dark:text-emerald-400/80">
                All {total} done for {DAY_SHORT[selectedDay]}, and you followed {pct}% of it.
              </Text>
            </View>
          </View>
        )}

        {/* ── The day so far (in progress) ─────────────────────────────────── */}
        {viewMode === 'day' && total > 0 && !allDone && (
          <View testID="routine-day-summary" className="mb-5 rounded-2xl border border-neutral-200/80 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
            <View className="flex-row items-baseline justify-between gap-3">
              <Text className="min-w-0 flex-1 text-[15px] font-extrabold leading-snug text-neutral-950 dark:text-white">
                {completedToday === 0
                  ? `Nothing marked ${dayWord === 'today' ? 'yet today' : `for ${dayWord}`}`
                  : `You followed ${pct}% ${dayWord === 'today' ? 'today' : `on ${dayWord}`}`}
              </Text>
              <Text className="shrink-0 text-[13px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
                {completedToday}/{total} done
              </Text>
            </View>
            <View className="mt-2.5">
              <ProgressBar pct={pct} height={6} fillClassName="bg-green-500" />
            </View>
            {daySummary.doneTitles.length > 0 && (
              <Text className="mt-2.5 text-[13px] leading-snug text-neutral-600 dark:text-neutral-300">
                <Text className="font-bold text-neutral-800 dark:text-neutral-100">Completed: </Text>
                {daySummary.doneTitles.join(', ')}
              </Text>
            )}
            {daySummary.openTitles.length > 0 && (
              <Text className="mt-1 text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">
                <Text className="font-semibold">Still open: </Text>
                {daySummary.openTitles.join(', ')}
              </Text>
            )}
          </View>
        )}

        {/* ── Week strip — completion per day (the reward loop) ────────────── */}
        {viewMode === 'day' && rituals.length > 0 && (
          <View className="mb-6 flex-row" style={{ marginHorizontal: -3 }}>
            {weekStrip.map(({ day, due, done, followedPct, dayNum, isToday }) => {
              const sel = selectedDay === day;
              const ratio = due > 0 ? followedPct / 100 : 0;
              const complete = due > 0 && done === due;
              return (
                <View key={day} style={{ width: SEVENTH, paddingHorizontal: 3 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${DAY_SHORT[day]} ${dayNum}, ${due > 0 ? `${done} of ${due} done, ${followedPct}% followed` : 'nothing scheduled'}`}
                    accessibilityState={{ selected: sel }}
                    onPress={() => setSelectedDateISO(dateForCurrentWeekDay(day))}
                    className={`w-full items-center gap-1.5 rounded-2xl py-2.5 ${
                      sel ? 'border border-neutral-900/10 bg-neutral-100 dark:border-white/15 dark:bg-white/[0.06]' : 'border border-transparent active:bg-neutral-50 dark:active:bg-white/[0.04]'
                    }`}
                  >
                    <Text
                      className={`text-[12px] font-semibold leading-none ${
                        isToday ? 'text-emerald-600 dark:text-emerald-400' : sel ? 'text-neutral-700 dark:text-neutral-200' : 'text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {DAY_SHORT[day]}
                    </Text>
                    <View className="items-center justify-center">
                      <DayRing ratio={ratio} />
                      <View className="absolute inset-0 items-center justify-center">
                        {complete ? (
                          <Icon icon={IconCheck} size={13} strokeWidth={3} className="text-green-600 dark:text-green-400" />
                        ) : (
                          <Text className="text-[11px] font-bold tabular-nums text-neutral-700 dark:text-neutral-200">{dayNum}</Text>
                        )}
                      </View>
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Empty state (no rituals at all) ──────────────────────────────── */}
        {rituals.length === 0 && (
          <EmptyState
            icon={IconRepeat}
            title="No routines yet"
            description="Add anything you want to do regularly — skincare, water, exercise, reading — and track it your own way."
            action={{ label: 'Add first routine', onClick: () => onAddOpenChange(true) }}
          />
        )}

        {/* ── Empty filter state ───────────────────────────────────────────── */}
        {viewMode === 'day' && rituals.length > 0 && filteredRituals.length === 0 && (
          <View className="items-center gap-2 py-12">
            <Text className="text-center text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">No routines for {DAY_SHORT[selectedDay]}</Text>
            <Pressable accessibilityRole="button" onPress={() => onAddOpenChange(true)} hitSlop={8} className="mt-1">
              <Text className="text-[13px] font-semibold text-neutral-500 underline dark:text-neutral-400">Add one</Text>
            </Pressable>
          </View>
        )}

        {/* ── Routine rows, grouped by time of day ─────────────────────────── */}
        {viewMode === 'day' && filteredRituals.length > 0 && (
          <View className="w-full min-w-0">
            {grouped.map((group, gi) => (
              <View key={group.key} className={gi > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}>
                <GroupHeader bucketKey={group.key} label={group.label} count={group.items.length} />
                {group.items.map((ritual, ri) => (
                  <View key={ritual.id} className={ri > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}>
                    <RoutineRow
                      ritual={ritual}
                      ritualCompletions={ritualCompletions}
                      selectedDateISO={selectedDateISO}
                      trackingStart={trackingStart}
                      onMarkDone={onMarkDone}
                      onUnmarkDone={onUnmarkDone}
                      onOpenDetail={onOpenDetail}
                      onDelete={(r) => onDelete(r.id)}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}
      </View>

      <RitualSheet open={addOpen} onClose={() => onAddOpenChange(false)} onSave={onAdd} />

      <RitualSheet
        open={!!editRitual}
        onClose={() => setEditRitual(null)}
        initial={editRitual ?? undefined}
        onSave={(data) => {
          if (editRitual) onUpdate(editRitual.id, data);
        }}
        onDelete={() => {
          if (editRitual) onDelete(editRitual.id);
          setEditRitual(null);
        }}
      />
    </>
  );
}
