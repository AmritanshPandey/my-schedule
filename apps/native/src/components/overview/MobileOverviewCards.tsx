/**
 * The Overview's cards, in reading order: what to do now (hero), what
 * slipped (Needs attention), what to log (Check-ins due), where the day goes
 * (Your day), how the week is going (This week) and goal pace. Native twin of
 * components/overview/MobileOverviewCards.tsx — keep the two in step.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconRun,
  IconCalendarCheck,
  IconCheck,
  IconChevronRight,
  IconClockExclamation,
  IconFlag,
  IconFlame,
  IconListCheck,
  IconPlus,
  IconTrendingDown,
  IconX,
} from '@tabler/icons-react-native';
import { haptic } from '../../lib/haptics';
import { headline } from '@planr/core/lib/sessions';
import { formatDateShort, todayISO } from '@planr/core/lib/dateUtils';
import { bandRangeLabel } from '@planr/core/lib/slotReliability';
import {
  formatDaysAgo,
  formatDaysBehind,
  formatDaysOverdue,
  formatReliabilityRate,
  type MissedTask,
  type NeedsAttention,
  type UnreliableSlotTask,
} from '@planr/core/lib/needsAttention';
import { milestoneOverdueKey, milestoneRiskKey, ritualAttentionKey, slotRiskKey } from '@planr/core/lib/attentionDismissal';
import { checkInStatusLabel, type DueCheckIn } from '@planr/core/lib/trackerCadence';
import { formatMinutesBrief, WEEK_VERDICT_LABEL, type GoalPaceRow, type NextUp, type WeekStatus, type WeekVerdict } from '@planr/core/lib/overview';
import type { DayShape } from '@planr/core/lib/dayShape';
import type { ExecutionStreak } from '@planr/core/lib/consistency/calculateExecutionStreak';
import type { ProgressTracker } from '@planr/core/lib/scheduleTypes';
import { taskDurationMinutes } from '@planr/core/lib/intelligence/taskStats';
import Button, { BUTTON_TEXT } from '../ui/Button';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import HealthBadge, { HEALTH_FILL } from '../ui/HealthBadge';
import ProgressBar from '../ui/ProgressBar';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text } from '../ui/Text';

/** White on the page tint, no border, generous radius. */
const CARD = 'rounded-[26px] bg-white p-5 dark:bg-neutral-900';

const VERDICT_PILL: Record<WeekVerdict, { box: string; text: string }> = {
  'on-track': { box: 'bg-emerald-500/10 dark:bg-emerald-400/10', text: 'text-emerald-700 dark:text-emerald-400' },
  'at-risk': { box: 'bg-amber-500/12 dark:bg-amber-400/12', text: 'text-amber-700 dark:text-amber-300' },
  behind: { box: 'bg-rose-500/10 dark:bg-rose-400/10', text: 'text-rose-700 dark:text-rose-300' },
};

function CountBadge({ count }: { count: number }) {
  return (
    <View className="h-8 min-w-8 items-center justify-center rounded-full bg-neutral-100 px-2 dark:bg-white/[0.08]">
      <Text className="text-[14px] font-semibold tabular-nums text-neutral-900 dark:text-white">{count}</Text>
    </View>
  );
}

