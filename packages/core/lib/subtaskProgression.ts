/**
 * Progressive increase for a subtask: once the user has done it consistently
 * over a period, suggest stepping its figures up by a percentage.
 *
 * Suggestions are never applied on their own — the user accepts or holds
 * (PRODUCT.md: progress is earned, not automatic). An accept is stored as a
 * ProgressionStep with the absolute values it moved to; the subtask itself is
 * never rewritten, so the seven weekday copies of a recurring task can't drift
 * apart, and an accept syncs as one small record.
 *
 * "Consistent" counts completions of the occurrences that were actually
 * scheduled in the period — a Mon/Wed/Fri lift isn't failing on Tuesdays. It
 * does not check whether the target figures were hit; the suggestion copy says
 * what it measured.
 */

import type { ProgressionFigure, ScheduleEntry, SubtaskProgression, TargetValues } from "./scheduleEntry";
import type { DayKey, ProgressionStep, Schedule, Task, TaskCompletionEvent } from "./scheduleTypes";
import { addDaysToISO, localISODate } from "./dateUtils";
import { completionForDate } from "./taskCompletion";
import { isTaskScheduledOn } from "./taskOccurrence";
import { isPlanRunning } from "./planLifecycle";
import { periodStartISO, shiftPeriodISO } from "./trackerCadence";
import { currentTargets } from "./subtaskTargets";

const JS_DAY_KEYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const dayKeyOf = (iso: string): DayKey => JS_DAY_KEYS[new Date(`${iso}T12:00:00`).getDay()];

/** The default share of scheduled occurrences that must be done. */
export const DEFAULT_PROGRESSION_THRESHOLD = 80;

export function progressionStepId(taskId: string, subtaskId: string, periodStartISO: string): string {
  return `${taskId}~${subtaskId}~${periodStartISO}`;
}

/** [start, end] of the period `dateISO` falls in, both inclusive. */
export function periodRange(cadence: SubtaskProgression["cadence"], dateISO: string): { startISO: string; endISO: string } {
  const startISO = periodStartISO(cadence, dateISO);
  return { startISO, endISO: addDaysToISO(shiftPeriodISO(cadence, startISO, 1), -1) };
}

export interface Consistency {
  scheduled: number;
  done: number;
  /** done / scheduled, 0–1. */
  rate: number;
}

/**
 * How often one subtask was done on the days its task was scheduled between
 * `startISO` and `endISO`. Every weekday copy of the task is read, and their
 * histories combined: each copy logs only the days it was ticked on. A
 * whole-task completion counts for the subtask. Null when nothing was
 * scheduled — no evidence is not a failure.
 */
export function subtaskConsistency(
  schedule: Schedule,
  taskId: string,
  subtaskId: string,
  startISO: string,
  endISO: string,
): Consistency | null {
  const copies = new Map<DayKey, Task>();
  const events = new Map<string, TaskCompletionEvent>();
  for (const [day, tasks] of Object.entries(schedule.activities ?? {}) as [DayKey, Task[]][]) {
    const copy = tasks?.find((t) => t.id === taskId);
    if (!copy) continue;
    copies.set(day, copy);
    for (const e of copy.completionHistory ?? []) events.set(e.id ?? `${e.completedAt}~${e.completionType}~${e.subtaskId ?? ""}`, e);
  }
  if (copies.size === 0) return null;
  const any = copies.values().next().value as Task;
  const plan = any.planId ? schedule.plans.find((p) => p.id === any.planId) : undefined;
  if (plan && !isPlanRunning(plan)) return null;

  const history = [...events.values()];
  const trackingStart = schedule.preferences?.startDate;
  let scheduled = 0;
  let done = 0;
  for (let d = startISO; d <= endISO; d = addDaysToISO(d, 1)) {
    const copy = copies.get(dayKeyOf(d));
    if (!copy || !isTaskScheduledOn(copy, d, true, trackingStart)) continue;
    scheduled += 1;
    // Only the id list: a whole-task completion already lists every subtask,
    // while `completed` is a count check that a stray id (a deleted subtask's
    // tick) can satisfy.
    const c = completionForDate({ ...copy, completionHistory: history }, d);
    if (c.completedSubtaskIds.includes(subtaskId)) done += 1;
  }
  return scheduled === 0 ? null : { scheduled, done, rate: done / scheduled };
}

const weightStep = (unit: string | undefined) => (unit === "lb" ? 1 : 0.5);

/**
 * Raise figures by `percent`. Counts (sets, reps, minutes) round to whole
 * numbers and weight to the nearest plate step (0.5 kg / 1 lb), and every
 * raised figure goes up by at least one unit, so +5% on 10 reps is 11, not a
 * rounded-away 10.5 → 10. Returns only the figures that changed.
 */
export function applyPercent(values: TargetValues, percent: number, figure: ProgressionFigure): TargetValues {
  const out: TargetValues = {};
  const wants = (f: Exclude<ProgressionFigure, "all">) => figure === "all" || figure === f;
  const raiseCount = (n: number) => Math.max(n + 1, Math.round(n * (1 + percent / 100)));
  if (wants("sets") && values.sets != null) out.sets = raiseCount(values.sets);
  if (wants("reps") && values.reps != null) out.reps = raiseCount(values.reps);
  if (wants("minutes") && values.minutes != null) out.minutes = raiseCount(values.minutes);
  if (wants("weight") && values.weight != null && values.weight > 0) {
    const step = weightStep(values.weightUnit);
    const raised = Math.round((values.weight * (1 + percent / 100)) / step) * step;
    out.weight = Math.max(values.weight + step, Math.round(raised * 10) / 10);
    out.weightUnit = values.weightUnit ?? "kg";
  }
  return out;
}

