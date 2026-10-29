import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColorScheme } from 'nativewind';
import { IconChartLine, IconFlag3, IconPlus, IconTargetArrow, IconTrash } from '@tabler/icons-react-native';
import type { MetricEntry, Milestone, Plan, ProgressTracker, TrackerCadence } from '@planr/core/lib/scheduleTypes';
import type { MilestoneState } from '@planr/core/lib/milestoneHealth';
import { paceNarrative } from '@planr/core/lib/paceModel';
import { buildTrackerStat, groupTrackerStatsByPlan, trackerRampTone, type TrackerStat } from '@planr/core/lib/trackerStats';
import { plannedTrackerPath, planGap, type PlannedTrackerPath, type PlanGap } from '@planr/core/lib/milestoneTargets';
import type { MilestoneLinkKind } from '@planr/core/lib/milestoneLinks';
import MilestoneLinks from '../milestone/MilestoneLinks';
import { buildCheckIn, checkInRecordLabel, checkInStatusLabel, nextCheckInLabel, type CheckInState } from '@planr/core/lib/trackerCadence';
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
import { CadenceSelect } from './CadencePicker';

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
  /** Change how often a tracker asks for an entry. */
  onSetCadence: (trackerId: string, cadence: TrackerCadence) => void;
  /** Sends the user to Plans, the only place a tracker can be created. */
  onNavigateToPlans: () => void;
  /** Every milestone — draws each tracker's planned path and lists what it advances. */
  milestones?: readonly Milestone[];
  /** Link/unlink a tracker to a milestone from its card. Absent = read-only. */
  onSetMilestoneLink?: (milestoneId: string, kind: MilestoneLinkKind, itemId: string, linked: boolean) => void;
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

/** "Last logged 9 days ago" — how long the record has been quiet. */
function lastLoggedLabel(lastDate: string | null, todayISO: string): string | null {
  if (!lastDate) return null;
  const days = Math.round((new Date(`${todayISO}T00:00:00`).getTime() - new Date(`${lastDate}T00:00:00`).getTime()) / 86_400_000);
  if (days <= 0) return 'Last logged today';
  if (days === 1) return 'Last logged yesterday';
  return `Last logged ${days} days ago`;
}

/**
 * The tracker's rhythm, in one line: how often, whether this period's entry
 * is in, when the next is wanted, and the honest record behind it.
 */
