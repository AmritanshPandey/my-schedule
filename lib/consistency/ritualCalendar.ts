/**
 * Month-grid data for Routine consistency views — one routine's own calendar
 * (RoutineDetailView) and the all-routines aggregate calendar (the Routine
 * screen's Month segment). Mirrors components/plan/AccuracyCalendar.tsx's
 * buildCalendarDays shape: only in-month days, no adjacent-month filler —
 * the component adds leading blank cells itself from `firstDow`.
 */
import type { Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { localISODate } from "@/lib/dateUtils";
import { ritualScheduledOnDate } from "@/lib/ritualRecurrence";
import { isRitualDayComplete } from "./ritualDayStatus";

export type RitualCalendarStatus = "complete" | "missed" | "not-scheduled" | "future";

export interface RitualCalendarDay {
  day: number;
  dateISO: string;
  status: RitualCalendarStatus;
}

/** One routine's own month calendar — used by RoutineDetailView. */
export function buildRitualMonthDays(
  ritual: Ritual,
  completions: RitualCompletion[],
  year: number,
  month: number,
  today: string,
): RitualCalendarDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDate = new Map<string, RitualCompletion[]>();
  for (const c of completions) {
    if (c.ritualId !== ritual.id) continue;
    const bucket = byDate.get(c.date);
    if (bucket) bucket.push(c);
    else byDate.set(c.date, [c]);
  }

  const result: RitualCalendarDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = localISODate(new Date(year, month, d));
    const isFuture = iso > today;
    const scheduled = ritualScheduledOnDate(ritual, iso);
    const complete = isRitualDayComplete(ritual, byDate.get(iso) ?? []);

    let status: RitualCalendarStatus;
    if (isFuture) status = "future";
    else if (complete) status = "complete";
    else if (!scheduled) status = "not-scheduled";
    else status = "missed";

    result.push({ day: d, dateISO: iso, status });
  }
  return result;
}

/** Aggregate across ALL routines — a day is "complete" only when every
 *  routine scheduled that day is complete; "missed" if at least one
 *  scheduled routine isn't; "not-scheduled" when nothing was due. */
export function buildAllRoutinesMonthDays(
  rituals: Ritual[],
  completions: RitualCompletion[],
  year: number,
  month: number,
  today: string,
): RitualCalendarDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byRitualDate = new Map<string, RitualCompletion[]>();
  for (const c of completions) {
    const key = `${c.ritualId}|${c.date}`;
    const bucket = byRitualDate.get(key);
    if (bucket) bucket.push(c);
    else byRitualDate.set(key, [c]);
  }

  const result: RitualCalendarDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = localISODate(new Date(year, month, d));
    const isFuture = iso > today;
    const due = rituals.filter((r) => ritualScheduledOnDate(r, iso));

    let status: RitualCalendarStatus;
    if (isFuture) status = "future";
    else if (due.length === 0) status = "not-scheduled";
    else {
      const allDone = due.every((r) => isRitualDayComplete(r, byRitualDate.get(`${r.id}|${iso}`) ?? []));
      status = allDone ? "complete" : "missed";
    }

    result.push({ day: d, dateISO: iso, status });
  }
  return result;
}