export interface ProgressionSuggestion {
  taskId: string;
  subtaskId: string;
  periodStartISO: string;
  /** The figures today, before the step. */
  from: TargetValues;
  /** Only the figures the step changes. */
  to: TargetValues;
  consistency: Consistency;
}

/** Plan-template subtasks are shared by every task on the plan, so they can't carry their own progression. */
export function canProgress(task: Task): boolean {
  return task.subtasks !== undefined;
}

/**
 * The step to suggest today, or null. It is judged on the last COMPLETE
 * period, and only when that period started on or after:
 *  - the day progression was switched on,
 *  - the day the targets were last set by hand (a new base needs a full
 *    period of evidence), and
 *  - the period after the last accepted step (so each new target is lived
 *    with for a full period before the next one is offered).
 * A period already decided — accepted or held — is never offered again;
 * holding skips one period, and the next qualifying one suggests again.
 */
export function pendingProgression(
  schedule: Schedule,
  task: Task,
  entry: ScheduleEntry,
  todayISO: string,
): ProgressionSuggestion | null {
  const p = entry.progression;
  if (!p || !canProgress(task)) return null;
  const steps = schedule.progressionSteps ?? [];
  const period = periodRange(p.cadence, shiftPeriodISO(p.cadence, todayISO, -1));

  let anchor = p.startISO;
  if (entry.targetsSetAt) {
    const setDay = localISODate(new Date(entry.targetsSetAt));
    if (setDay > anchor) anchor = setDay;
  }
  for (const s of steps) {
    if (s.taskId !== task.id || s.subtaskId !== entry.id || s.decision !== "accepted") continue;
    const after = shiftPeriodISO(p.cadence, s.periodStartISO, 1);
    if (after > anchor) anchor = after;
  }
  if (period.startISO < anchor) return null;

  const id = progressionStepId(task.id, entry.id, period.startISO);
  if (steps.some((s) => s.id === id)) return null;

  const consistency = subtaskConsistency(schedule, task.id, entry.id, period.startISO, period.endISO);
  if (!consistency || consistency.rate * 100 < (p.threshold || DEFAULT_PROGRESSION_THRESHOLD)) return null;

  const from = currentTargets(entry, task.id, steps);
  const to = applyPercent(from, p.percent, p.figure);
  if (Object.keys(to).filter((k) => k !== "weightUnit").length === 0) return null;
  return { taskId: task.id, subtaskId: entry.id, periodStartISO: period.startISO, from, to, consistency };
}

/** Record the user's answer. Accepting and holding the same period overwrite each other. */
export function decideProgression(
  schedule: Schedule,
  suggestion: ProgressionSuggestion,
  decision: ProgressionStep["decision"],
  nowISO: string = new Date().toISOString(),
): Schedule {
  const step: ProgressionStep = {
    id: progressionStepId(suggestion.taskId, suggestion.subtaskId, suggestion.periodStartISO),
    taskId: suggestion.taskId,
    subtaskId: suggestion.subtaskId,
    periodStartISO: suggestion.periodStartISO,
    decision,
    to: suggestion.to,
    decidedAt: nowISO,
  };
  const rest = (schedule.progressionSteps ?? []).filter((s) => s.id !== step.id);
  return { ...schedule, progressionSteps: [...rest, step] };
}

const CADENCE_PERIOD: Record<SubtaskProgression["cadence"], string> = {
  daily: "yesterday",
  weekly: "last week",
  monthly: "last month",
  yearly: "last year",
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/** "60 → 62.5 kg · 3 → 4 sets" — what the step changes. */
export function describeStep(from: TargetValues, to: TargetValues): string {
  const parts: string[] = [];
  if (to.weight != null) parts.push(`${fmt(from.weight ?? 0)} → ${fmt(to.weight)} ${to.weightUnit ?? from.weightUnit ?? "kg"}`);
  if (to.sets != null) parts.push(`${fmt(from.sets ?? 0)} → ${fmt(to.sets)} sets`);
  if (to.reps != null) parts.push(`${fmt(from.reps ?? 0)} → ${fmt(to.reps)} reps`);
  if (to.minutes != null) parts.push(`${fmt(from.minutes ?? 0)} → ${fmt(to.minutes)} min`);
  return parts.join(" · ");
}

/** "Done 6 of 7 times last week" — what the suggestion is based on. */
export function describeEvidence(c: Consistency, cadence: SubtaskProgression["cadence"]): string {
  return `Done ${c.done} of ${c.scheduled} ${c.scheduled === 1 ? "time" : "times"} ${CADENCE_PERIOD[cadence]}`;
}

/** Every step ready to suggest for one task today, in subtask order. */
export function pendingProgressionsForTask(schedule: Schedule, task: Task, todayISO: string): ProgressionSuggestion[] {
  if (!canProgress(task)) return [];
  const out: ProgressionSuggestion[] = [];
  for (const entry of task.subtasks ?? []) {
    const s = pendingProgression(schedule, task, entry, todayISO);
    if (s) out.push(s);
  }
  return out;
}
