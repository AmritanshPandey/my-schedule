"use client";

import { useMemo } from "react";
import { IconChartLine, IconFlag3, IconPlus, IconTargetArrow, IconTrash } from "@tabler/icons-react";
import type { MetricEntry, Milestone, Plan, ProgressTracker, TrackerCadence } from "@/lib/useScheduleDB";
import type { MilestoneState } from "@/lib/milestoneHealth";
import { paceNarrative } from "@/lib/paceModel";
import { buildTrackerStat, groupTrackerStatsByPlan, trackerRampTone, type TrackerStat } from "@/lib/trackerStats";
import { plannedTrackerPath, planGap, type PlannedTrackerPath, type PlanGap } from "@/lib/milestoneTargets";
import type { MilestoneLinkKind } from "@/lib/milestoneLinks";
import MilestoneLinks from "@/components/milestone/MilestoneLinks";
import {
  buildCheckIn,
  checkInRecordLabel,
  checkInStatusLabel,
  nextCheckInLabel,
  type CheckInState,
} from "@/lib/trackerCadence";
import { CadenceSelect } from "@/components/tracking/CadencePicker";
import { quickAmountsForUnit } from "@/lib/quickAmounts";
import { todayISO } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import { CARD, SOFT_PANEL } from "@/components/ui/surfaces";
import { MainTitleSection } from "@/components/ui/MainTitleSection";
import EmptyState from "@/components/ui/EmptyState";
import TrendChange from "@/components/ui/TrendChange";
import ProgressChart from "@/components/ProgressChart";
import HealthBadge from "@/components/ui/HealthBadge";

const RING_SIZE = 44;
const RING_STROKE = 4;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface TrackingViewProps {
  trackers: readonly ProgressTracker[];
  metricEntries: readonly MetricEntry[];
  plans: readonly Plan[];
  /** `preferences.startDate` — history before it is not this page's business. */
  trackingStart?: string;
  /**
   * The milestone (if any) each tracker is the success metric for, with its
   * live health/pace already computed — built once by the caller from the
   * same calculateMilestoneState calls the Plan's milestone view uses, so
   * Tracking never shows a second, possibly-disagreeing verdict for the same
   * milestone.
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
  /**
   * Every milestone — draws each tracker's planned path through its
   * milestones' figures (lib/milestoneTargets.ts) and lists which ones it
   * advances. Absent = neither is shown, as before.
   */
  milestones?: readonly Milestone[];
  /** Link/unlink a tracker to a milestone from its card. Absent = read-only. */
  onSetMilestoneLink?: (milestoneId: string, kind: MilestoneLinkKind, itemId: string, linked: boolean) => void;
}

/** "1.5" not "1.50", "500" not "500.0" — values are user-typed, not currency. */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * The day's progress as a ring, on the status ramp.
 *
 * The same instrument DESIGN.md defines for consistency — a 44px
 * stroke-dasharray ring with a punched-out tabular-nums centre — rather than a
 * new chart vocabulary. Reporting real state is the whole job of these; the ring
 * is never decorative, so a tracker with no target doesn't get one.
 */
