/**
 * The pattern engine — what PlanR notices about how the plan is actually going.
 *
 * Every signal here is plain arithmetic over dated completion events: rates,
 * runs, medians, comparisons against the user's own record. No model, no
 * inference, no LLM. That is deliberate: these findings drive suggestions that
 * change someone's schedule, so they have to be exact, explainable and
 * identical on every device — including an iPhone where no language model can
 * run at all. The language model (lib/intelligence/progressFacts.ts) only
 * rephrases what this module has already established.
 *
 * Detectors, each gated on enough evidence to be worth saying:
 *
 *  - chronic_miss  — a task that keeps slipping, with a diagnosis: misses
 *                    concentrated on one weekday, a time slot this person rarely
 *                    finishes in, or a session too long to start.
 *  - stalled_plan  — a running plan with no completions for two weeks while
 *                    other work is getting done.
 *  - overload      — the week asks for far more than this person sustains.
 *  - weekday_dip   — one weekday finishes far less than the rest.
 *  - declining     — completion has fallen three complete weeks running.
 *  - momentum      — real, earned progress worth naming (runs, best weeks).
 *
 * Tone follows the product: observations, not verdicts (a completion rate is
 * evidence, not a judgement of character), and wins are reported only when
 * they are true.
 *
 * Pure and React-free, so it is unit-testable directly.
 */

import type { DayKey, Schedule } from "../useScheduleDB";
import { DAYS, DAY_FULL_LABELS } from "../scheduleConstants";
import { localISODate, addDaysToISO } from "../dateUtils";
import { formatDisplayTime, inputToDisplayTime, minutesToInputTime, parseTimeToMinutes, toScheduleDayMinutes } from "../timeUtils";
import { findAvailableSlots } from "../availableSlots";
import {
  computeSlotReliability,
  suggestBetterBand,
  strongestBand,
  bandForMinutes,
  TIME_BANDS,
  type SlotReliability,
  type TimeBandId,
} from "../slotReliability";
import {
  computeCapacityModel,
  plannedWeeklyMinutes,
  assessPlannedLoad,
  heaviestDay,
  type CapacityModel,
  type LoadVerdict,
} from "../capacityModel";
import { computeExecutionTrend, type ExecutionTrend } from "../executionAnalytics";
import { computeTaskStats, type TaskExecutionStats } from "./taskStats";
import { appliedSince, isInsightDismissed } from "./suggestions";
import type { Insight, Suggestion } from "./types";

// ── Tuning ───────────────────────────────────────────────────────────────────

/** A task finishing at or below this rate is slipping, not wobbling. */
export const CHRONIC_MISS_RATE = 0.4;
/** …and still slipping: at least this many misses in its last three outcomes. */
export const CHRONIC_RECENT_MISSES = 2;
/** A weekday finishing at or below this, while the task's other days do well. */
export const WEAK_WEEKDAY_RATE = 0.25;
export const STRONG_OTHER_DAYS_RATE = 0.6;
/** Sessions at least this long are offered a smaller version. */
export const SHORTEN_MIN_MINUTES = 60;
/** Never shorten below this — under it, it's not the same task any more. */
export const SHORTEN_FLOOR_MINUTES = 15;

/** A plan with no completions across this many days, while others progress. */
export const STALL_WINDOW_DAYS = 14;
export const STALL_MIN_RESOLVED = 4;

/** A weekday this far below the rest of the week, with enough samples. */
export const WEEKDAY_DIP_GAP = 0.25;
export const WEEKDAY_DIP_MAX_RATE = 0.45;
export const WEEKDAY_DIP_MIN_SAMPLES = 6;

/** Total drop across three falling weeks before it's worth naming. */
export const DECLINE_MIN_DROP_PCT = 15;

/** A run this long is worth naming. */
export const MOMENTUM_MIN_RUN = 5;