function CardTitle({ icon, title, trailing }: { icon?: TablerIcon; title: string; trailing?: ReactNode }) {
  return (
    <View className="flex-row items-center gap-3">
      {icon && <Icon icon={icon} size={22} strokeWidth={1.9} className="text-neutral-900 dark:text-white" />}
      <Text accessibilityRole="header" numberOfLines={1} className="min-w-0 flex-1 text-[17px] font-semibold text-neutral-950 dark:text-white">
        {title}
      </Text>
      {trailing}
    </View>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

function StreakBadge({ streak }: { streak: ExecutionStreak }) {
  if (streak.streak <= 0) return null;
  return (
    // The gradient fills behind a plain row: as the sizing container itself it
    // didn't measure its children under the new architecture, clipping the label.
    <View
      accessible
      accessibilityLabel={`${streak.streak}-day streak${streak.atRisk ? ', do one thing today to keep it' : ''}`}
      style={{ borderRadius: 999, overflow: 'hidden', flexShrink: 0 }}
    >
      <LinearGradient colors={['#F43F5E', '#F59E0B']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6 }}>
        <Icon icon={IconFlame} size={18} strokeWidth={2} className="text-white" />
        <Text className="text-[14px] font-semibold text-white">{streak.streak}-day streak</Text>
      </View>
    </View>
  );
}

export function OverviewHero({
  next,
  subtasks,
  streak,
  onMarkDone,
  onToggleSlot,
  onOpenTask,
  onOpenToday,
  onAddTask,
  onOpenSession,
  onToggleSession,
}: {
  next: NextUp;
  subtasks: { done: number; total: number } | null;
  streak: ExecutionStreak;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onOpenTask: (taskId: string) => void;
  onOpenToday: () => void;
  onAddTask: () => void;
  /** When a run is next: open its detail, and Mark done ticks it. */
  onOpenSession?: (sessionId: string) => void;
  onToggleSession?: (sessionId: string) => void;
}) {
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const done = next.kind === 'empty' ? 0 : next.done;
  const total = next.kind === 'empty' ? 0 : next.total;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const minutes = next.kind === 'task' ? taskDurationMinutes(next.task) : 0;

  return (
    <View className={CARD}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[16px] font-medium text-neutral-900 dark:text-white">{dateLabel}</Text>
        <StreakBadge streak={streak} />
      </View>

      {total > 0 && (
        <View className="mt-5 flex-row items-center gap-3">
          <ProgressBar pct={pct} height={8} className="flex-1" fillClassName="bg-amber-600 dark:bg-amber-500" />
          <Text className="text-[12px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
            {done} of {total} done
          </Text>
        </View>
      )}

      {next.kind === 'task' ? (
        <>
          <View className="mt-5 flex-row items-center justify-between gap-3">
            <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Next up{next.timeLabel ? ` · ${next.timeLabel}` : ''}</Text>
            {minutes > 0 && <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Duration: {formatMinutesBrief(minutes)}</Text>}
          </View>
          <View className="mt-2 flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 text-[28px] font-bold leading-[34px] tracking-[-0.5px] text-neutral-950 dark:text-white">{next.task.title}</Text>
            {subtasks && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${next.task.title}, ${subtasks.done} of ${subtasks.total} steps`}
                onPress={() => {
                  haptic('light');
                  onOpenTask(next.task.id);
                }}
                className="min-h-[44px] flex-row items-center gap-1.5 rounded-full bg-neutral-100 px-4 active:scale-[0.97] dark:bg-white/[0.08]"
              >
                <Icon icon={IconListCheck} size={18} strokeWidth={1.9} className="text-neutral-600 dark:text-neutral-300" />
                <Text className="text-[14px] font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
                  {subtasks.done}/{subtasks.total}
                </Text>
                <Icon icon={IconArrowUpRight} size={18} strokeWidth={1.9} className="text-neutral-600 dark:text-neutral-300" />
              </Pressable>
            )}
          </View>
          <View className="mt-4 flex-row gap-3 border-t border-neutral-100 pt-4 dark:border-white/[0.07]">
            <Button
              variant="primary"
              size="lg"
              className="flex-[1.7]"
              icon={<Icon icon={IconCheck} size={20} strokeWidth={2.4} className={BUTTON_TEXT.primary} />}
              onPress={() => {
                haptic('medium');
                if (next.slotIndex !== undefined) onToggleSlot(next.task.id, next.slotIndex);
                else onMarkDone(next.task.id, next.checkableIds);
              }}
            >
              Mark done
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              trailingIcon={<Icon icon={IconChevronRight} size={18} strokeWidth={2.2} className={BUTTON_TEXT.secondary} />}
              onPress={() => {
                haptic('light');
                onOpenToday();
              }}
            >
              Today
            </Button>
          </View>
        </>
      ) : next.kind === 'session' ? (
        <>
          <View className="mt-5 flex-row items-center justify-between gap-3">
            <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Next up{next.timeLabel ? ` · ${next.timeLabel}` : ''}</Text>
            {next.session.estimatedMinutes ? (
              <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Duration: {formatMinutesBrief(next.session.estimatedMinutes)}</Text>
            ) : null}
          </View>
          <View className="mt-2 flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 text-[28px] font-bold leading-[34px] tracking-[-0.5px] text-neutral-950 dark:text-white">{next.session.title}</Text>
            {onOpenSession ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${next.session.title}`}
                onPress={() => {
                  haptic('light');
                  onOpenSession(next.session.id);
                }}
                className="min-h-[44px] flex-row items-center gap-1.5 rounded-full bg-neutral-100 px-4 active:scale-[0.97] dark:bg-white/[0.08]"
              >
                <Icon icon={IconRun} size={18} strokeWidth={1.9} className="text-neutral-600 dark:text-neutral-300" />
                <Icon icon={IconArrowUpRight} size={18} strokeWidth={1.9} className="text-neutral-600 dark:text-neutral-300" />
              </Pressable>
            ) : null}
          </View>
          <Text numberOfLines={1} className="mt-1 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{headline(next.session)}</Text>
          <View className="mt-4 flex-row gap-3 border-t border-neutral-100 pt-4 dark:border-white/[0.07]">
            <Button
              variant="primary"
              size="lg"
              className="flex-[1.7]"
              icon={<Icon icon={IconCheck} size={20} strokeWidth={2.4} className={BUTTON_TEXT.primary} />}
              onPress={() => {
                haptic('medium');
                onToggleSession?.(next.session.id);
              }}
            >
              Mark done
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              trailingIcon={<Icon icon={IconChevronRight} size={18} strokeWidth={2.2} className={BUTTON_TEXT.secondary} />}
              onPress={() => {
                haptic('light');
                onOpenToday();
              }}
            >
              Today
            </Button>
          </View>
        </>
      ) : next.kind === 'day-done' ? (
        <View className="mt-5 flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-[24px] font-bold leading-[30px] text-neutral-950 dark:text-white">Day done</Text>
            <Text className="mt-0.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Everything on today's list is finished.</Text>
          </View>
          <Button
            variant="secondary"
            size="md"
            trailingIcon={<Icon icon={IconChevronRight} size={18} strokeWidth={2.2} className={BUTTON_TEXT.secondary} />}
            onPress={() => {
              haptic('light');
              onOpenToday();
            }}
          >
            Today
          </Button>
        </View>
      ) : (
        <>
          <Text className="mt-5 text-[24px] font-bold leading-[30px] text-neutral-950 dark:text-white">Plan your day</Text>
          <Text className="mt-0.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Nothing is scheduled for today yet.</Text>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-4"
            icon={<Icon icon={IconPlus} size={20} strokeWidth={2.2} className={BUTTON_TEXT.primary} />}
            onPress={() => {
              haptic('light');
              onAddTask();
            }}
          >
            Add a task
          </Button>
        </>
      )}
    </View>
  );
}

