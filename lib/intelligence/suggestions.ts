/**
 * Accepting or declining what the pattern engine suggests.
 *
 * Two rules, carried over from lib/milestoneAdaptation.ts:
 *
 *  - **Nothing applies itself.** `applySuggestion` runs only on a suggestion the
 *    user explicitly accepted, and only the three kinds whose effect is exact
 *    and reversible: retiming a task, shortening it, pausing a plan. The
 *    "review" kinds open an editor; the user makes the change.
 *  - **Nothing is destroyed.** No task is deleted or removed from a weekday,
 *    because completion history lives on each weekday copy and removing one
 *    would quietly rewrite past analytics. Retiming and shortening keep every
 *    copy and its history; pausing writes one field.
 *
 * Both accepting and declining are remembered in `acknowledgedAttention` (the
 * synced, date-pruned set Needs Attention already uses), so a decision made on
 * the phone holds on the desktop:
 *
 *  - "Not now" hides that insight for the rest of the week. A problem that is
 *    still there next week is new information and comes back.
 *  - Accepting a change to a task records the date, and the engine only reads
 *    that task's outcomes from then on — see `sinceByTask` in taskStats.ts.
 *
 * Pure and React-free.
 */

import type { Schedule } from "../useScheduleDB";
import { DAYS } from "../scheduleConstants";
import { appendAttentionKeys } from "../attentionDismissal";
import { pausePlan, resumePlan } from "../planLifecycle";
import { getSlots, retimeSlot } from "../taskMutations";
import { weekStartISO } from "../capacityModel";
import type { AppliableSuggestion, Insight } from "./types";
import { isAppliable } from "./types";

// ── Keys ─────────────────────────────────────────────────────────────────────

/** "Not now" on one insight, scoped to the week it was shown. */
export function insightDismissKey(insightId: string, todayISO: string): string {
  return `insight|${insightId}|${weekStartISO(todayISO)}`;
}

/** A suggestion changed this task or plan on this date. */
export function insightAppliedKey(subjectId: string, dateISO: string): string {
  return `insight-applied|${subjectId}|${dateISO}`;
}

const APPLIED = /^insight-applied\|(.+)\|(\d{4}-\d{2}-\d{2})$/;

/** The most recent accepted change per subject id. */
export function appliedSince(schedule: Pick<Schedule, "preferences">): Map<string, string> {
  const since = new Map<string, string>();
  for (const key of schedule.preferences?.acknowledgedAttention ?? []) {
    const match = APPLIED.exec(key);
    if (!match) continue;
    const [, subject, date] = match;
    const prev = since.get(subject);
    if (!prev || date > prev) since.set(subject, date);
  }
  return since;
}

export function isInsightDismissed(
  schedule: Pick<Schedule, "preferences">,
  insightId: string,
  todayISO: string,
): boolean {
  return (schedule.preferences?.acknowledgedAttention ?? []).includes(insightDismissKey(insightId, todayISO));
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function dismissInsight(schedule: Schedule, insight: Pick<Insight, "id">, todayISO: string): Schedule {
  return appendAttentionKeys(schedule, [insightDismissKey(insight.id, todayISO)], todayISO);
}

/**
 * Every copy of the task, retimed to `to` — but only if every copy still sits
 * exactly at `from`. If the user edited the task after the suggestion was
 * built, the suggestion is stale and nothing changes (the same staleness rule
 * lib/proposalMutations.ts applies to AI proposals).
 */
function retimeEveryCopy(schedule: Schedule, s: Extract<AppliableSuggestion, { taskId: string }>): Schedule {
  const copies = DAYS.flatMap((day) => (schedule.activities[day] ?? []).filter((t) => t.id === s.taskId));
  if (copies.length === 0) return schedule;
  const stale = copies.some(
    (t) => getSlots(t).length !== 1 || t.startTime !== s.from.startTime || t.endTime !== s.from.endTime,
  );
  if (stale) return schedule;

  const activities = { ...schedule.activities };
  for (const day of DAYS) {
    const bucket = schedule.activities[day] ?? [];
    if (!bucket.some((t) => t.id === s.taskId)) continue;
    activities[day] = bucket.map((t) =>
      t.id === s.taskId ? retimeSlot(t, 0, s.to.startTime, s.to.endTime) : t,
    );
  }
  return { ...schedule, activities };
}

/**
 * Apply the accepted suggestion on `insight`, and record the decision.
 * Returns the schedule unchanged when the insight carries nothing appliable
 * or the suggestion has gone stale.
 */
export function applySuggestion(schedule: Schedule, insight: Insight, todayISO: string): Schedule {
  const s = insight.suggestion;
  if (!s || !isAppliable(s)) return schedule;

  let next: Schedule;
  let subjectId: string;
  switch (s.kind) {
    case "retime":
    case "shorten":
      next = retimeEveryCopy(schedule, s);
      subjectId = s.taskId;
      break;
    case "pause_plan":
      next = pausePlan(schedule, s.planId);
      subjectId = s.planId;
      break;
  }

  if (next === schedule) return schedule;
  return appendAttentionKeys(
    next,
    [insightAppliedKey(subjectId, todayISO), insightDismissKey(insight.id, todayISO)],
    todayISO,
  );
}

/**
 * Exactly reverse `applySuggestion` — for the Undo on its toast. Inverts the
 * change itself (rather than restoring a whole-schedule snapshot) so an edit
 * made in the seconds between applying and undoing is never lost. Also forgets
 * the decision, so the insight can come back.
 */
export function undoSuggestion(schedule: Schedule, insight: Insight, todayISO: string): Schedule {
  const s = insight.suggestion;
  if (!s || !isAppliable(s)) return schedule;

  let next: Schedule;
  let subjectId: string;
  switch (s.kind) {
    case "retime":
    case "shorten":
      next = retimeEveryCopy(schedule, { ...s, from: s.to, to: s.from });
      subjectId = s.taskId;
      break;
    case "pause_plan":
      next = resumePlan(schedule, s.planId);
      subjectId = s.planId;
      break;
  }

  const forget = new Set([insightAppliedKey(subjectId, todayISO), insightDismissKey(insight.id, todayISO)]);
  const attention = next.preferences?.acknowledgedAttention ?? [];
  return {
    ...next,
    preferences: { ...next.preferences, acknowledgedAttention: attention.filter((k) => !forget.has(k)) },
  };
}

