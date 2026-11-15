// Type definitions for plan items (subtasks).
// Canonical home of these shared interfaces — moved from
// components/ScheduleItem.tsx, which now re-exports from here.

export interface MetaField {
  label: string;
  value: string;
}

export interface ScheduleEntry {
  id: string;
  time?: string;
  task: string;
  info?: string;
  note?: string;
  meta?: MetaField[];
  date?: string;
  /** Free-text detail — reps/sets ("3×10"), notes, or a legacy time label. */
  duration?: string;
  /**
   * Dedicated time budget for this subtask, in minutes. Distinct from the
   * free-text `duration` (which holds reps/notes): only a real time goes here,
   * so subtask times can be summed and validated against the task's allotted
   * span. Entered as "15min" / "1h" / "1h30m" and normalized to minutes.
   */
  timeMinutes?: number;
  notes?: string;
  /** Optional deadline (ISO "YYYY-MM-DD") for a Task's subtask. */
  deadline?: string;
  /** Granularity of the deadline — drives the badge label + overdue window. */
  deadlineScope?: "day" | "week" | "month";
  /**
   * Structured strength targets ("3 × 10 at 60 kg"). Minutes stay in
   * `timeMinutes`. These are the base the user set; an accepted progression
   * step can raise them on read — see subtaskTargets.ts's currentTargets.
   */
  targets?: SubtaskTargets;
  /** Rest after each set, in seconds — focus mode's rest countdown. */
  restSeconds?: number;
  /** Step the targets up by a percentage once the user has been consistent. */
  progression?: SubtaskProgression;
  /**
   * When the user last set the targets by hand (ISO datetime). Progression
   * steps decided before it no longer apply: an edit is a new base.
   */
  targetsSetAt?: string;
}

export type WeightUnit = "kg" | "lb";

export interface SubtaskTargets {
  sets?: number;
  reps?: number;
  weight?: number;
  weightUnit?: WeightUnit;
}

/** Which figure a progression step raises; "all" scales every one that is set. */
export type ProgressionFigure = "all" | "weight" | "reps" | "sets" | "minutes";

export interface SubtaskProgression {
  /** Percentage to add per step, e.g. 5 for +5%. */
  percent: number;
  /** The period a step is judged over (same set as a tracker's cadence). */
  cadence: "daily" | "weekly" | "monthly" | "yearly";
  figure: ProgressionFigure;
  /** Share of scheduled occurrences that must be done to suggest a step, 1–100. */
  threshold: number;
  /** ISO date progression was switched on — no period before it counts. */
  startISO: string;
}

/** The figures a step can set: the strength targets plus minutes. */
export interface TargetValues extends SubtaskTargets {
  minutes?: number;
}