// ── Needs attention ─────────────────────────────────────────────────────────

const ATTENTION_ROWS = 2;

export function AttentionCard({
  data,
  onNavigate,
  onHandleMissed,
  onAdaptMilestone,
  onReviewUnreliableSlot,
  onClearAll,
  onDismissOne,
}: {
  data: NeedsAttention;
  onNavigate: (tab: number) => void;
  onHandleMissed: (missed: MissedTask) => void;
  onAdaptMilestone: (milestoneId: string) => void;
  onReviewUnreliableSlot: (row: UnreliableSlotTask) => void;
  onClearAll: () => void;
  onDismissOne: (key: string) => void;
}) {
  if (data.total === 0) return null;
  const today = todayISO();
  const rows = [
    ...data.atRiskRituals.map((row) => ({
      key: `r:${row.ritual.id}`,
      icon: IconFlame,
      title: row.ritual.title,
      status: 'Not done',
      detail: `${row.streak}-day run ends tonight`,
      onOpen: () => onNavigate(2),
      dismissKey: ritualAttentionKey(row.ritual.id, today) as string | null,
    })),
    ...data.unreliableSlotTasks.map((row) => ({
      key: `slot:${row.task.id}`,
      icon: IconClockExclamation,
      title: row.task.title,
      status: formatReliabilityRate(row.from.rate),
      detail: `${bandRangeLabel(row.from.band)} rarely finishes`,
      onOpen: () => onReviewUnreliableSlot(row),
      dismissKey: slotRiskKey(row.task.id, today) as string | null,
    })),
    ...data.atRiskMilestones.map((row) => ({
      key: `am:${row.milestone.id}`,
      icon: IconTrendingDown,
      title: row.milestone.title,
      status: row.daysBehind ? formatDaysBehind(row.daysBehind) : 'Off pace',
      detail: row.forecastDate ? `Projects ${formatDateShort(row.forecastDate)}` : row.plan?.title ?? 'Milestone',
      onOpen: () => onAdaptMilestone(row.milestone.id),
      dismissKey: milestoneRiskKey(row.milestone.id, row.milestone.plannedEndDate) as string | null,
    })),
    ...data.overdueMilestones.map((row) => ({
      key: `m:${row.milestone.id}`,
      icon: IconFlag,
      title: row.milestone.title,
      status: formatDaysOverdue(row.daysOverdue),
      detail: row.plan?.title ?? 'Milestone',
      onOpen: () => onAdaptMilestone(row.milestone.id),
      dismissKey: milestoneOverdueKey(row.milestone.id, row.milestone.plannedEndDate) as string | null,
    })),
    ...data.missedTasks.map((row) => ({
      key: `t:${row.task.id}:${row.dateISO}`,
      icon: IconX,
      title: row.task.title,
      status: 'Not done',
      detail: `Missed ${formatDaysAgo(row.daysAgo)}`,
      onOpen: () => onHandleMissed(row),
      dismissKey: null as string | null,
    })),
  ];
  const visible = rows.slice(0, ATTENTION_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <View testID="overview-needs-attention" className={CARD}>
      <CardTitle
        icon={IconAlertTriangle}
        title="Needs attention"
        trailing={
          <View className="flex-row items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                haptic('light');
                onClearAll();
              }}
            >
              Clear all
            </Button>
            <CountBadge count={rows.length} />
          </View>
        }
      />
      <View className="mt-3">
        {visible.map(({ key, icon, title, status, detail, onOpen, dismissKey }, index) => (
          <View key={key} className={`flex-row items-center gap-3 py-3 ${index > 0 ? 'border-t border-neutral-100 dark:border-white/[0.07]' : ''}`}>
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-400/15">
              <Icon icon={icon} size={20} strokeWidth={2} className="text-amber-700 dark:text-amber-300" />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${title}: ${status}, ${detail}`}
              onPress={() => {
                haptic('light');
                onOpen();
              }}
              className="min-h-[44px] min-w-0 flex-1 flex-row items-center gap-2"
            >
              <Text numberOfLines={1} className="min-w-0 flex-1 text-[16px] font-medium text-neutral-950 dark:text-white">
                {title}
              </Text>
              <Text className="text-[14px] font-semibold text-amber-700 dark:text-amber-400">{status}</Text>
              <Icon icon={IconArrowUpRight} size={20} strokeWidth={1.9} className="text-neutral-700 dark:text-neutral-300" />
            </Pressable>
            {dismissKey ? (
              <IconButton
                label={`Dismiss ${title}`}
                variant="ghost"
                size="md"
                onPress={() => {
                  haptic('light');
                  onDismissOne(dismissKey);
                }}
              >
                <Icon icon={IconX} size={19} strokeWidth={2} className={ICON_BUTTON_TONE.ghost} />
              </IconButton>
            ) : (
              <View className="w-10" />
            )}
          </View>
        ))}
      </View>
      {hidden > 0 && <Text className="mt-1 text-[15px] font-medium text-neutral-500 dark:text-neutral-400">+{hidden} more</Text>}
    </View>
  );
}

// ── Check-ins due ───────────────────────────────────────────────────────────

export function CheckInsCard({
  rows,
  limit = 3,
  onLog,
  onOpenTracking,
}: {
  rows: DueCheckIn[];
  limit?: number;
  onLog: (tracker: ProgressTracker) => void;
  onOpenTracking: () => void;
}) {
  if (rows.length === 0) return null;
  return (
    <View testID="overview-check-ins" className={CARD}>
      <CardTitle icon={IconCalendarCheck} title="Check-ins due" trailing={<CountBadge count={rows.length} />} />
      <View className="mt-2">
        {rows.slice(0, limit).map(({ tracker, state }, index) => (
          <View key={tracker.id} className={`flex-row items-center gap-3 py-3 ${index > 0 ? 'border-t border-neutral-100 dark:border-white/[0.07]' : ''}`}>
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-[16px] font-medium text-neutral-950 dark:text-white">
                {tracker.title}
              </Text>
              <Text numberOfLines={1} className={`mt-0.5 text-[14px] font-semibold ${state.overdue ? 'text-rose-700 dark:text-rose-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {checkInStatusLabel(state)}
              </Text>
            </View>
            <Button
              variant="secondary"
              size="md"
              accessibilityLabel={`Log ${tracker.title}`}
              icon={<Icon icon={IconPlus} size={18} strokeWidth={2.2} className={BUTTON_TEXT.secondary} />}
              onPress={() => {
                haptic('light');
                onLog(tracker);
              }}
            >
              Log
            </Button>
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptic('light');
          onOpenTracking();
        }}
        className="mt-1 min-h-[44px] flex-row items-center gap-1 self-start"
      >
        <Text className="text-[15px] font-medium text-neutral-500 dark:text-neutral-400">Open Tracking</Text>
        <Icon icon={IconChevronRight} size={18} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
      </Pressable>
    </View>
  );
}