function CheckInRow({ state, trackerTitle, onSetCadence }: { state: CheckInState; trackerTitle: string; onSetCadence: (cadence: TrackerCadence) => void }) {
  const record = checkInRecordLabel(state);
  return (
    <View className="mt-3 gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Text
          numberOfLines={1}
          className={`min-w-0 flex-1 text-[13px] font-bold ${
            state.overdue ? 'text-rose-700 dark:text-rose-400' : state.due ? 'text-amber-800 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {checkInStatusLabel(state)}
          {!state.due && <Text className="font-semibold text-neutral-500 dark:text-neutral-400"> · next {nextCheckInLabel(state)}</Text>}
        </Text>
        {/* The last few periods, oldest first. Hollow before first use. */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="shrink-0 flex-row items-center gap-1">
          {state.history.map((period) => (
            <View
              key={period.start}
              className={`h-2 w-2 rounded-full ${
                period.logged === null ? 'border border-neutral-300 dark:border-white/[0.15]' : period.logged ? 'bg-green-500' : 'bg-neutral-200 dark:bg-white/10'
              }`}
            />
          ))}
        </View>
      </View>
      <View className="flex-row items-center gap-3">
        <CadenceSelect value={state.cadence} onChange={onSetCadence} trackerTitle={trackerTitle} />
        {record && (
          <Text className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">
            {record}
            {state.streak >= 2 ? ` · ${state.streak} in a row` : ''}
          </Text>
        )}
      </View>
    </View>
  );
}

function MetricCard({
  stat,
  checkIn,
  plan,
  milestoneLink,
  planned,
  milestones,
  onSetMilestoneLink,
  onLog,
  onOpenAddEntry,
  onDeleteEntry,
  onSetCadence,
}: {
  stat: TrackerStat;
  checkIn: CheckInState;
  /** Supplies the chart's accent, so a metric matches the plan it serves. */
  plan: Plan | null;
  milestoneLink?: { milestone: Milestone; state: MilestoneState };
  /** The tracker's planned path and today's gap to it. Null = no path to draw. */
  planned: { path: PlannedTrackerPath; gap: PlanGap | null } | null;
  milestones?: readonly Milestone[];
  onSetMilestoneLink?: TrackingViewProps['onSetMilestoneLink'];
  onLog: TrackingViewProps['onLog'];
  onOpenAddEntry: TrackingViewProps['onOpenAddEntry'];
  onDeleteEntry: TrackingViewProps['onDeleteEntry'];
  onSetCadence: TrackingViewProps['onSetCadence'];
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
    if (entries.length === 0 && startingValue === undefined && !planned) return null;
    return { entries, goalValue: tracker.goalValue, startingValue };
  }, [stat, tracker, planned]);

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
          {/* Where the plan says this should be today, and how far off it is. */}
          {!stat.isDaily && planned?.gap ? (
            <Text testID="tracker-plan-gap" className="mt-0.5 text-[12px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
              Plan: {fmt(planned.gap.expected)}{unit ? ` ${unit}` : ''} by today ·{' '}
              {planned.gap.delta === 0 ? (
                <Text className="text-emerald-700 dark:text-emerald-400">on plan</Text>
              ) : (
                <Text className={planned.gap.ahead ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-300'}>
                  {fmt(Math.abs(planned.gap.delta))}{unit ? ` ${unit}` : ''} {planned.gap.ahead ? 'ahead' : 'behind'}
                </Text>
              )}
            </Text>
          ) : null}
        </View>
      </View>

      <CheckInRow state={checkIn} trackerTitle={tracker.title} onSetCadence={(cadence) => onSetCadence(tracker.id, cadence)} />

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

      {milestones && onSetMilestoneLink && (
        <MilestoneLinks
          className="mt-3"
          milestones={milestones}
          kind="tracker"
          itemId={tracker.id}
          planId={tracker.planId}
          onSetLink={onSetMilestoneLink}
        />
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
            plannedPath={stat.isDaily ? undefined : planned?.path.points}
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
  onSetCadence,
  onNavigateToPlans,
  milestones,
  onSetMilestoneLink,
}: TrackingViewProps) {
  const today = todayISO();
  const plansById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  const plannedByTracker = useMemo(() => {
    const map = new Map<string, { path: PlannedTrackerPath; gap: PlanGap | null }>();
    if (!milestones) return map;
    for (const t of trackers) {
      const path = plannedTrackerPath(t, milestones, metricEntries, trackingStart);
      if (path) map.set(t.id, { path, gap: planGap(t, path, metricEntries, today, trackingStart) });
    }
    return map;
  }, [milestones, trackers, metricEntries, today, trackingStart]);

  const groups = useMemo(() => {
    const stats = trackers.map((t) => buildTrackerStat(t, metricEntries, today, trackingStart));
    return groupTrackerStatsByPlan(stats, plansById);
  }, [trackers, metricEntries, today, trackingStart, plansById]);

  const checkIns = useMemo(
    () => new Map(trackers.map((t) => [t.id, buildCheckIn(t, metricEntries, today, trackingStart)])),
    [trackers, metricEntries, today, trackingStart],
  );

  // Each tracker asks once per its own period, so "done" here means this
  // period's entry is in — a weekly weigh-in done on Monday counts all week.
  const checkedIn = useMemo(() => [...checkIns.values()].filter((c) => c.loggedThisPeriod).length, [checkIns]);

  const due = useMemo(
    () =>
      trackers
        .map((tracker, index) => ({ tracker, state: checkIns.get(tracker.id)!, index }))
        .filter(({ state }) => state.due)
        .sort((a, b) => Number(b.state.overdue) - Number(a.state.overdue) || a.index - b.index),
    [trackers, checkIns],
  );

  return (
    <View className="px-4 py-6">
      <MainTitleSection
        label="Keep the record honest"
        title="Tracking"
        progressMeta={trackers.length > 0 ? { done: checkedIn, total: trackers.length } : undefined}
        className="mb-6"
      />

      {trackers.length === 0 ? (
        <EmptyState
          icon={IconChartLine}
          title="Nothing to track yet"
          description="Add a progress tracker to any plan — weight, distance, a score — set how often to check in, and it shows up here when an entry is due."
          action={{ label: 'Go to Plans', onClick: onNavigateToPlans, icon: IconTargetArrow }}
        />
      ) : (
        <View className="gap-6">
          {/* What's waiting on an entry, first — the reason to open this page. */}
          {due.length > 0 && (
            <View testID="tracking-due" className={`${CARD} px-4 py-3`}>
              <View className="flex-row items-baseline justify-between gap-3">
                <Text accessibilityRole="header" className="text-[15px] font-extrabold text-neutral-950 dark:text-white">
                  Check-ins due
                </Text>
                <Text className="text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{due.length}</Text>
              </View>
              <View className="mt-1">
                {due.map(({ tracker, state }, i) => {
                  const last = lastLoggedLabel(state.lastLoggedDate, today);
                  return (
                    <View key={tracker.id} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}`}>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-[14px] font-bold text-neutral-900 dark:text-white">
                          {tracker.title}
                        </Text>
                        <Text numberOfLines={1} className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                          <Text className={state.overdue ? 'font-bold text-rose-700 dark:text-rose-400' : 'font-bold text-amber-800 dark:text-amber-300'}>
                            {checkInStatusLabel(state)}
                          </Text>
                          {last ? ` · ${last}` : ' · Not logged yet'}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Log ${tracker.title}`}
                        onPress={() => {
                          haptic('light');
                          onOpenAddEntry(tracker);
                        }}
                        className="h-11 shrink-0 flex-row items-center gap-1.5 rounded-full bg-neutral-950 px-4 active:bg-neutral-800 dark:bg-white dark:active:bg-neutral-200"
                      >
                        <Icon icon={IconPlus} size={14} strokeWidth={2.6} className="text-white dark:text-neutral-950" />
                        <Text className="text-[13px] font-extrabold text-white dark:text-neutral-950">Log</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

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
                    checkIn={checkIns.get(stat.tracker.id)!}
                    plan={group.plan}
                    milestoneLink={milestoneByTrackerId?.get(stat.tracker.id)}
                    planned={plannedByTracker.get(stat.tracker.id) ?? null}
                    milestones={milestones}
                    onSetMilestoneLink={onSetMilestoneLink}
                    onLog={onLog}
                    onOpenAddEntry={onOpenAddEntry}
                    onDeleteEntry={onDeleteEntry}
                    onSetCadence={onSetCadence}
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
