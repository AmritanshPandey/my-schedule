/**
 * Intelligence while building — a second pair of eyes on goals, milestones and
 * tasks as they're written, before they become a plan that quietly fails.
 *
 * Two kinds of check, both instant and model-free (so they work on iPhone,
 * where no language model may run):
 *
 *  - **Text checks** — light NLP over what was typed: vague verbs ("get
 *    better at…"), nothing measurable, two goals glued together with "and",
 *    a missing or impossible deadline, a near-duplicate of something that
 *    already exists.
 *  - **Evidence checks** — the user's own record, from the pattern engine:
 *    "you finish 24% of what you schedule late at night", "your 90-minute
 *    sessions get done a third as often as shorter ones", "this takes the
 *    week past anything you've completed".
 *
 * Hints are advisory and never block saving. At most a couple are shown at a
 * time (`MAX_HINTS`), most useful first — a form that lectures stops being read.
 *
 * Pure and React-free.
 */

import type { DayKey, Milestone, Schedule } from "../useScheduleDB";
import { DAY_FULL_LABELS } from "../scheduleConstants";
import { localISODate } from "../dateUtils";
import { formatDisplayTime, inputToDisplayTime, minutesToInputTime, parseTimeToMinutes } from "../timeUtils";
import { detectMeasurableGoal } from "../milestoneIntelligence";
import { bandForMinutes, computeSlotReliability, suggestBetterBand, type SlotReliability } from "../slotReliability";
import { computeCapacityModel, plannedWeeklyMinutes, UNREALISTIC_RATIO, type CapacityModel } from "../capacityModel";
import { computeTaskStats, taskDurationMinutes, type TaskExecutionStats } from "./taskStats";
import { bandPhrase, findRetimeTarget, formatDuration, pct } from "./patterns";

export const MAX_HINTS = 2;

export interface BuilderHint {
  id: string;
  /** warn = likely to cause trouble; tip = would make it better. */
  tone: "warn" | "tip";
  message: string;
  /** Optional one-tap fix. Times are HTML input values ("07:30"). */
  action?: { kind: "set_time"; label: string; startTime: string; endTime: string };
}

// ── Text helpers ─────────────────────────────────────────────────────────────

const STOPWORDS = new Set(["a", "an", "the", "my", "to", "for", "of", "and", "in", "on", "at", "with", "every", "each", "daily"]);