// ── Your day ────────────────────────────────────────────────────────────────

function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
}

const NEUTRAL_BLOCK = '#A3A3A3';

export function YourDayCard({ shape, nowMinutes }: { shape: DayShape; nowMinutes: number }) {
  if (shape.blocks.length === 0) return null;
  const span = shape.windowEnd - shape.windowStart;
  const pct = (m: number) => `${((m - shape.windowStart) / span) * 100}%` as const;
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => shape.windowStart + Math.round((span * f) / 60) * 60);
  const legend = shape.legend.slice(0, 3);
  const more = shape.legend.length - legend.length;
  const nowInside = nowMinutes > shape.windowStart && nowMinutes < shape.windowEnd;

  return (
    <View testID="overview-your-day" className={CARD}>
      <View className="flex-row items-baseline justify-between gap-3">
        <Text accessibilityRole="header" className="text-[17px] font-semibold text-neutral-950 dark:text-white">
          Your day
        </Text>
        <Text numberOfLines={1} className="shrink text-[14px] font-medium text-neutral-500 dark:text-neutral-400">
          {formatMinutesBrief(shape.plannedMinutes)} planned · {formatMinutesBrief(shape.freeMinutes)} free
        </Text>
      </View>
      <View
        accessible
        accessibilityLabel={shape.blocks.map((b) => `${b.title} ${clockLabel(b.start)}`).join(', ')}
        className="relative mt-4 h-12 rounded-2xl bg-neutral-100 dark:bg-white/[0.06]"
      >
        {shape.blocks.map((block) => {
          const start = Math.max(block.start, shape.windowStart);
          const end = Math.min(block.end, shape.windowEnd);
          return (
            <View
              key={block.id}
              className="absolute bottom-1 top-1 rounded-xl"
              style={{ left: pct(start), width: `${Math.max(((end - start) / span) * 100 - 0.6, 1)}%`, backgroundColor: block.color ?? NEUTRAL_BLOCK }}
            />
          );
        })}
        {nowInside && <View className="absolute -bottom-1 -top-1 w-[3px] rounded-full bg-neutral-950 dark:bg-white" style={{ left: pct(nowMinutes) }} />}
      </View>
      <View className="mt-2 flex-row justify-between">
        {ticks.map((t) => (
          <Text key={t} className="text-[13px] font-medium text-neutral-600 dark:text-neutral-400">
            {clockLabel(t)}
          </Text>
        ))}
      </View>
      <View className="mt-3 flex-row flex-wrap gap-x-5 gap-y-2">
        {legend.map((row) => (
          <View key={row.id} className="flex-row items-center gap-2">
            <View className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: row.color ?? NEUTRAL_BLOCK }} />
            <Text className="text-[14px] font-medium text-neutral-950 dark:text-white">{row.label}</Text>
            <Text className="text-[14px] text-neutral-500 dark:text-neutral-400">{formatMinutesBrief(row.minutes)}</Text>
          </View>
        ))}
        {more > 0 && <Text className="text-[14px] font-medium text-neutral-500 dark:text-neutral-400">+{more} more</Text>}
      </View>
    </View>
  );
}

