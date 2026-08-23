/**
 * Pure Ritual (Routine) completion-log operations.
 *
 * `toggleRitualCompletion` is the original, unchanged function — every plain
 * checkbox routine still gets exactly one `{ritualId,date}` row per day,
 * toggled in place. Everything else here is additive, for
 * quantity/duration/count/checklist routines, which can have MULTIPLE rows
 * per (ritualId, date) — one per individual log event — and are always
 * appended, never toggled/deduped. See lib/consistency/ritualDayStatus.ts
 * for how "is this day complete?" is decided from these rows.
 */
import type { RitualCompletion } from "@/lib/useScheduleDB";
import { uid } from "@/lib/id";

/** Unchanged — the original checkbox toggle. Every plain habit keeps using
 *  exactly this function, with exactly this output shape. */
export function toggleRitualCompletion(
  completions: RitualCompletion[],
  ritualId: string,
  dateISO: string
): RitualCompletion[] {
  const exists = completions.some((item) => item.ritualId === ritualId && item.date === dateISO);
  if (exists) {
    return completions.filter((item) => !(item.ritualId === ritualId && item.date === dateISO));
  }
  return [...completions, { ritualId, date: dateISO }];
}

// ── Quantity / duration / count logging ────────────────────────────────────

/** Appends one log event for a quantity/duration/count routine. Always adds
 *  a new row — never merges with an existing one for the same day, since the
 *  point is to keep individual timestamped entries (e.g. "500ml at 8am,
 *  500ml at 11:30am"), not just a running total. */
export function appendRitualLog(
  completions: RitualCompletion[],
  ritualId: string,
  dateISO: string,
  value: number,
  opts?: { timestamp?: string; note?: string },
): RitualCompletion[] {
  const entry: RitualCompletion = {
    ritualId,
    date: dateISO,
    id: uid(),
    timestamp: opts?.timestamp ?? new Date().toISOString(),
    value,
    ...(opts?.note ? { note: opts.note } : {}),
  };
  return [...completions, entry];
}

/** Removes one specific log row by id (e.g. deleting a single entry from the
 *  detail screen's entry list). No-op if the id isn't found. */
export function removeRitualLog(completions: RitualCompletion[], entryId: string): RitualCompletion[] {
  return completions.filter((c) => c.id !== entryId);
}

/** Removes the most-recently-logged value row for this ritual/day — the
 *  "undo" affordance right after a quick-add tap. No-op if there's nothing
 *  to undo (only sentinel/checkbox rows, or nothing at all). */
export function undoLastRitualLog(
  completions: RitualCompletion[],
  ritualId: string,
  dateISO: string,
): RitualCompletion[] {
  let latest: RitualCompletion | null = null;
  for (const c of completions) {
    if (c.ritualId !== ritualId || c.date !== dateISO || c.value === undefined) continue;
    if (!latest || (c.timestamp ?? "") > (latest.timestamp ?? "")) latest = c;
  }
  if (!latest?.id) return completions;
  return removeRitualLog(completions, latest.id);
}

// ── Checklist logging ───────────────────────────────────────────────────────

/** Toggles one checklist step for a given day — adds a row if not yet done,
 *  removes it if it was. Mirrors the checkbox toggle's in-place semantics,
 *  scoped to one step instead of the whole routine. */
export function toggleRitualStep(
  completions: RitualCompletion[],
  ritualId: string,
  dateISO: string,
  stepId: string,
): RitualCompletion[] {
  const exists = completions.some(
    (c) => c.ritualId === ritualId && c.date === dateISO && c.stepId === stepId,
  );
  if (exists) {
    return completions.filter(
      (c) => !(c.ritualId === ritualId && c.date === dateISO && c.stepId === stepId),
    );
  }
  return [...completions, { ritualId, date: dateISO, id: uid(), timestamp: new Date().toISOString(), stepId }];
}

// ── Shared ───────────────────────────────────────────────────────────────────

/** Removes every row for one ritual on one day, regardless of shape —
 *  used to reset a day's logging from the detail screen. */
export function clearRitualDay(completions: RitualCompletion[], ritualId: string, dateISO: string): RitualCompletion[] {
  return completions.filter((c) => !(c.ritualId === ritualId && c.date === dateISO));
}

/** All rows for one ritual on one day, in original order. */
export function entriesForRitualDate(completions: RitualCompletion[], ritualId: string, dateISO: string): RitualCompletion[] {
  return completions.filter((c) => c.ritualId === ritualId && c.date === dateISO);
}

/** Sum of logged values for one ritual on one day (quantity/duration/count). */
export function sumRitualDate(completions: RitualCompletion[], ritualId: string, dateISO: string): number {
  return entriesForRitualDate(completions, ritualId, dateISO).reduce((sum, c) => sum + (c.value ?? 0), 0);
}

/** Which checklist step ids have a completion row for one ritual on one day. */
export function stepIdsDoneOn(completions: RitualCompletion[], ritualId: string, dateISO: string): Set<string> {
  return new Set(
    entriesForRitualDate(completions, ritualId, dateISO)
      .map((c) => c.stepId)
      .filter((id): id is string => !!id),
  );
}