/** Lowercased content words — enough to notice "Morning run" ≈ "Run (morning)". */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Jaccard overlap of content words, 0–1. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(titleTokens(a));
  const tb = new Set(titleTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

export const DUPLICATE_SIMILARITY = 0.75;

/** Phrases that describe an effort rather than a result. */
const VAGUE = /\b(get better at|get better|improve|be (?:more|less|better)|work on|try to|focus on|learn about|get into|get (?:fit|healthy|organi[sz]ed)|build (?:a |the )?(?:\w+ )?habit|stay (?:on top|consistent))\b/i;

/** Verbs that start a second outcome in "Lose 5kg and learn Spanish". */
const OUTCOME_VERBS = /^(lose|gain|learn|run|read|write|build|launch|ship|start|finish|save|earn|get|pass|complete|publish|hire|grow|cut|quit|reach|land|apply|study|practice|practise|train|master)\b/i;

export function findVaguePhrase(text: string): string | null {
  return VAGUE.exec(text)?.[0] ?? null;
}

export function isMeasurable(text: string): boolean {
  return detectMeasurableGoal(text) !== null || /\d/.test(text);
}

/** "Lose 5kg and learn Spanish" → true; "Read and summarise 10 papers" → false. */
export function looksCompound(title: string): boolean {
  const parts = title.split(/\s+(?:and|&|\+)\s+/i);
  if (parts.length < 2) return false;
  return parts.slice(1).some((part, i) => {
    const before = parts[i].trim().split(/\s+/);
    return before.length >= 2 && OUTCOME_VERBS.test(part.trim());
  });
}

// ── Goals ────────────────────────────────────────────────────────────────────

export interface GoalDraft {
  title: string;
  description?: string;
  startDate?: string;
  targetDate?: string;
}

export function reviewGoalDraft(draft: GoalDraft, now: Date = new Date()): BuilderHint[] {
  const title = draft.title.trim();
  if (title.length < 4) return [];
  const text = `${title} ${draft.description ?? ""}`;
  const todayISO = localISODate(now);
  const hints: BuilderHint[] = [];

  if (draft.targetDate && draft.startDate && draft.targetDate < draft.startDate) {
    hints.push({ id: "goal-dates", tone: "warn", message: "The target date is before the start date." });
  } else if (draft.targetDate && draft.targetDate < todayISO) {
    hints.push({ id: "goal-past", tone: "warn", message: "That target date has already passed." });
  }

  if (looksCompound(title)) {
    hints.push({
      id: "goal-compound",
      tone: "tip",
      message: "This reads like two goals. Split them so each gets its own milestones and its own progress.",
    });
  }

  const vague = findVaguePhrase(text);
  if (vague && !isMeasurable(text)) {
    hints.push({
      id: "goal-vague",
      tone: "tip",
      message: `"${vague}" has no finish line. Name the result that would prove it — "Run 5K in under 30 min" beats "get fitter".`,
    });
  } else if (!isMeasurable(text)) {
    hints.push({
      id: "goal-measure",
      tone: "tip",
      message: "Add something you can check — a number, a score, a date it ships. It's what milestones and tracking will measure.",
    });
  }

  if (!draft.targetDate) {
    hints.push({
      id: "goal-deadline",
      tone: "tip",
      message: "Add a target date. A deadline is what lets PlanR pace the milestones and flag slippage early.",
    });
  }

  return hints.slice(0, MAX_HINTS);
}

// ── Milestones ───────────────────────────────────────────────────────────────

export interface MilestoneDraft {
  title: string;
  description?: string;
  startDate: string;
  plannedDurationDays: number;
  plannedEndDate: string;
  /** Edit mode only — a new milestone has nothing linked yet by definition. */
  linkedActivities?: string[];
  linkedTrackers?: string[];
}

export const MILESTONE_MIN_DAYS = 3;
export const MILESTONE_MAX_DAYS = 90;

export function reviewMilestoneDraft(
  draft: MilestoneDraft,
  siblings: readonly Pick<Milestone, "id" | "title">[],
  options: { mode: "create" | "edit"; editingId?: string; now?: Date },
): BuilderHint[] {
  const title = draft.title.trim();
  if (title.length < 3) return [];
  const todayISO = localISODate(options.now ?? new Date());
  const text = `${title} ${draft.description ?? ""}`;
  const hints: BuilderHint[] = [];

  const duplicate = siblings.find(
    (m) => m.id !== options.editingId && titleSimilarity(m.title, title) >= DUPLICATE_SIMILARITY,
  );
  if (duplicate) {
    hints.push({ id: "ms-duplicate", tone: "warn", message: `This plan already has "${duplicate.title}".` });
  }

  if (options.mode === "create" && draft.plannedEndDate && draft.plannedEndDate < todayISO) {
    hints.push({ id: "ms-past", tone: "warn", message: "With these dates the milestone would already be over." });
  }

  if (
    options.mode === "edit"
    && (draft.linkedActivities?.length ?? 0) === 0
    && (draft.linkedTrackers?.length ?? 0) === 0
  ) {
    hints.push({
      id: "ms-unlinked",
      tone: "warn",
      message: "Nothing is linked to this milestone yet, so its progress can't be measured. Open it on the plan page to link tasks or a tracker.",
    });
  }

  const vague = findVaguePhrase(text);
  if (vague && !isMeasurable(text)) {
    hints.push({
      id: "ms-vague",
      tone: "tip",
      message: `Make the finish line checkable — "Run 5K without stopping" rather than "${vague}".`,
    });
  }

  if (draft.plannedDurationDays > 0 && draft.plannedDurationDays < MILESTONE_MIN_DAYS) {
    hints.push({
      id: "ms-short",
      tone: "tip",
      message: `Under ${MILESTONE_MIN_DAYS} days is closer to a task than a milestone — one missed session and it's gone.`,
    });
  } else if (draft.plannedDurationDays > MILESTONE_MAX_DAYS) {
    hints.push({
      id: "ms-long",
      tone: "tip",
      message: "That's a long stretch with no checkpoint. Splitting it gives you a win to aim for every few weeks.",
    });
  }

  return hints.slice(0, MAX_HINTS);
}

// ── Tasks ────────────────────────────────────────────────────────────────────

/** Everything the task check reads from the schedule, computed once per open. */
export interface TaskReviewContext {
  schedule: Schedule;
  reliability: SlotReliability;
  capacity: CapacityModel;
  plannedMinutes: number;
  taskStats: TaskExecutionStats[];
  todayISO: string;
}

export function buildTaskReviewContext(schedule: Schedule, now: Date = new Date()): TaskReviewContext {
  return {
    schedule,
    reliability: computeSlotReliability(schedule, now),
    capacity: computeCapacityModel(schedule, now),
    plannedMinutes: plannedWeeklyMinutes(schedule, now),
    taskStats: computeTaskStats(schedule, now),
    todayISO: localISODate(now),
  };
}

export interface TaskDraft {
  title: string;
  taskType?: "task" | "session" | "commitment";
  days: DayKey[];
  /** HTML input values ("07:30"); one block. */
  startTime: string;
  endTime: string;
  /** The task being edited, if any. */
  taskId?: string;
}

/** Sessions this long or longer are compared against shorter ones. */
export const LONG_SESSION_MINUTES = 90;
const LONG_MIN_SAMPLES = 8;
const LONG_GAP = 0.25;

function inputMinutes(value: string): number | null {
  return parseTimeToMinutes(value);
}

function draftDuration(draft: TaskDraft): number {
  const start = inputMinutes(draft.startTime);
  const end = inputMinutes(draft.endTime);
  if (start === null || end === null) return 0;
  return end >= start ? end - start : end + 24 * 60 - start;
}

export function reviewTaskDraft(draft: TaskDraft, ctx: TaskReviewContext): BuilderHint[] {
  const hints: BuilderHint[] = [];
  const title = draft.title.trim();
  const tracked = draft.taskType !== "commitment";

  // Near-duplicate on a day it would share — new tasks only.
  if (!draft.taskId && title.length >= 3) {
    const twin = draft.days
      .flatMap((day) => ctx.schedule.activities[day] ?? [])
      .find((t) => titleSimilarity(t.title, title) >= DUPLICATE_SIMILARITY);
    if (twin) {
      const shared = draft.days.filter((d) => (ctx.schedule.activities[d] ?? []).some((t) => t.id === twin.id));
      hints.push({
        id: "task-duplicate",
        tone: "warn",
        message: `You already have "${twin.title}" on ${shared.map((d) => DAY_FULL_LABELS[d]).join(", ")}.`,
      });
    }
  }

  const start = inputMinutes(draft.startTime);
  const duration = draftDuration(draft);
  if (!tracked || start === null || duration <= 0 || draft.days.length === 0) return hints.slice(0, MAX_HINTS);

  // When this person actually finishes work — with a free better slot.
  const draftSlot = { startTime: inputToDisplayTime(draft.startTime) };
  const better = suggestBetterBand(ctx.reliability, draftSlot);
  if (better) {
    const target = findRetimeTarget(
      ctx.schedule,
      { taskId: draft.taskId ?? "__draft__", days: draft.days, durationMinutes: duration },
      better.to.band,
      ctx.taskStats,
      ctx.todayISO,
    );
    hints.push({
      id: "task-band",
      tone: "warn",
      message: `You finish ${pct(better.from.rate)} of what you schedule ${bandPhrase(better.from.band)}, ${pct(better.to.rate)} ${bandPhrase(better.to.band)}.`,
      action: target !== null && bandForMinutes(target) === better.to.band
        ? {
            kind: "set_time",
            label: `Move to ${formatDisplayTime(minutesToInputTime(target))}`,
            startTime: minutesToInputTime(target),
            endTime: minutesToInputTime(target + duration),
          }
        : undefined,
    });
  }

  // Long sessions, if this person's record says they're the ones that slip.
  if (duration >= LONG_SESSION_MINUTES) {
    const others = ctx.taskStats.filter((s) => s.taskId !== draft.taskId);
    const long = others.filter((s) => taskDurationMinutes(s.task) >= LONG_SESSION_MINUTES);
    const short = others.filter((s) => taskDurationMinutes(s.task) < LONG_SESSION_MINUTES);
    const rate = (list: TaskExecutionStats[]) => {
      const resolved = list.reduce((n, s) => n + s.resolved, 0);
      return resolved >= LONG_MIN_SAMPLES ? list.reduce((n, s) => n + s.completed, 0) / resolved : null;
    };
    const longRate = rate(long);
    const shortRate = rate(short);
    if (longRate !== null && shortRate !== null && shortRate - longRate >= LONG_GAP) {
      hints.push({
        id: "task-long",
        tone: "tip",
        message: `Your sessions of ${formatDuration(LONG_SESSION_MINUTES)} or more get done ${pct(longRate)} of the time; shorter ones ${pct(shortRate)}. A smaller block may stick better.`,
      });
    }
  }

  // Does this tip the week past anything this person sustains?
  const sustained = ctx.capacity.sustainedWeeklyMinutes;
  if (ctx.capacity.hasEnoughData && sustained && sustained > 0) {
    const existing = draft.taskId
      ? ctx.taskStats.find((s) => s.taskId === draft.taskId)
      : undefined;
    const existingWeekly = existing ? existing.durationMinutes * existing.days.length : 0;
    const added = duration * draft.days.length - existingWeekly;
    const after = ctx.plannedMinutes + added;
    if (added > 0 && after / sustained >= UNREALISTIC_RATIO) {
      const hours = (m: number) => `${Math.round((m / 60) * 10) / 10}h`;
      hints.push({
        id: "task-capacity",
        tone: "warn",
        message: `With this, the week asks for ${hours(after)}. You typically complete ${hours(sustained)}.`,
      });
    }
  }

  return hints.slice(0, MAX_HINTS);
}
