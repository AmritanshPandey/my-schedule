/**
 * The task form's editable copy of a subtask, and the two mappers between it
 * and the stored `ScheduleEntry`.
 *
 * These used to live, duplicated, inside the web and native TaskSheets as
 * field-by-field allowlists — so every save silently dropped any field they
 * didn't list (`note`, `meta`, `time`, `date`, `notes` were already being
 * lost). Here the draft keeps the entry it came from and the save spreads it
 * back first, so a field the form doesn't edit survives the round trip.
 */

import type { ScheduleEntry, SubtaskProgression, SubtaskTargets, TargetValues } from "./scheduleEntry";
import { baseTargets, parseDurationText } from "./subtaskTargets";

export type DeadlineScope = "day" | "week" | "month";

export interface SubtaskDraft {
  id: string;
  title: string;
  info?: string;
  /** Free-text detail — whatever the structured figures don't cover. */
  duration?: string;
  /** Dedicated time budget in minutes (see ScheduleEntry.timeMinutes). */
  timeMinutes?: number;
  deadline?: string;
  deadlineScope?: DeadlineScope;
  /** Structured sets / reps / weight. */
  targets?: SubtaskTargets;
  restSeconds?: number;
  progression?: SubtaskProgression;
  /** The stored entry this draft was opened from — carries the fields the form doesn't edit. */
  source?: ScheduleEntry;
}

/**
 * Open a stored subtask for editing. Figures still sitting in the old free
 * text ("3 × 10 reps") are moved into the structured fields, leaving only the
 * words the parser didn't recognise in `duration`.
 */
export function entryToSubtaskDraft(e: ScheduleEntry): SubtaskDraft {
  let targets = e.targets;
  let duration = e.duration ?? "";
  let timeMinutes = e.timeMinutes;
  if (!targets && duration) {
    const parsed = parseDurationText(duration);
    const found = Object.keys(parsed.targets).length > 0;
    if (found || (parsed.minutes != null && timeMinutes == null)) {
      if (found) targets = parsed.targets;
      if (parsed.minutes != null && timeMinutes == null) timeMinutes = parsed.minutes;
      duration = parsed.rest;
    }
  }
  return {
    id: e.id,
    title: e.task,
    info: e.info ?? "",
    duration,
    timeMinutes,
    deadline: e.deadline,
    deadlineScope: e.deadlineScope,
    targets,
    restSeconds: e.restSeconds,
    progression: e.progression,
    source: e,
  };
}

const positive = (n: number | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : undefined);

function cleanTargets(t: SubtaskTargets | undefined): SubtaskTargets | undefined {
  if (!t) return undefined;
  const out: SubtaskTargets = {};
  const sets = positive(t.sets);
  const reps = positive(t.reps);
  const weight = t.weight != null && Number.isFinite(t.weight) && t.weight >= 0 ? t.weight : undefined;
  if (sets != null) out.sets = Math.round(sets);
  if (reps != null) out.reps = Math.round(reps);
  if (weight != null) {
    out.weight = weight;
    out.weightUnit = t.weightUnit ?? "kg";
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sameFigures(a: TargetValues, b: TargetValues): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof TargetValues>;
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

/**
 * Save a draft back to a stored subtask. `nowISO` stamps `targetsSetAt` only
 * when the figures actually changed: a hand edit is a new base, and any
 * earlier progression step stops applying to it.
 */
export function subtaskDraftToEntry(d: SubtaskDraft, nowISO: string = new Date().toISOString()): ScheduleEntry {
  const { source } = d;
  const entry: ScheduleEntry = {
    ...(source ?? {}),
    id: d.id,
    task: d.title.trim(),
    info: (d.info ?? "").trim() || undefined,
    duration: (d.duration ?? "").trim() || undefined,
    timeMinutes: positive(d.timeMinutes),
    deadline: d.deadline || undefined,
    deadlineScope: d.deadline ? d.deadlineScope ?? "day" : undefined,
    targets: cleanTargets(d.targets),
    restSeconds: d.restSeconds != null && d.restSeconds > 0 ? Math.round(d.restSeconds) : undefined,
    progression: d.progression,
  };
  const before = source ? baseTargets(source) : {};
  const after = baseTargets(entry);
  if (!sameFigures(before, after)) entry.targetsSetAt = nowISO;

  // Undefined keys would survive the spread and the JSON round trip differently
  // on each platform; drop them so stored entries stay minimal.
  for (const key of Object.keys(entry) as (keyof ScheduleEntry)[]) {
    if (entry[key] === undefined) delete entry[key];
  }
  return entry;
}
