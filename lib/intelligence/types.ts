/**
 * The vocabulary of PlanR's execution intelligence.
 *
 * An `Insight` is something the pattern engine noticed, stated with the real
 * numbers behind it. A `Suggestion` is an optional, concrete change the user
 * can accept — PlanR proposes, the user decides (PP-06). Nothing in this layer
 * mutates on its own: suggestions describe their changes in plain language,
 * and only lib/intelligence/suggestions.ts applies one, when asked.
 */

import type { DayKey } from "../useScheduleDB";

export interface TimeRange {
  /** Display times, as stored on a Task ("7:00 AM"). */
  startTime: string;
  endTime: string;
}

interface SuggestionBase {
  /** Verb-first button text ("Move to 7:00 AM"). */
  label: string;
  /** What will change, one human-readable row each — never raw data. */
  changes: string[];
}

/** Move a task into a time band this person actually finishes work in. */
export interface RetimeSuggestion extends SuggestionBase {
  kind: "retime";
  taskId: string;
  from: TimeRange;
  to: TimeRange;
}

/** Make a long, chronically skipped task small enough to actually happen. */
export interface ShortenSuggestion extends SuggestionBase {
  kind: "shorten";
  taskId: string;
  from: TimeRange;
  to: TimeRange;
}

/** Put a plan that has gone quiet on hold — reversible, deletes nothing. */
export interface PausePlanSuggestion extends SuggestionBase {
  kind: "pause_plan";
  planId: string;
}

/** Open the task so the user can change it themselves (days, time, size). */
export interface ReviewTaskSuggestion extends SuggestionBase {
  kind: "review_task";
  taskId: string;
}

/** Look at one weekday's load. */
export interface ReviewDaySuggestion extends SuggestionBase {
  kind: "review_day";
  day: DayKey;
}

export type AppliableSuggestion = RetimeSuggestion | ShortenSuggestion | PausePlanSuggestion;

export type Suggestion = AppliableSuggestion | ReviewTaskSuggestion | ReviewDaySuggestion;

export function isAppliable(s: Suggestion): s is AppliableSuggestion {
  return s.kind === "retime" || s.kind === "shorten" || s.kind === "pause_plan";
}

export type InsightKind =
  | "chronic_miss"
  | "stalled_plan"
  | "overload"
  | "weekday_dip"
  | "declining"
  | "momentum";

/** risk = act on it; watch = worth knowing; win = earned, real progress. */
export type InsightTone = "risk" | "watch" | "win";

export interface Insight {
  /** Stable across days for the same subject, e.g. "chronic_miss:task-1". */
  id: string;
  kind: InsightKind;
  tone: InsightTone;
  /** Short, sentence case. */
  title: string;
  /** One sentence quoting the real numbers. */
  detail: string;
  /** The finding as a standalone sentence for a progress note. */
  summary: string;
  /**
   * The same evidence as a compact fact line for the language model. Only
   * numbers that appear here may appear in a generated summary — see
   * validateSummary in lib/intelligence/progressFacts.ts.
   */
  fact: string;
  /** Higher = more worth the user's attention. */
  score: number;
  suggestion?: Suggestion;
  /** The task or plan this is about, when there is one. */
  subjectId?: string;
}
