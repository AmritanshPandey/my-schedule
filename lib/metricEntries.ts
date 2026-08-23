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
import type { MetricEntry } from "./useScheduleDB";

export function entriesForDate(entries: MetricEntry[], trackerId: string, dateISO: string): MetricEntry[] {
  return entries.filter((e) => e.trackerId === trackerId && e.date === dateISO);
}

export function sumEntriesForDate(entries: MetricEntry[], trackerId: string, dateISO: string): number {
  return entriesForDate(entries, trackerId, dateISO).reduce((sum, e) => sum + e.value, 0);
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
