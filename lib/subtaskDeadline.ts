/**
 * Subtask deadlines (Task-type subtasks only).
 *
 * A deadline is a target date plus a granularity: a specific **day**, a **week**,
 * or a **month**. The granularity defines an inclusive window; "overdue" means the
 * whole window is in the past, "soon" means today falls inside it.
 */

export type DeadlineScope = "day" | "week" | "month";
export type DeadlineState = "overdue" | "soon" | "upcoming";

export interface HasDeadline {
  deadline?: string;
  deadlineScope?: DeadlineScope;
}

// ── ISO <-> local Date (midnight) ─────────────────────────────────────────────

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Inclusive [start, end] ISO window the deadline + scope resolves to. */
export function deadlineRange(deadline: string, scope: DeadlineScope): { start: string; end: string } {
  const d = parseISO(deadline);
  if (scope === "week") {
    const dow = (d.getDay() + 6) % 7; // Monday = 0 … Sunday = 6
    const mon = new Date(d);
    mon.setDate(d.getDate() - dow);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: toISO(mon), end: toISO(sun) };
  }
  if (scope === "month") {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { start: toISO(first), end: toISO(last) };
  }
  return { start: toISO(d), end: toISO(d) };
}

/**
 * State of a deadline relative to `todayISO`. ISO date strings compare correctly
 * lexicographically, so no Date math is needed here.
 */
export function deadlineState(deadline: string, scope: DeadlineScope, todayISO: string): DeadlineState {
  const { start, end } = deadlineRange(deadline, scope);
  if (end < todayISO) return "overdue";
  if (start <= todayISO && todayISO <= end) return "soon";
  return "upcoming";
}

/** Human label: "Jun 10" (day) · "Week of Jun 9" (week) · "June" (month). */
export function formatDeadline(deadline: string, scope: DeadlineScope): string {
  const d = parseISO(deadline);
  if (scope === "month") return d.toLocaleDateString("en-US", { month: "long" });
  if (scope === "week") {
    const mon = parseISO(deadlineRange(deadline, scope).start);
    return `Week of ${mon.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Sort comparator: soonest window-end first; entries without a deadline go last. */
export function compareDeadline(a: HasDeadline, b: HasDeadline): number {
  const ae = a.deadline ? deadlineRange(a.deadline, a.deadlineScope ?? "day").end : null;
  const be = b.deadline ? deadlineRange(b.deadline, b.deadlineScope ?? "day").end : null;
  if (ae === null && be === null) return 0;
  if (ae === null) return 1;
  if (be === null) return -1;
  return ae < be ? -1 : ae > be ? 1 : 0;
}