function TargetRing({ percent, met }: { percent: number; met: boolean }) {
  const tone = trackerRampTone(percent);
  const strokeClass = met || tone === "on-track"
    ? "stroke-emerald-600 dark:stroke-emerald-400"
    : tone === "at-risk"
    ? "stroke-amber-600 dark:stroke-amber-400"
    : "stroke-rose-500 dark:stroke-rose-400";

  return (
    <div className="relative shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          className="stroke-neutral-200 dark:stroke-white/[0.10]"
        />
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${(percent / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          className={`${strokeClass} transition-[stroke-dasharray] duration-500 motion-reduce:transition-none`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-extrabold tabular-nums text-neutral-900 dark:text-white">
        {Math.round(percent)}
      </span>
    </div>
  );
}

/** "Last logged 9 days ago" — how long the record has been quiet. */
function lastLoggedLabel(lastDate: string | null, todayISO: string): string | null {
  if (!lastDate) return null;
  const days = Math.round(
    (new Date(`${todayISO}T00:00:00`).getTime() - new Date(`${lastDate}T00:00:00`).getTime()) / 86_400_000,
  );
  if (days <= 0) return "Last logged today";
  if (days === 1) return "Last logged yesterday";
  return `Last logged ${days} days ago`;
}

/**
 * The tracker's rhythm, in one line: how often, whether this period's entry
 * is in, when the next is wanted, and the honest record behind it.
 */
function CheckInRow({
  state,
  trackerTitle,
  onSetCadence,
}: {
  state: CheckInState;
  trackerTitle: string;
  onSetCadence: (cadence: TrackerCadence) => void;
}) {
  const record = checkInRecordLabel(state);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className={`min-w-0 truncate text-[13px] font-bold ${
          state.overdue
            ? "text-rose-700 dark:text-rose-400"
            : state.due
              ? "text-amber-800 dark:text-amber-300"
              : "text-emerald-700 dark:text-emerald-400"
        }`}>
          {checkInStatusLabel(state)}
          {!state.due && (
            <span className="font-semibold text-neutral-500 dark:text-neutral-400"> · next {nextCheckInLabel(state)}</span>
          )}
        </p>
        {/* The last few periods, oldest first. Hollow before first use. */}
        <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {state.history.map((period) => (
            <span
              key={period.start}
              className={`h-2 w-2 rounded-full ${
                period.logged === null
                  ? "border border-neutral-300 dark:border-white/[0.15]"
                  : period.logged
                    ? "bg-green-500"
                    : "bg-neutral-200 dark:bg-white/10"
              }`}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <CadenceSelect value={state.cadence} onChange={onSetCadence} trackerTitle={trackerTitle} />
        {record && (
          <p className="min-w-0 text-[12px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">
            {record}{state.streak >= 2 ? ` · ${state.streak} in a row` : ""}
          </p>
        )}
      </div>
    </div>
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
  onSetMilestoneLink?: TrackingViewProps["onSetMilestoneLink"];
  onLog: TrackingViewProps["onLog"];
  onOpenAddEntry: TrackingViewProps["onOpenAddEntry"];
  onDeleteEntry: TrackingViewProps["onDeleteEntry"];
  onSetCadence: TrackingViewProps["onSetCadence"];
}) {
  const { tracker } = stat;
  const unit = tracker.unit?.trim() ?? "";
  const presets = quickAmountsForUnit(tracker.unit);
  const todaysEntries = stat.todayEntries;
  const chartColor = plan?.color ?? "cyan";

  /**
   * ProgressChart plots MetricEntry-shaped rows, so the daily totals are
   * adapted rather than the chart being taught a second input shape.
   *
   * A daily metric's reference is a flat line at its target: "hit 2000ml"
   * repeats every day and has no start to slope from. A point-in-time metric
   * slopes from where it began to where it is going. Null when there is
   * neither data nor a target — an empty axis reports nothing.
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
    const startingValue = tracker.goalValue !== undefined && stat.startingValue !== null
      ? stat.startingValue
      : undefined;
    if (entries.length === 0 && startingValue === undefined && !planned) return null;
    return { entries, goalValue: tracker.goalValue, startingValue };
  }, [stat, tracker, planned]);

  return (
    <div className={`${CARD} px-5 py-4`}>
      <div className="flex items-start gap-3">
        {stat.isDaily && stat.percent !== null && (
          <TargetRing percent={stat.percent} met={stat.metToday} />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-[15px] font-extrabold text-neutral-900 dark:text-white">
              {tracker.title}
            </p>
            {stat.trend && (
              <TrendChange direction={stat.trend.direction} state={stat.trend.state} pct={stat.trend.pct} />
            )}
          </div>

          <p className="mt-0.5 text-[13px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
            {stat.isDaily ? (
              <>
                {fmt(stat.todayTotal)} <span className="text-neutral-500 dark:text-neutral-400">/ {fmt(stat.targetValue!)}</span>
                {unit && <span className="text-neutral-500 dark:text-neutral-400"> {unit}</span>}
              </>
            ) : stat.latestValue !== null ? (
              <>
                {fmt(stat.latestValue)}
                {unit && <span className="text-neutral-500 dark:text-neutral-400"> {unit}</span>}
                {stat.targetValue !== null && (
                  <span className="text-neutral-500 dark:text-neutral-400"> → {fmt(stat.targetValue)}</span>
                )}
              </>
            ) : (
              <span className="font-semibold text-neutral-500 dark:text-neutral-400">Nothing logged yet</span>
            )}
          </p>
          {/* Where the plan says this should be today, and how far off it is —
              the milestones' figures made into one readable line. */}
          {!stat.isDaily && planned?.gap && (
            <p data-testid="tracker-plan-gap" className="mt-0.5 text-[12px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
              Plan: {fmt(planned.gap.expected)}{unit && ` ${unit}`} by today ·{" "}
              {planned.gap.delta === 0 ? (
                <span className="text-emerald-700 dark:text-emerald-400">on plan</span>
              ) : (
                <span className={planned.gap.ahead ? "text-emerald-700 dark:text-emerald-400" : "text-amber-800 dark:text-amber-300"}>
                  {fmt(Math.abs(planned.gap.delta))}{unit && ` ${unit}`} {planned.gap.ahead ? "ahead" : "behind"}
                </span>
              )}
            </p>
          )}
        </div>

      </div>

      <CheckInRow
        state={checkIn}
        trackerTitle={tracker.title}
        onSetCadence={(cadence) => onSetCadence(tracker.id, cadence)}
      />

      {/* Linked milestone — the same "success metric" relationship shown in
          the Plan's milestone view (lib/milestoneHealth.ts), so a tracker
          logged here is never disconnected from what it's actually for. The
          pace sentence is silent (paceNarrative returns null) when the trend
          is too scattered to quote — no confident-looking number with
          nothing behind it. */}
      {milestoneLink && (
        <div className={`${SOFT_PANEL} mt-3 flex items-start gap-2 px-3 py-2`}>
          <IconFlag3 size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 truncate text-[12.5px] font-bold text-neutral-700 dark:text-neutral-200">
                {milestoneLink.milestone.title}
              </p>
              <HealthBadge health={milestoneLink.state.health} />
            </div>
            {paceNarrative(milestoneLink.state.paceGap) && (
              <p className="mt-0.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                {paceNarrative(milestoneLink.state.paceGap)}
              </p>
            )}
          </div>
        </div>
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

      {/* The chart, shown by default rather than behind a tap: a tracker's whole
          point is the shape of the line, and a card that hides it is a list
          entry pretending to be a chart.

          Points are daily totals, so a metric logged five times in an afternoon
          reads as one day rather than a spike. The reference line runs from the
          starting value to the goal for a point-in-time metric, or sits flat at
          the daily target for a cumulative one — either way the gap between the
          line and the data is the answer. */}
      {chart && (
        <div className={`${SOFT_PANEL} mt-3 px-2 py-2`}>
          <ProgressChart
            bare
            entries={chart.entries}
            color={chartColor}
            metric={{ name: tracker.title, unit }}
            goalValue={chart.goalValue}
            startingValue={chart.startingValue}
            plannedPath={stat.isDaily ? undefined : planned?.path.points}
          />
        </div>
      )}

      {/* One-tap logging. Green is correct here and nowhere else on this card:
          DESIGN.md reserves it for the affirmative action and names Log by name. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {presets.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => { haptic("light"); onLog(tracker.id, tracker.planId, amount); }}
            aria-label={`Log ${fmt(amount)}${unit ? ` ${unit}` : ""} of ${tracker.title}`}
            className="h-9 min-w-[56px] rounded-full bg-emerald-600 px-3 text-[13px] font-extrabold tabular-nums text-white transition-colors hover:bg-emerald-700 active:bg-emerald-700 dark:bg-emerald-500 dark:text-neutral-950 dark:hover:bg-emerald-400"
          >
            +{fmt(amount)}
          </button>
        ))}
        {/* Always present: the presets are a shortcut, not the only way in, and
            a unit with no preset table (or none at all) would otherwise have no
            log affordance on this page. */}
        <button
          type="button"
          onClick={() => { haptic("light"); onOpenAddEntry(tracker); }}
          aria-label={`Log a value for ${tracker.title}`}
          className="flex h-9 items-center gap-1 rounded-full border border-neutral-200 px-3 text-[13px] font-bold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/[0.12] dark:text-neutral-200 dark:hover:bg-white/[0.05]"
        >
          <IconPlus size={14} strokeWidth={2.5} />
          {presets.length > 0 ? "Other" : "Log"}
        </button>
      </div>

      {todaysEntries.length > 0 && (
        <div className={`${SOFT_PANEL} mt-3 px-3 py-2`}>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
            Today
          </p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {todaysEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
                  {fmt(entry.value)}{unit && ` ${unit}`}
                </span>
                <button
                  type="button"
                  onClick={() => onDeleteEntry(entry.id)}
                  aria-label={`Delete ${fmt(entry.value)}${unit ? ` ${unit}` : ""} entry`}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-white/[0.06] dark:hover:text-rose-400"
                >
                  <IconTrash size={13} strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * "Tracking" — every metric at once, grouped by the plan it serves.
 *
 * PRODUCT.md names logging a tracker one of the two primary daily actions, but
 * it had no surface of its own: a read-mostly Overview card, a pill row on
 * Today, and a plan-detail section that shows one tracker at a time. This page
 * is the logging surface — targets visible, one tap to record, history second.
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
  const checkedIn = useMemo(
    () => [...checkIns.values()].filter((c) => c.loggedThisPeriod).length,
    [checkIns],
  );

  const due = useMemo(
    () =>
      trackers
        .map((tracker, index) => ({ tracker, state: checkIns.get(tracker.id)!, index }))
        .filter(({ state }) => state.due)
        .sort((a, b) => Number(b.state.overdue) - Number(a.state.overdue) || a.index - b.index),
    [trackers, checkIns],
  );

  return (
    <div className="py-6 px-4 lg:pb-10 lg:pt-6">
      <div className="mx-auto w-full max-w-[1500px]">
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
            action={{ label: "Go to Plans", onClick: onNavigateToPlans, icon: IconTargetArrow }}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {/* What's waiting on an entry, first — the reason to open this page. */}
            {due.length > 0 && (
              <section data-testid="tracking-due" aria-labelledby="tracking-due-title" className={`${CARD} px-4 py-3`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="tracking-due-title" className="text-[15px] font-extrabold text-neutral-950 dark:text-white">
                    Check-ins due
                  </h2>
                  <span className="text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{due.length}</span>
                </div>
                <ul className="mt-1 divide-y divide-neutral-100 dark:divide-white/[0.06]">
                  {due.map(({ tracker, state }) => {
                    const last = lastLoggedLabel(state.lastLoggedDate, today);
                    return (
                      <li key={tracker.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-bold text-neutral-900 dark:text-white">{tracker.title}</p>
                          <p className="truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                            <span className={state.overdue ? "font-bold text-rose-700 dark:text-rose-400" : "font-bold text-amber-800 dark:text-amber-300"}>
                              {checkInStatusLabel(state)}
                            </span>
                            {last ? ` · ${last}` : " · Not logged yet"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { haptic("light"); onOpenAddEntry(tracker); }}
                          aria-label={`Log ${tracker.title}`}
                          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-neutral-950 px-4 text-[13px] font-extrabold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
                        >
                          <IconPlus size={14} strokeWidth={2.6} />
                          Log
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {groups.map((group, i) => (
              <section key={group.plan?.id ?? `ungrouped-${i}`}>
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">
                  {group.plan?.title ?? "Other"}
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
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
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
