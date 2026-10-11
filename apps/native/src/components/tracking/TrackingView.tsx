import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import { IconChartLine, IconFlag3, IconPlus, IconTargetArrow, IconTrash } from '@tabler/icons-react-native';
import type { MetricEntry, Milestone, Plan, ProgressTracker } from '@planr/core/lib/scheduleTypes';
import type { MilestoneState } from '@planr/core/lib/milestoneHealth';
import { paceNarrative } from '@planr/core/lib/paceModel';
import { buildTrackerStat, groupTrackerStatsByPlan, trackerRampTone, type TrackerStat } from '@planr/core/lib/trackerStats';
import { quickAmountsForUnit } from '@planr/core/lib/quickAmounts';
import { todayISO } from '@planr/core/lib/dateUtils';
import { haptic } from '../../lib/haptics';
import { CARD, SOFT_PANEL } from '../ui/surfaces';
import { MainTitleSection } from '../ui/MainTitleSection';
import EmptyState from '../ui/EmptyState';
import TrendChange from '../ui/TrendChange';
import HealthBadge from '../ui/HealthBadge';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import ProgressChart from '../ProgressChart';

const RING_SIZE = 44;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** The ring's stroke classes from the web, as the raw colors SVG needs. */
const RING_STROKES = {
  light: { onTrack: '#00A63E', atRisk: '#D97706', behind: '#F43F5E', track: '#E5E5E5' },
  dark: { onTrack: '#2FD46E', atRisk: '#FBBF24', behind: '#FB7185', track: 'rgba(255,255,255,0.10)' },
} as const;

export interface TrackingViewProps {
  trackers: readonly ProgressTracker[];
  metricEntries: readonly MetricEntry[];
  plans: readonly Plan[];
  /** `preferences.startDate` — history before it is not this page's business. */
  trackingStart?: string;
  /**
   * The milestone (if any) each tracker is the success metric for, with its
   * live health/pace already computed by the caller from the same
   * calculateMilestoneState calls the Plan's milestone view uses.
   */
  milestoneByTrackerId?: ReadonlyMap<string, { milestone: Milestone; state: MilestoneState }>;
  /** Append one entry. An increment is just another entry on today's date. */
  onLog: (trackerId: string, planId: string, value: number) => void;
  /** Opens AddEntryModal for an arbitrary value or a back-dated entry. */
  onOpenAddEntry: (tracker: ProgressTracker) => void;
  onDeleteEntry: (entryId: string) => void;
  /** Sends the user to Plans, the only place a tracker can be created. */
  onNavigateToPlans: () => void;
}

/** "1.5" not "1.50", "500" not "500.0" — values are user-typed, not currency. */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * The day's progress as a ring, on the status ramp — a 44px stroke-dasharray
 * ring with a tabular-nums centre. Never decorative: a tracker with no target
 * doesn't get one.
 */
function TargetRing({ percent, met }: { percent: number; met: boolean }) {
  const { colorScheme } = useColorScheme();
  const palette = RING_STROKES[colorScheme === 'dark' ? 'dark' : 'light'];
  const tone = trackerRampTone(percent);
  const stroke = met || tone === 'on-track' ? palette.onTrack : tone === 'at-risk' ? palette.atRisk : palette.behind;

  return (
    <View className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" strokeWidth={RING_STROKE} stroke={palette.track} />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${(percent / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          stroke={stroke}
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-[11px] font-extrabold tabular-nums text-neutral-900 dark:text-white">{Math.round(percent)}</Text>
      </View>
    </View>
  );
}