// ── This week ───────────────────────────────────────────────────────────────

export function WeekBarsCard({ status, onOpenDay }: { status: WeekStatus; onOpenDay: (dateISO: string) => void }) {
  if (!status.hasData) return null;
  return (
    <View testID="overview-week" className={CARD}>
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="text-[17px] font-semibold text-neutral-950 dark:text-white">
          This week
        </Text>
        {status.verdict && (
          <View className={`rounded-full px-3 py-1 ${VERDICT_PILL[status.verdict].box}`}>
            <Text className={`text-[13px] font-semibold ${VERDICT_PILL[status.verdict].text}`}>{WEEK_VERDICT_LABEL[status.verdict]}</Text>
          </View>
        )}
      </View>
      <View className="mt-3 flex-row items-baseline gap-2">
        <Text className="text-[44px] font-bold leading-[48px] tracking-[-1px] tabular-nums text-neutral-950 dark:text-white">
          {status.verdictPct}
          <Text className="text-[30px] font-bold">%</Text>
        </Text>
        <Text className="text-[15px] font-medium text-neutral-700 dark:text-neutral-300">of what's due so far</Text>
      </View>
      <View className="mt-5 flex-row gap-2">
        {status.days.map((day) => {
          const fill = day.isFuture || day.total === 0 ? 0 : Math.max(day.pct, day.missed > 0 && day.done === 0 ? 100 : 0);
          const color = day.done === 0 && day.missed > 0 ? 'bg-rose-500' : day.pct >= 100 ? 'bg-emerald-600' : 'bg-amber-500';
          return (
            <Pressable
              key={day.day}
              accessibilityRole="button"
              accessibilityLabel={`${day.label}: ${day.done} of ${day.total} done${day.missed ? `, ${day.missed} missed` : ''}`}
              onPress={() => {
                haptic('light');
                onOpenDay(day.dateISO);
              }}
              className="flex-1 items-center gap-1.5"
            >
              <View
                className={`h-16 w-full justify-end overflow-hidden rounded-full border ${
                  day.isToday ? 'border-2 border-emerald-600 dark:border-emerald-400' : 'border-neutral-200 dark:border-white/[0.12]'
                }`}
              >
                {fill > 0 && <View className={`w-full rounded-full ${color}`} style={{ height: `${Math.max(fill, 18)}%` }} />}
              </View>
              <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{day.label}</Text>
              <Text className="-mt-1 text-[15px] font-semibold tabular-nums text-neutral-950 dark:text-white">{Number(day.dateISO.slice(8, 10))}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-4 border-t border-neutral-100 pt-3 text-[14px] font-medium text-neutral-500 dark:border-white/[0.07] dark:text-neutral-400">
        {status.tasksDone} of {status.tasksTotal} tasks
      </Text>
    </View>
  );
}

// ── Goal on pace ────────────────────────────────────────────────────────────

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function GoalPaceMobileCard({ rows, onOpenPlan }: { rows: GoalPaceRow[]; onOpenPlan: (planId: string) => void }) {
  if (rows.length === 0) return null;
  return (
    <View testID="overview-goal-pace" className={CARD}>
      <CardTitle title="Goal on pace" trailing={<CountBadge count={rows.length} />} />
      <View className="mt-2">
        {rows.map(({ plan, milestone, state }, index) => (
          <Pressable
            key={plan.id}
            accessibilityRole="button"
            onPress={() => {
              haptic('light');
              onOpenPlan(plan.id);
            }}
            className={`py-4 active:opacity-70 ${index > 0 ? 'border-t border-neutral-100 dark:border-white/[0.07]' : ''}`}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-[17px] font-medium text-neutral-950 dark:text-white">
                  {milestone ? milestone.title : plan.title}
                </Text>
                <Text numberOfLines={1} className="mt-0.5 text-[14px] text-neutral-500 dark:text-neutral-400">
                  {milestone ? `${plan.title} · due ${shortDate(milestone.plannedEndDate)}` : plan.title}
                </Text>
              </View>
              {state ? <HealthBadge health={state.health} /> : null}
            </View>
            {state && state.overallProgress !== null && (
              <View className="mt-3 flex-row items-center gap-4">
                <View className="w-[58%]">
                  <ProgressBar pct={state.overallProgress} height={6} fillClassName={HEALTH_FILL[state.health]} />
                </View>
                <Text className="text-[13px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">{state.overallProgress}%</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
