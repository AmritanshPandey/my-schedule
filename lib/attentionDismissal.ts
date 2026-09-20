/**
 * Dismissing what "Needs attention" is showing — one row, or all of them.
 *
 * Missed occurrences already had a dismissal path (`acknowledgedMisses`, see
 * lib/missedRecovery.ts). Milestones and at-risk routines did not: they are
 * *derived* states, so there was nothing to dismiss and the card could only
 * grow. At nineteen rows that stops being a signal and becomes the notification
 * fatigue §17 warns about — "too many alerts undermine trust".
 *
 * So dismissal here is per *instance*, never per entity. Every key ends in the
 * date that made the row appear, which is what lets a legitimately new problem
 * come back:
 *
 *  - a routine is dismissed for today, and returns tomorrow if the streak is
 *    still at risk;
 *  - a milestone is dismissed at its current target date, and returns if the
 *    target moves and it slips again;
 *  - "off pace" and "overdue" are dismissed separately, because a milestone
 *    actually passing its deadline is new information, not the warning the
 *    user already waved away.
 *
 * Nothing is deleted. The underlying `"missed"` history events, milestone
 * dates and streak data are all untouched, so analytics stay honest — this
 * only hides rows on one card.
 *
 * Pure and React-free so it can be unit-tested directly.
 */

import type { Schedule } from "./useScheduleDB";
import type { NeedsAttention } from "./needsAttention";
import { missKey } from "./missedRecovery";

/** Trailing-date shape every key shares, so stale keys can be pruned by age. */
const KEY_DATE = /\|(\d{4}-\d{2}-\d{2})$/;

/** Keys older than this are dropped on write — they can never match again. */
export const DISMISSAL_RETENTION_DAYS = 60;

/** Hard cap, mirroring `acknowledgedMisses`' own 200-item ceiling. */
export const MAX_DISMISSALS = 200;

// ── Key vocabulary ───────────────────────────────────────────────────────────
//
// These must stay in lockstep with the filters in lib/needsAttention.ts, which
// is why both sides import them from here rather than building strings inline.

/** An at-risk routine, scoped to the day its run was in danger. */
export function ritualAttentionKey(ritualId: string, todayISO: string): string {
  return `ritual|${ritualId}|${todayISO}`;
}

/** A milestone forecast to miss, scoped to the target it was forecast against. */
export function milestoneRiskKey(milestoneId: string, plannedEndDate: string): string {
  return `ms-risk|${milestoneId}|${plannedEndDate}`;
}

/** A milestone past its target, scoped to the target it passed. */
export function milestoneOverdueKey(milestoneId: string, plannedEndDate: string): string {
  return `ms-late|${milestoneId}|${plannedEndDate}`;
}

/** A task parked in a historically unreliable time slot, scoped to the day it
 *  was flagged — returns tomorrow if it's still sitting in that slot then. */
export function slotRiskKey(taskId: string, todayISO: string): string {
  return `slot-risk|${taskId}|${todayISO}`;
}

// ── Pruning ──────────────────────────────────────────────────────────────────

function prune(keys: readonly string[], todayISO: string): string[] {
  const cutoff = shiftISO(todayISO, -DISMISSAL_RETENTION_DAYS);
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    const date = KEY_DATE.exec(key)?.[1];
    // A key with no parseable date can never be matched or aged out, so it is
    // dropped rather than kept forever.
    if (!date || date < cutoff) continue;
    seen.add(key);
    kept.push(key);
  }
  return kept.slice(-MAX_DISMISSALS);
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * How many rows `dismissAllAttention` would actually clear.
 *
 * The card's own `total` is the right number to show *before* the action, but
 * this is what the confirmation afterwards should quote — they are the same
 * today, and this stays correct if a future row type is not dismissible.
 */
export function dismissibleCount(data: NeedsAttention): number {
  return (
    data.atRiskRituals.length
    + data.unreliableSlotTasks.length
    + data.atRiskMilestones.length
    + data.overdueMilestones.length
    + data.missedTasks.length
  );
}

/**
 * Dismiss every row currently on the card.
 *
 * Missed occurrences keep writing to `acknowledgedMisses` so that clearing in
 * bulk and dismissing one from the recovery sheet mean exactly the same thing;
 * everything else goes to `acknowledgedAttention`. Returns the schedule
 * unchanged when there is nothing to clear.
 */
export function dismissAllAttention(
  schedule: Schedule,
  data: NeedsAttention,
  todayISO: string,
): Schedule {
  if (dismissibleCount(data) === 0) return schedule;

  const attention = [
    ...(schedule.preferences?.acknowledgedAttention ?? []),
    ...data.atRiskRituals.map((row) => ritualAttentionKey(row.ritual.id, todayISO)),
    ...data.unreliableSlotTasks.map((row) => slotRiskKey(row.task.id, todayISO)),
    ...data.atRiskMilestones.map((row) =>
      milestoneRiskKey(row.milestone.id, row.milestone.plannedEndDate),
    ),
    ...data.overdueMilestones.map((row) =>
      milestoneOverdueKey(row.milestone.id, row.milestone.plannedEndDate),
    ),
  ];

  const misses = [
    ...(schedule.preferences?.acknowledgedMisses ?? []),
    ...data.missedTasks.map((row) => missKey(row.task.id, row.dateISO)),
  ];

  return {
    ...schedule,
    preferences: {
      ...schedule.preferences,
      acknowledgedAttention: prune(attention, todayISO),
      acknowledgedMisses: prune(misses, todayISO),
    },
  };
}