/** How many risk/watch insights the card shows, at most. */
export const MAX_INSIGHTS = 3;
export const MAX_WINS = 2;

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExecutionReport {
  todayISO: string;
  /** Ranked risk/watch insights, not dismissed, capped at MAX_INSIGHTS. */
  insights: Insight[];
  /** Earned progress, capped at MAX_WINS. */
  wins: Insight[];
  /** Everything detected before dismissal and capping — for the summary. */
  all: Insight[];
  taskStats: TaskExecutionStats[];
  reliability: SlotReliability;
  capacity: CapacityModel;
  load: LoadVerdict | null;
  trend: ExecutionTrend;
  /** Resolved occurrences sampled across all tasks. Zero = nothing to say yet. */
  sampleSize: number;
}

// ── Formatting ───────────────────────────────────────────────────────────────

export function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** A time in the format tasks store ("07:30 AM"). */
function clock(minutes: number): string {
  return inputToDisplayTime(minutesToInputTime(minutes));
}

/** "7:30 AM – 8:00 AM", for copy — stored times are zero-padded. */
function range(t: { startTime: string; endTime: string }): string {
  return `${formatDisplayTime(t.startTime)} – ${formatDisplayTime(t.endTime)}`;
}

/** How a band reads mid-sentence: "in the early morning", "late in the evening". */
export function bandPhrase(id: TimeBandId): string {
  switch (id) {
    case "early": return "in the early morning";
    case "morning": return "in the morning";
    case "afternoon": return "in the afternoon";
    case "evening": return "in the evening";
    case "night": return "late at night";
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Bands run 4am→4am; a 1am start belongs after 11pm, not before 5am. */
function bandSpace(minutes: number): number {
  return minutes < 4 * 60 ? minutes + 24 * 60 : minutes;
}

// ── Retime target ────────────────────────────────────────────────────────────

/** The next date (1–7 days out) that falls on `day`. */
function nextDateOn(day: DayKey, todayISO: string): string {
  const todayIndex = (new Date(`${todayISO}T12:00:00`).getDay() + 6) % 7;
  const ahead = ((DAYS.indexOf(day) - todayIndex + 7) % 7) || 7;
  return addDaysToISO(todayISO, ahead);
}

/**
 * Where in `band` this task could actually go: the time this person usually
 * starts the work they DO finish in that band, nudged in 15-minute steps until
 * it fits the free time on every day the task runs. Null when nothing fits —
 * a suggestion that double-books the morning is not advice.
 */
export function findRetimeTarget(
  schedule: Schedule,
  stats: Pick<TaskExecutionStats, "taskId" | "days" | "durationMinutes">,
  band: TimeBandId,
  allStats: readonly TaskExecutionStats[],
  todayISO: string,
): number | null {
  const def = TIME_BANDS.find((b) => b.id === band);
  const duration = stats.durationMinutes;
  if (!def || duration <= 0) return null;

  const finishedStarts = allStats.flatMap((s) =>
    s.outcomes
      .filter((o) => o.done && o.startMinutes !== null && bandForMinutes(o.startMinutes) === band)
      .map((o) => bandSpace(o.startMinutes!)),
  );
  const anchorRaw = median(finishedStarts) ?? def.startMinutes + 60;
  const anchor = Math.round(anchorRaw / 15) * 15;

  const candidates: number[] = [];
  for (let step = 0; step <= (def.endMinutes - def.startMinutes) / 15; step++) {
    for (const c of step === 0 ? [anchor] : [anchor + step * 15, anchor - step * 15]) {
      if (c >= def.startMinutes && c < def.endMinutes) candidates.push(c);
    }
  }

  const freeByDay = stats.days.map((day) =>
    findAvailableSlots(
      (schedule.activities[day] ?? []).filter((t) => t.id !== stats.taskId),
      nextDateOn(day, todayISO),
      schedule.preferences,
    ),
  );

  for (const candidate of candidates) {
    const start = toScheduleDayMinutes(candidate % (24 * 60));
    const fits = freeByDay.every((gaps) =>
      gaps.some((g) => g.startMinutes <= start && start + duration <= g.endMinutes),
    );
    if (fits) return candidate % (24 * 60);
  }
  return null;
}

// ── Detectors ────────────────────────────────────────────────────────────────

function weekdayConcentration(stats: TaskExecutionStats): { weak: DayKey[]; weakRate: number; otherRate: number } | null {
  const entries = Object.entries(stats.byWeekday) as [DayKey, { resolved: number; completed: number }][];
  const weak = entries.filter(([, t]) => t.resolved >= 2 && t.completed / t.resolved <= WEAK_WEEKDAY_RATE);
  if (weak.length === 0 || weak.length === entries.length) return null;
  const weakSet = new Set(weak.map(([d]) => d));
  const others = entries.filter(([d]) => !weakSet.has(d));
  const otherResolved = others.reduce((s, [, t]) => s + t.resolved, 0);
  const otherCompleted = others.reduce((s, [, t]) => s + t.completed, 0);
  if (otherResolved < 2 || otherCompleted / otherResolved < STRONG_OTHER_DAYS_RATE) return null;
  const weakResolved = weak.reduce((s, [, t]) => s + t.resolved, 0);
  const weakCompleted = weak.reduce((s, [, t]) => s + t.completed, 0);
  return { weak: weak.map(([d]) => d), weakRate: weakCompleted / weakResolved, otherRate: otherCompleted / otherResolved };
}

function dayList(days: DayKey[]): string {
  const names = days.map((d) => `${DAY_FULL_LABELS[d]}s`);
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function detectChronicMisses(
  schedule: Schedule,
  allStats: TaskExecutionStats[],
  reliability: SlotReliability,
  todayISO: string,
): Insight[] {
  const out: Insight[] = [];

  for (const s of allStats) {
    if (s.rate === null || s.rate > CHRONIC_MISS_RATE) continue;
    if (s.recentMisses < CHRONIC_RECENT_MISSES) continue;

    const title = s.task.title;
    const record = `Done ${s.completed} of the last ${s.resolved}`;
    let detail = `${record} (${pct(s.rate)}).`;
    let fact = `"${title}": done ${s.completed} of last ${s.resolved} (${pct(s.rate)})`;
    let suggestion: Suggestion | undefined;

    // 1. Misses concentrated on particular weekdays — the most specific
    //    diagnosis, so it wins. Retiming every day would punish the days
    //    that work. Which days to drop is the user's call: open the editor.
    const concentration = weekdayConcentration(s);
    const better = !concentration && s.adjustable ? suggestBetterBand(reliability, s.task) : null;
    const target = better ? findRetimeTarget(schedule, s, better.to.band, allStats, todayISO) : null;

    if (concentration) {
      const days = dayList(concentration.weak);
      detail = `${record}. ${days} run at ${pct(concentration.weakRate)}; the other days at ${pct(concentration.otherRate)}.`;
      fact += `; ${days} ${pct(concentration.weakRate)} vs other days ${pct(concentration.otherRate)}`;
      suggestion = {
        kind: "review_task",
        taskId: s.taskId,
        label: concentration.weak.length === 1 ? `Review ${DAY_FULL_LABELS[concentration.weak[0]]}` : "Review days",
        changes: [`Opens "${title}" so you can drop or move ${days}`],
      };
    } else if (better && target !== null) {
      // 2. Parked in a band this person rarely finishes, with a better one free.
      const to = { startTime: clock(target), endTime: clock(target + s.durationMinutes) };
      detail = `${record}. You finish ${pct(better.from.rate)} of what you schedule ${bandPhrase(better.from.band)}, ${pct(better.to.rate)} ${bandPhrase(better.to.band)}.`;
      fact += `; ${bandPhrase(better.from.band)} ${pct(better.from.rate)} vs ${bandPhrase(better.to.band)} ${pct(better.to.rate)}`;
      suggestion = {
        kind: "retime",
        taskId: s.taskId,
        from: { startTime: s.task.startTime, endTime: s.task.endTime },
        to,
        label: `Move to ${formatDisplayTime(to.startTime)}`,
        changes: [`${range(s.task)} → ${range(to)}, every day it runs`],
      };
    } else if (s.adjustable && s.durationMinutes >= SHORTEN_MIN_MINUTES) {
      // 3. Long enough that starting is the hard part. A smaller session
      //    that happens beats a full one that doesn't.
      const minutes = Math.max(SHORTEN_FLOOR_MINUTES, Math.round(s.durationMinutes / 2 / 5) * 5);
      const start = parseTimeToMinutes(s.task.startTime) ?? 0;
      const to = { startTime: s.task.startTime, endTime: clock(start + minutes) };
      detail = `${record} (${pct(s.rate)}) at ${formatDuration(s.durationMinutes)} a session.`;
      fact += `; ${formatDuration(s.durationMinutes)} per session`;
      suggestion = {
        kind: "shorten",
        taskId: s.taskId,
        from: { startTime: s.task.startTime, endTime: s.task.endTime },
        to,
        label: `Shorten to ${formatDuration(minutes)}`,
        changes: [
          `${formatDuration(s.durationMinutes)} → ${formatDuration(minutes)} (${range(to)})`,
          "A session you finish beats a longer one you skip",
        ],
      };
    } else {
      suggestion = {
        kind: "review_task",
        taskId: s.taskId,
        label: "Review task",
        changes: [`Opens "${title}" — change its days, time or size, or pause its plan`],
      };
    }

    out.push({
      id: `chronic_miss:${s.taskId}`,
      kind: "chronic_miss",
      tone: "risk",
      title: `${title} keeps slipping`,
      detail,
      summary: `${title} keeps slipping — done ${s.completed} of the last ${s.resolved}.`,
      fact,
      // Worse rate and more evidence rank higher.
      score: 100 + Math.round((1 - s.rate) * 40) + Math.min(s.resolved, 20),
      suggestion,
      subjectId: s.taskId,
    });
  }
  return out;
}

function detectStalledPlans(schedule: Schedule, allStats: TaskExecutionStats[], todayISO: string): Insight[] {
  const windowStart = addDaysToISO(todayISO, -STALL_WINDOW_DAYS);
  const inWindow = (s: TaskExecutionStats) => s.outcomes.filter((o) => o.dateISO >= windowStart);
  const completedElsewhere = (planId: string) =>
    allStats.some((s) => s.plan?.id !== planId && inWindow(s).some((o) => o.done));

  const out: Insight[] = [];
  for (const plan of schedule.plans) {
    if ((plan.status ?? "active") !== "active") continue;
    const outcomes = allStats.filter((s) => s.plan?.id === plan.id).flatMap(inWindow);
    if (outcomes.length < STALL_MIN_RESOLVED || outcomes.some((o) => o.done)) continue;
    // If nothing at all is getting done, that's a different conversation
    // (rest, illness, a hard fortnight) — not this plan's problem.
    if (!completedElsewhere(plan.id)) continue;

    out.push({
      id: `stalled_plan:${plan.id}`,
      kind: "stalled_plan",
      tone: "risk",
      title: `${plan.title} has gone quiet`,
      detail: `No completions in ${STALL_WINDOW_DAYS} days across ${plural(outcomes.length, "scheduled session")}, while your other plans kept moving.`,
      summary: `${plan.title} has gone quiet — nothing done there in ${STALL_WINDOW_DAYS} days.`,
      fact: `plan "${plan.title}": 0 of ${outcomes.length} sessions done in ${STALL_WINDOW_DAYS} days`,
      score: 95,
      subjectId: plan.id,
      suggestion: {
        kind: "pause_plan",
        planId: plan.id,
        label: "Pause plan",
        changes: [
          `"${plan.title}" stops appearing in Today`,
          "Nothing is deleted; resume any time and it's back as it was",
        ],
      },
    });
  }
  return out;
}

function detectOverload(schedule: Schedule, capacity: CapacityModel, load: LoadVerdict | null, now: Date): Insight[] {
  if (!load || load.level !== "unrealistic") return [];
  const heavy = heaviestDay(schedule, capacity, now);
  // Same "29.5h" form load.message uses, so the fact and the sentence the
  // user reads quote identical numbers.
  const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
  const planned = hours(load.plannedMinutes);
  const usual = hours(load.sustainedMinutes);
  return [{
    id: "overload:week",
    kind: "overload",
    tone: "watch",
    title: "This week asks for more than you usually finish",
    detail: heavy
      ? `${load.message} ${DAY_FULL_LABELS[heavy.day]} is the heaviest day.`
      : load.message,
    summary: `This week asks for ${planned}; you typically complete ${usual}.`,
    fact: `this week plans ${planned} of work; typical completed week is ${usual}`,
    score: 80,
    suggestion: heavy
      ? {
          kind: "review_day",
          day: heavy.day,
          label: `Review ${DAY_FULL_LABELS[heavy.day]}`,
          changes: [`${formatDuration(heavy.plannedMinutes)} planned vs ${formatDuration(heavy.usualMinutes)} you usually finish`],
        }
      : undefined,
  }];
}

function detectWeekdayDip(reliability: SlotReliability): Insight[] {
  const cells = Object.entries(reliability.byWeekday) as [DayKey, { resolved: number; completed: number; rate: number | null }][];
  const totalResolved = cells.reduce((s, [, c]) => s + c.resolved, 0);
  const totalCompleted = cells.reduce((s, [, c]) => s + c.completed, 0);

  let worst: { day: DayKey; rate: number; others: number } | null = null;
  for (const [day, cell] of cells) {
    if (cell.rate === null || cell.resolved < WEEKDAY_DIP_MIN_SAMPLES || cell.rate > WEEKDAY_DIP_MAX_RATE) continue;
    const otherResolved = totalResolved - cell.resolved;
    if (otherResolved < WEEKDAY_DIP_MIN_SAMPLES) continue;
    const others = (totalCompleted - cell.completed) / otherResolved;
    if (others - cell.rate < WEEKDAY_DIP_GAP) continue;
    if (!worst || cell.rate < worst.rate) worst = { day, rate: cell.rate, others };
  }
  if (!worst) return [];

  const name = DAY_FULL_LABELS[worst.day];
  return [{
    id: `weekday_dip:${worst.day}`,
    kind: "weekday_dip",
    tone: "watch",
    title: `${name}s are your toughest day`,
    detail: `You finish ${pct(worst.rate)} of what's scheduled on ${name}s, ${pct(worst.others)} on other days.`,
    summary: `${name}s are your toughest day: ${pct(worst.rate)} done, against ${pct(worst.others)} on other days.`,
    fact: `${name}s ${pct(worst.rate)} done vs other days ${pct(worst.others)}`,
    score: 60,
    suggestion: {
      kind: "review_day",
      day: worst.day,
      label: `Review ${name}`,
      changes: [`Lighter ${name}s tend to get finished`],
    },
  }];
}

function completeWeeks(trend: ExecutionTrend) {
  return trend.weeks.filter((w) => !w.isCurrentWeek && w.scheduled > 0);
}

function detectDecline(trend: ExecutionTrend): Insight[] {
  const last = completeWeeks(trend).slice(-4);
  if (last.length < 4) return [];
  const falling = last.every((w, i) => i === 0 || w.pct < last[i - 1].pct);
  const drop = last[0].pct - last[3].pct;
  if (!falling || drop < DECLINE_MIN_DROP_PCT) return [];
  const series = last.map((w) => `${w.pct}%`).join(" → ");
  return [{
    id: `declining:${last[3].monStr}`,
    kind: "declining",
    tone: "watch",
    title: "Completion has slipped three weeks running",
    detail: `Weekly completion went ${series}.`,
    summary: `Completion has slipped three weeks running (${series}).`,
    fact: `weekly completion fell three weeks running: ${series}`,
    score: 55,
  }];
}

function detectMomentum(allStats: TaskExecutionStats[], trend: ExecutionTrend, reliability: SlotReliability): Insight[] {
  const wins: Insight[] = [];

  const longest = [...allStats]
    .filter((s) => s.currentRun >= MOMENTUM_MIN_RUN)
    .sort((a, b) => b.currentRun - a.currentRun)[0];
  if (longest) {
    wins.push({
      id: `momentum:run:${longest.taskId}`,
      kind: "momentum",
      tone: "win",
      title: `${longest.task.title}: ${longest.currentRun} in a row`,
      detail: `Every one of the last ${longest.currentRun} scheduled sessions done.`,
      summary: `${longest.task.title}: ${longest.currentRun} in a row and counting.`,
      fact: `"${longest.task.title}" done ${longest.currentRun} times in a row`,
      score: 40 + longest.currentRun,
      subjectId: longest.taskId,
    });
  }

  const weeks = completeWeeks(trend);
  const lastWeek = weeks[weeks.length - 1];
  if (weeks.length >= 3 && lastWeek) {
    const best = Math.max(...weeks.map((w) => w.pct));
    const average = weeks.reduce((s, w) => s + w.pct, 0) / weeks.length;
    if (lastWeek.pct === best && lastWeek.pct > average && lastWeek.pct > 0) {
      wins.push({
        id: `momentum:week:${lastWeek.monStr}`,
        kind: "momentum",
        tone: "win",
        title: `Best week in ${weeks.length}`,
        detail: `Last week you finished ${lastWeek.pct}% of what you planned.`,
        summary: `That was your best week in ${weeks.length}.`,
        fact: `last week ${lastWeek.pct}% done, best of the last ${weeks.length} weeks`,
        score: 45,
      });
    }
  }

  const strong = strongestBand(reliability);
  if (strong && wins.length < MAX_WINS) {
    wins.push({
      id: `momentum:band:${strong.band}`,
      kind: "momentum",
      tone: "win",
      title: `Your strongest stretch is ${bandPhrase(strong.band).replace(/^in the /, "the ")}`,
      detail: `You finish ${pct(strong.rate)} of what you schedule ${bandPhrase(strong.band)}.`,
      summary: `You finish ${pct(strong.rate)} of what you schedule ${bandPhrase(strong.band)}.`,
      fact: `${pct(strong.rate)} done ${bandPhrase(strong.band)}`,
      score: 30,
    });
  }

  return wins;
}

// ── The report ───────────────────────────────────────────────────────────────

export function analyzeExecution(schedule: Schedule, now: Date = new Date()): ExecutionReport {
  const todayISO = localISODate(now);
  const taskStats = computeTaskStats(schedule, now, { sinceByTask: appliedSince(schedule) });
  const reliability = computeSlotReliability(schedule, now);
  const capacity = computeCapacityModel(schedule, now);
  const load = assessPlannedLoad(capacity, plannedWeeklyMinutes(schedule, now));
  const trend = computeExecutionTrend(schedule, 8, now);

  const detected = [
    ...detectChronicMisses(schedule, taskStats, reliability, todayISO),
    ...detectStalledPlans(schedule, taskStats, todayISO),
    ...detectOverload(schedule, capacity, load, now),
    ...detectWeekdayDip(reliability),
    ...detectDecline(trend),
  ];

  // One finding per subject: a task in a stalled plan reads as the plan's
  // problem, not five separate ones.
  const stalledPlans = new Set(detected.filter((i) => i.kind === "stalled_plan").map((i) => i.subjectId));
  const deduped = detected.filter(
    (i) => i.kind !== "chronic_miss" || !stalledPlans.has(taskStats.find((s) => s.taskId === i.subjectId)?.plan?.id),
  );

  const ranked = deduped.sort((a, b) => b.score - a.score);
  const momentum = detectMomentum(taskStats, trend, reliability).sort((a, b) => b.score - a.score);
  const visible = (i: Insight) => !isInsightDismissed(schedule, i.id, todayISO);

  return {
    todayISO,
    insights: ranked.filter(visible).slice(0, MAX_INSIGHTS),
    wins: momentum.filter(visible).slice(0, MAX_WINS),
    all: [...ranked, ...momentum],
    taskStats,
    reliability,
    capacity,
    load,
    trend,
    sampleSize: taskStats.reduce((s, t) => s + t.resolved, 0),
  };
}
