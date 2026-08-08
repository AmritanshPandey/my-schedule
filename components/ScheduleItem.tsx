// Type definitions for plan items (subtasks).
// The original ScheduleItem component is no longer used; this file
// is preserved as the canonical home of these shared interfaces.

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
}
