/**
 * Pure MetricEntry helpers. There's no module owning this logic today — all
 * of it is inline in ScheduleApp.tsx / IOSScheduleApp.tsx — so this is the
 * natural, unit-testable home for anything that reads (rather than mutates)
 * `Schedule.metricEntries`.
 *
 * `dailyTotals` is available for future use but deliberately not wired into
 * ProgressChart.tsx or the existing Avg/Logged stat cells here — that would
 * silently change the meaning of every user's existing chart. It's additive
 * infrastructure, not a switch-over.
 */
import type { MetricEntry } from "./scheduleTypes";

export function entriesForDate(entries: MetricEntry[], trackerId: string, dateISO: string): MetricEntry[] {
  return entries.filter((e) => e.trackerId === trackerId && e.date === dateISO);
}

export function sumEntriesForDate(entries: MetricEntry[], trackerId: string, dateISO: string): number {
  return entriesForDate(entries, trackerId, dateISO).reduce((sum, e) => sum + e.value, 0);
}

/**
 * What a tracker reads on one date: the sum of its logs for a daily metric
 * (`dailyTarget` set — water, protein), the last logged value otherwise
 * (weight), where a second log corrects the first rather than adding to it.
 * 0 when nothing was logged that day.
 */
export function valueForDate(
  entries: readonly MetricEntry[],
  tracker: { id: string; dailyTarget?: number },
  dateISO: string,
): number {
  const day = entries.filter((e) => e.trackerId === tracker.id && e.date === dateISO);
  if (day.length === 0) return 0;
  const cumulative = typeof tracker.dailyTarget === "number" && tracker.dailyTarget > 0;
  return cumulative ? day.reduce((sum, e) => sum + e.value, 0) : day[day.length - 1].value;
}

/** One tracker's entries summed per date, sorted ascending by date. */
export function dailyTotals(entries: MetricEntry[], trackerId: string): Array<{ date: string; value: number }> {
  const totals = new Map<string, number>();
  for (const e of entries) {
    if (e.trackerId !== trackerId) continue;
    totals.set(e.date, (totals.get(e.date) ?? 0) + e.value);
  }
  return [...totals.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * One tracker's last-logged value per date, sorted ascending by date — the
 * per-day reading for a point-in-time metric (weight), where a second entry
 * on a day replaces the first rather than adding to it. Within a date, the
 * later entry in the array wins: entries are appended as they're logged.
 */
export function dailyLatest(entries: readonly MetricEntry[], trackerId: string): Array<{ date: string; value: number }> {
  const latest = new Map<string, number>();
  for (const e of entries) {
    if (e.trackerId !== trackerId) continue;
    latest.set(e.date, e.value);
  }
  return [...latest.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
