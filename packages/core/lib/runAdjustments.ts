import type { Plan, PlanAdjustment, Schedule, Session } from "./scheduleTypes";
import { actualFor, paceSecPerKm, sessionState } from "./sessions";
import { rebuildRunPlan } from "./runPlan";
import { isPlanRunning } from "./planLifecycle";

/**
 * Weekly suggestions for a generated plan. When a plan week ends, compare what
 * was run with what was planned and propose at most one change for the next
 * week. Nothing changes until the user accepts it (decideAdjustment).
 */

export const ADJUSTMENT_THRESHOLDS = {
  missedForRepeat: 2,
  hardForEase: 2,
  slowBySec: 15,
  fastBySec: 10,
  fastRunsNeeded: 3,
  fastWindow: 4,
  paceStepSec: -10,
} as const;

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00Z`) - Date.parse(`${fromISO}T00:00:00Z`)) / 86_400_000);
}

/** 1-based plan week of a date, counted from the plan's start (not calendar weeks). */
export function planWeekIndex(plan: Plan, dateISO: string): number {
  const start = plan.generator?.inputs.startISO ?? plan.startDate ?? dateISO;
  return Math.floor(daysBetween(start, dateISO) / 7) + 1;
}

/** The session's planned pace, distance-weighted; legs without a pace count at easy pace. */
export function plannedAvgPace(session: Session, easyPaceSecPerKm: number): number {
  let metres = 0;
  let seconds = 0;
  for (const t of session.tasks) {
    if (t.kind !== "distance") continue;
    const m = t.plan.distanceM * (t.plan.repeats ?? 1);
    metres += m;
    seconds += (m / 1000) * (t.plan.paceSecPerKm ?? easyPaceSecPerKm);
  }
  return metres > 0 ? Math.round(seconds / (metres / 1000)) : easyPaceSecPerKm;
}

interface TimedRun {
  session: Session;
  deltaSec: number;
  effort?: string;
}

/** Runs with real numbers (typed or Health), as pace offsets from plan. Marks never count. */
function timedRuns(schedule: Schedule, sessions: Session[], easyPace: number): TimedRun[] {
  const out: TimedRun[] = [];
  for (const session of sessions) {
    const log = actualFor(schedule, session.id);
    if (!log?.actual || log.source === "mark") continue;
    out.push({ session, deltaSec: paceSecPerKm(log.actual) - plannedAvgPace(session, easyPace), effort: log.actual.effort });
  }
  return out;
}

function propose(schedule: Schedule, plan: Plan, week: number, todayISO: string): Omit<PlanAdjustment, "id" | "planId" | "weekIndex" | "decision" | "createdAt"> | null {
  const T = ADJUSTMENT_THRESHOLDS;
  const easyPace = plan.generator!.inputs.easyPaceSecPerKm;
  const mine = (schedule.sessions ?? []).filter((s) => s.planId === plan.id);
  const thisWeek = mine.filter((s) => s.generated?.weekIndex === week);

  const missed = thisWeek.filter((s) => {
    const st = sessionState(s, todayISO);
    return st === "missed" || st === "skipped";
  }).length;
  if (missed >= T.missedForRepeat) {
    return { kind: "repeat-week", detail: {}, reason: `You missed ${missed} runs last week.` };
  }

  const timed = timedRuns(schedule, thisWeek, easyPace);
  if (timed.filter((r) => r.effort === "hard").length >= T.hardForEase) {
    return { kind: "ease", detail: {}, reason: "Two or more runs last week felt hard." };
  }
  if (timed.length >= 2 && timed.filter((r) => r.deltaSec > T.slowBySec).length > timed.length / 2) {
    return { kind: "ease", detail: {}, reason: "Most runs last week were slower than planned." };
  }

  const upTo = thisWeek.reduce((max, s) => (s.dateISO > max ? s.dateISO : max), "");
  const recent = timedRuns(schedule, mine.filter((s) => s.dateISO <= upTo), easyPace)
    .sort((a, b) => b.session.dateISO.localeCompare(a.session.dateISO))
    .slice(0, T.fastWindow);
  if (recent.length >= T.fastRunsNeeded && recent.filter((r) => r.deltaSec <= -T.fastBySec).length >= T.fastRunsNeeded) {
    return {
      kind: "pace",
      detail: { paceDeltaSec: T.paceStepSec },
      reason: `You beat your target pace on ${T.fastRunsNeeded} of your last ${recent.length} runs.`,
    };
  }
  return null;
}

/**
 * For each generated plan, look at the most recently finished week (only that
 * one: coming back after a break shouldn't bring a stack of stale questions)
 * and add at most one pending suggestion for the week after it. A week that
 * already has a suggestion, whatever its answer, is never asked again; the
 * final week never gets one.
 */
export function evaluateFinishedWeeks(schedule: Schedule, todayISO: string, nowISO: string): Schedule {
  const added: PlanAdjustment[] = [];
  for (const plan of schedule.plans) {
    if (!plan.generator || !isPlanRunning(plan)) continue;
    const mine = (schedule.sessions ?? []).filter((s) => s.planId === plan.id && s.generated);
    if (mine.length === 0) continue;
    const lastWeek = Math.max(...mine.map((s) => s.generated!.weekIndex));
    let finished = 0;
    for (let k = 1; k <= lastWeek; k++) {
      const dates = mine.filter((s) => s.generated!.weekIndex === k).map((s) => s.dateISO);
      if (dates.length && dates.every((d) => d < todayISO)) finished = k;
    }
    const target = finished + 1;
    if (finished === 0 || target >= lastWeek) continue;
    const asked = (schedule.planAdjustments ?? []).some((a) => a.planId === plan.id && a.weekIndex === target);
    if (asked) continue;
    const proposal = propose(schedule, plan, finished, todayISO);
    if (proposal) {
      // Same id on every device for the same plan week, so two devices that
      // both evaluate before syncing merge into one suggestion, not two.
      added.push({ id: adjustmentId(plan.id, target), planId: plan.id, weekIndex: target, decision: "pending", createdAt: nowISO, ...proposal });
    }
  }
  if (added.length === 0) return schedule;
  // A newer suggestion retires an unanswered older one for the same plan: it
  // was about a week that has passed.
  const retired = (schedule.planAdjustments ?? []).map((a) =>
    a.decision === "pending" && added.some((n) => n.planId === a.planId && n.weekIndex > a.weekIndex)
      ? { ...a, decision: "held" as const, decidedAt: nowISO }
      : a,
  );
  return { ...schedule, planAdjustments: [...retired, ...added] };
}

export function adjustmentId(planId: string, weekIndex: number): string {
  return `${planId}-adj-w${weekIndex}`;
}

/** True when another suggestion for the same plan week has already been answered. */
function weekAlreadyDecided(schedule: Schedule, adj: PlanAdjustment): boolean {
  return (schedule.planAdjustments ?? []).some(
    (a) => a.id !== adj.id && a.planId === adj.planId && a.weekIndex === adj.weekIndex && a.decision !== "pending",
  );
}

export function decideAdjustment(
  schedule: Schedule,
  adjustmentId: string,
  decision: "accepted" | "held",
  todayISO: string,
  nowISO: string,
): Schedule {
  const adj = (schedule.planAdjustments ?? []).find((a) => a.id === adjustmentId);
  if (!adj || adj.decision !== "pending" || weekAlreadyDecided(schedule, adj)) return schedule;
  const next: Schedule = {
    ...schedule,
    planAdjustments: (schedule.planAdjustments ?? []).map((a) => (a.id === adjustmentId ? { ...a, decision, decidedAt: nowISO } : a)),
  };
  return decision === "accepted" ? rebuildRunPlan(next, adj.planId, todayISO, nowISO) : next;
}

/** The newest open suggestion for a plan whose week hasn't been answered already. */
export function pendingAdjustment(schedule: Schedule, planId: string): PlanAdjustment | undefined {
  return (schedule.planAdjustments ?? [])
    .filter((a) => a.planId === planId && a.decision === "pending" && !weekAlreadyDecided(schedule, a))
    .sort((a, b) => b.weekIndex - a.weekIndex)[0];
}
