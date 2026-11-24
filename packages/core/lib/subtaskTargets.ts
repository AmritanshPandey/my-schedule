/**
 * A subtask's figures — sets, reps, weight, minutes — as numbers.
 *
 * Until now the only number on a subtask was `timeMinutes`; "3 × 10 reps" was
 * free text in `duration`, which nothing could grow. This module reads the
 * structured `targets`, prefills them from the old free text, applies accepted
 * progression steps on read, and is the one place that labels a subtask's
 * detail (it replaces three hand-copied pill builders).
 */

import type { ScheduleEntry, SubtaskTargets, TargetValues, WeightUnit } from "./scheduleEntry";
import type { ProgressionStep } from "./scheduleTypes";
import { formatMinutes, parseDurationMinutes } from "./timeUtils";

export interface ParsedDurationText {
  targets: SubtaskTargets;
  minutes?: number;
  /** Whatever was left once the figures were taken out ("" when nothing). */
  rest: string;
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const toNum = (s: string) => Number(s.replace(",", "."));

/**
 * Pull structured figures out of the free text people already typed:
 * "3 × 10 reps", "3x10", "3 sets of 10", "4 x 8 @ 60kg", "10 reps", "60 kg",
 * "5m". Anything it doesn't recognise is kept in `rest`, so prefilling the
 * form never throws text away.
 */
export function parseDurationText(text: string | undefined | null): ParsedDurationText {
  let rest = (text ?? "").trim();
  const targets: SubtaskTargets = {};
  let minutes: number | undefined;
  if (!rest) return { targets, rest: "" };

  const take = (re: RegExp, apply: (m: RegExpMatchArray) => void) => {
    const m = rest.match(re);
    if (!m) return;
    apply(m);
    rest = (rest.slice(0, m.index) + " " + rest.slice((m.index ?? 0) + m[0].length)).trim();
  };

  take(new RegExp(`${NUM}\\s*(kg|kgs|lb|lbs)\\b`, "i"), (m) => {
    targets.weight = toNum(m[1]);
    targets.weightUnit = (m[2].toLowerCase().startsWith("lb") ? "lb" : "kg") as WeightUnit;
  });
  take(/(\d+)\s*(?:sets?\s*(?:of|x|×)?|[x×*])\s*(\d+)(?:\s*reps?)?\b/i, (m) => {
    targets.sets = Number(m[1]);
    targets.reps = Number(m[2]);
  });
  if (targets.reps == null) take(/(\d+)\s*reps?\b/i, (m) => { targets.reps = Number(m[1]); });
  if (targets.sets == null) take(/(\d+)\s*sets?\b/i, (m) => { targets.sets = Number(m[1]); });
  take(/^(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?)?\s*\d*\s*(?:m|min|mins|minutes?))$|^(\d+(?:\.\d+)?\s*(?:h|hr|hrs|hours?))$/i, (m) => {
    const parsed = parseDurationMinutes(m[0]);
    if (parsed != null && parsed > 0) minutes = parsed;
  });

  rest = rest.replace(/^[\s@·,|–-]+|[\s@·,|–-]+$/g, "").replace(/\s{2,}/g, " ");
  return { targets, minutes, rest };
}

/** True when any strength figure is set. */
export function hasStrengthTargets(t: SubtaskTargets | undefined): boolean {
  return !!t && (t.sets != null || t.reps != null || t.weight != null);
}

/** The subtask's own figures, before any progression step. */
export function baseTargets(entry: ScheduleEntry): TargetValues {
  const out: TargetValues = { ...(entry.targets ?? {}) };
  if (entry.timeMinutes != null && entry.timeMinutes > 0) out.minutes = entry.timeMinutes;
  return out;
}

/**
 * The figures that apply today: the latest accepted step for this subtask
 * decided after the user last set targets by hand, layered over the base.
 * An edit in the form is a new base, so older steps stop applying.
 */
export function currentTargets(
  entry: ScheduleEntry,
  taskId: string,
  steps: readonly ProgressionStep[] = [],
): TargetValues {
  const base = baseTargets(entry);
  const setAt = entry.targetsSetAt ?? "";
  let latest: ProgressionStep | null = null;
  for (const s of steps) {
    if (s.taskId !== taskId || s.subtaskId !== entry.id || s.decision !== "accepted") continue;
    if (setAt && s.decidedAt <= setAt) continue;
    if (!latest || s.decidedAt > latest.decidedAt) latest = s;
  }
  return latest ? { ...base, ...latest.to } : base;
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

/** "3 × 10 · 60 kg" — the strength part of a label, or "" when there is none. */
export function formatStrengthTargets(t: SubtaskTargets): string {
  const parts: string[] = [];
  if (t.sets != null && t.reps != null) parts.push(`${fmtNum(t.sets)} × ${fmtNum(t.reps)}`);
  else if (t.reps != null) parts.push(`${fmtNum(t.reps)} reps`);
  else if (t.sets != null) parts.push(`${fmtNum(t.sets)} sets`);
  if (t.weight != null) parts.push(`${fmtNum(t.weight)} ${t.weightUnit ?? "kg"}`);
  return parts.join(" · ");
}

export interface DetailSegment {
  text: string;
  /** The time figure — rendered in Info Blue. */
  isTime?: boolean;
}

/**
 * A subtask's detail pieces, in order: info, time, strength targets, then the
 * free-text detail. The form moves figures it recognises out of the free text
 * into `targets` (subtaskDraft.ts), so the two never repeat each other.
 */
export function subtaskDetailSegments(entry: ScheduleEntry, values: TargetValues = baseTargets(entry)): DetailSegment[] | null {
  const info = entry.info?.trim() || entry.note?.trim();
  const segments: DetailSegment[] = [];
  // An ingredient's or shopping item's amount leads: it's what you read first.
  const quantity = entry.quantity?.trim();
  if (quantity) segments.push({ text: quantity });
  if (entry.cost != null && Number.isFinite(entry.cost)) {
    segments.push({ text: entry.cost.toLocaleString(undefined, { maximumFractionDigits: 2 }) });
  }
  if (info) segments.push({ text: info });
  if (values.minutes != null && values.minutes > 0) segments.push({ text: formatMinutes(values.minutes), isTime: true });
  const strength = formatStrengthTargets(values);
  if (strength) segments.push({ text: strength });
  const free = entry.duration?.trim();
  if (free) segments.push({ text: free });
  if (segments.length > 0) return segments;
  if (entry.meta && entry.meta.length > 0) return entry.meta.map((m) => ({ text: m.value }));
  if (entry.time) return [{ text: entry.time }];
  return null;
}

/** The same pieces joined for a single-line pill. */
export function subtaskDetailLabel(entry: ScheduleEntry, values?: TargetValues): string | null {
  const segments = subtaskDetailSegments(entry, values);
  return segments ? segments.map((s) => s.text).join(" · ") : null;
}