function MetricCard({
  stat,
  plan,
  milestoneLink,
  onLog,
  onOpenAddEntry,
  onDeleteEntry,
}: {
  stat: TrackerStat;
  /** Supplies the chart's accent, so a metric matches the plan it serves. */
  plan: Plan | null;
  milestoneLink?: { milestone: Milestone; state: MilestoneState };
  onLog: TrackingViewProps['onLog'];
  onOpenAddEntry: TrackingViewProps['onOpenAddEntry'];
  onDeleteEntry: TrackingViewProps['onDeleteEntry'];
}) {
  const { tracker } = stat;
  const unit = tracker.unit?.trim() ?? '';
  const presets = quickAmountsForUnit(tracker.unit);
  const todaysEntries = stat.todayEntries;
  const chartColor = plan?.color ?? 'cyan';

  /**
   * ProgressChart plots MetricEntry-shaped rows, so the daily totals are
   * adapted rather than the chart being taught a second input shape. A daily
   * metric's reference is a flat line at its target; a point-in-time metric
   * slopes from where it began to where it is going. Null when there is
   * neither data nor a target.
   */
  const chart = useMemo(() => {
    const entries = stat.points.map((pt, i) => ({
      id: `${tracker.id}-${pt.date}-${i}`,
      planId: tracker.planId,
      trackerId: tracker.id,
      value: pt.value,
      date: pt.date,
    }));
    if (stat.isDaily) {
      return { entries, goalValue: tracker.dailyTarget, startingValue: undefined };
    }
    const startingValue = tracker.goalValue !== undefined && stat.startingValue !== null ? stat.startingValue : undefined;
    if (entries.length === 0 && startingValue === undefined) return null;
    return { entries, goalValue: tracker.goalValue, startingValue };
  }, [stat, tracker]);

  const pace = milestoneLink ? paceNarrative(milestoneLink.state.paceGap) : null;

  return (
    <View className={`${CARD} px-5 py-4`}>
      <View className="flex-row items-start gap-3">
        {stat.isDaily && stat.percent !== null && <TargetRing percent={stat.percent} met={stat.metToday} />}

        <View className="min-w-0 flex-1">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-neutral-900 dark:text-white">{tracker.title}</Text>
            {stat.trend && <TrendChange direction={stat.trend.direction} state={stat.trend.state} pct={stat.trend.pct} />}
          </View>

          <Text className="mt-0.5 text-[13px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
            {stat.isDaily ? (
              <>
                {fmt(stat.todayTotal)} <Text className="text-neutral-500 dark:text-neutral-400">/ {fmt(stat.targetValue!)}</Text>
                {unit ? <Text className="text-neutral-500 dark:text-neutral-400"> {unit}</Text> : null}
              </>
            ) : stat.latestValue !== null ? (
              <>
                {fmt(stat.latestValue)}
                {unit ? <Text className="text-neutral-500 dark:text-neutral-400"> {unit}</Text> : null}
                {stat.targetValue !== null && <Text className="text-neutral-500 dark:text-neutral-400"> → {fmt(stat.targetValue)}</Text>}
              </>
            ) : (
              <Text className="font-semibold text-neutral-500 dark:text-neutral-400">Nothing logged yet</Text>
            )}
          </Text>
        </View>
      </View>

      {/* Linked milestone — the same "success metric" relationship shown in
          the Plan's milestone view. The pace sentence is silent when the
          trend is too scattered to quote. */}
      {milestoneLink && (
        <View className={`${SOFT_PANEL} mt-3 flex-row items-start gap-2 px-3 py-2`}>
          <Icon icon={IconFlag3} size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400" />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1.5">
              <Text className="min-w-0 shrink truncate text-[12.5px] font-bold text-neutral-700 dark:text-neutral-200">{milestoneLink.milestone.title}</Text>
              <HealthBadge health={milestoneLink.state.health} />
            </View>
            {pace && <Text className="mt-0.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{pace}</Text>}
          </View>
        </View>
      )}

      {/* The chart, shown by default: a tracker's whole point is the shape of
          the line. Points are daily totals. */}
      {chart && (
        <View className={`${SOFT_PANEL} mt-3 px-2 py-2`}>
          <ProgressChart
            bare
            entries={chart.entries}
            color={chartColor}
            metric={{ name: tracker.title, unit }}
            goalValue={chart.goalValue}
            startingValue={chart.startingValue}
          />
        </View>
      )}

      {/* One-tap logging. Green is reserved for the affirmative action. */}
      <View className="mt-3 flex-row flex-wrap items-center gap-2">
        {presets.map((amount) => (
          <Pressable
            key={amount}
            accessibilityRole="button"
            accessibilityLabel={`Log ${fmt(amount)}${unit ? ` ${unit}` : ''} of ${tracker.title}`}
            onPress={() => {
              haptic('light');
              onLog(tracker.id, tracker.planId, amount);
            }}
            className="h-9 min-w-[56px] items-center justify-center rounded-full bg-emerald-600 px-3 active:bg-emerald-700 dark:bg-emerald-500 dark:active:bg-emerald-400"
          >
            <Text className="text-[13px] font-extrabold tabular-nums text-white dark:text-neutral-950">+{fmt(amount)}</Text>
          </Pressable>
        ))}
        {/* Always present: the presets are a shortcut, not the only way in. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Log a value for ${tracker.title}`}
          onPress={() => {
            haptic('light');
            onOpenAddEntry(tracker);
          }}
          className="h-9 flex-row items-center gap-1 rounded-full border border-neutral-200 px-3 active:bg-neutral-50 dark:border-white/[0.12] dark:active:bg-white/[0.05]"
        >
          <Icon icon={IconPlus} size={14} strokeWidth={2.5} className="text-neutral-700 dark:text-neutral-200" />
          <Text className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200">{presets.length > 0 ? 'Other' : 'Log'}</Text>
        </Pressable>
      </View>

      {todaysEntries.length > 0 && (
        <View className={`${SOFT_PANEL} mt-3 px-3 py-2`}>
          <Text className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">Today</Text>
          <View className="mt-1.5 gap-1">
            {todaysEntries.map((entry) => (
              <View key={entry.id} className="flex-row items-center justify-between gap-2">
                <Text className="text-[13px] font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
                  {fmt(entry.value)}
                  {unit ? ` ${unit}` : ''}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${fmt(entry.value)}${unit ? ` ${unit}` : ''} entry`}
                  onPress={() => onDeleteEntry(entry.id)}
                  className="h-7 w-7 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.06]"
                >
                  <Icon icon={IconTrash} size={13} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * Native port of components/tracking/TrackingView.tsx — every metric at once,
 * grouped by the plan it serves: targets visible, one tap to record, history
 * second.
 */
export default function TrackingView({
  trackers,
  metricEntries,
  plans,
  trackingStart,
  milestoneByTrackerId,
  onLog,
  onOpenAddEntry,
  onDeleteEntry,
  onNavigateToPlans,
}: TrackingViewProps) {
  const today = todayISO();
  const plansById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  const groups = useMemo(() => {
    const stats = trackers.map((t) => buildTrackerStat(t, metricEntries, today, trackingStart));
    return groupTrackerStatsByPlan(stats, plansById);
  }, [trackers, metricEntries, today, trackingStart, plansById]);

  const loggedToday = useMemo(() => groups.reduce((sum, g) => sum + g.stats.filter((s) => s.todayCount > 0).length, 0), [groups]);

  return (
    <View className="px-4 py-6">
      <MainTitleSection
        label="Keep the record honest"
        title="Tracking"
        progressMeta={trackers.length > 0 ? { done: loggedToday, total: trackers.length } : undefined}
        className="mb-6"
      />

      {trackers.length === 0 ? (
        <EmptyState
          icon={IconChartLine}
          title="Nothing to track yet"
          description="Add a progress tracker to any plan — weight, distance, a score — and it shows up here to log every day."
          action={{ label: 'Go to Plans', onClick: onNavigateToPlans, icon: IconTargetArrow }}
        />
      ) : (
        <View className="gap-6">
          {groups.map((group, i) => (
            <View key={group.plan?.id ?? `ungrouped-${i}`}>
              <Text accessibilityRole="header" className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">
                {group.plan?.title ?? 'Other'}
              </Text>
              <View className="gap-3">
                {group.stats.map((stat) => (
                  <MetricCard
                    key={stat.tracker.id}
                    stat={stat}
                    plan={group.plan}
                    milestoneLink={milestoneByTrackerId?.get(stat.tracker.id)}
                    onLog={onLog}
                    onOpenAddEntry={onOpenAddEntry}
                    onDeleteEntry={onDeleteEntry}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
