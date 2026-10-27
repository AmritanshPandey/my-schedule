/**
 * The check-in rhythm of a tracker — how often it wants an entry, and whether
 * it has one for the current stretch of time.
 *
 * A tracker used to be a place you could log to, and nothing more: weight
 * logged once in March looked exactly as healthy as weight logged every
 * Sunday. A cadence turns it into a standing appointment. Each period (a day,
 * a Monday-start week, a calendar month or year) either has an entry or it
 * doesn't, and that is all "due" means here:
 *
 *  - **due** — nothing logged yet in the current period. Not a failure; the
 *    period is still open.
 *  - **overdue** — due, and the whole previous period passed without an entry
 *    too, after the tracker had already been in use. That is a slip worth
 *    naming.
 *
 * The record is judged only from the first period anything was logged in.
 * There is no creation date on a tracker, and treating the weeks before it
 * existed as missed would punish starting.
 *
 * Pure and React-free so it can be unit-tested directly.
 */

import type { MetricEntry, ProgressTracker, TrackerCadence } from "./scheduleTypes";
import { addDaysToISO, formatDate } from "./dateUtils";

/** Periods of history each cadence shows — roughly a quarter's worth of signal
 *  for the frequent ones, a few years for yearly. */
export const CHECK_IN_HISTORY: Record<TrackerCadence, number> = {
  daily: 7,
  weekly: 8,
  monthly: 6,
  yearly: 4,
};

export const CADENCE_LABEL: Record<TrackerCadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

const PERIOD_NOUN: Record<TrackerCadence, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

/**
 * The rhythm a tracker runs on. An unset cadence reads as daily for a tracker
 * with a daily target (it already resets every day) and weekly otherwise —
 * a once-a-week weigh-in is the common case for a point-in-time metric.
 */
export function trackerCadence(tracker: Pick<ProgressTracker, "cadence" | "dailyTarget">): TrackerCadence {
  if (tracker.cadence) return tracker.cadence;
  return typeof tracker.dailyTarget === "number" && tracker.dailyTarget > 0 ? "daily" : "weekly";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** First day of the period `dateISO` falls in. Weeks start on Monday. */
export function periodStartISO(cadence: TrackerCadence, dateISO: string): string {
  const [y, m] = dateISO.split("-");
  switch (cadence) {
    case "daily":
      return dateISO;
    case "weekly": {
      const weekday = new Date(`${dateISO}T12:00:00`).getDay();
      return addDaysToISO(dateISO, -((weekday + 6) % 7));
    }
    case "monthly":
      return `${y}-${m}-01`;
    case "yearly":
      return `${y}-01-01`;
  }
}

/** First day of the period `steps` periods after the one `dateISO` is in. */
export function shiftPeriodISO(cadence: TrackerCadence, dateISO: string, steps: number): string {
  const start = periodStartISO(cadence, dateISO);
  switch (cadence) {
    case "daily":
      return addDaysToISO(start, steps);
    case "weekly":
      return addDaysToISO(start, steps * 7);
    case "monthly": {
      const [y, m] = start.split("-").map(Number);
      const index = y * 12 + (m - 1) + steps;
      return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}-01`;
    }
    case "yearly":
      return `${Number(start.slice(0, 4)) + steps}-01-01`;
  }
}

export interface CheckInPeriod {
  /** First day of the period. */
  start: string;
  /** True when it has an entry; null before the tracker was first used. */
  logged: boolean | null;
}

export interface CheckInState {
  cadence: TrackerCadence;
  /** First day of the current period. */
  periodStart: string;
  /** First day of the next period — when the next check-in opens. */
  nextPeriodStart: string;
  /** Entries in the current period. */
  entriesThisPeriod: number;
  loggedThisPeriod: boolean;
  /** Nothing logged yet this period. */
  due: boolean;
  /** Due, and the previous period went by without an entry too. */
  overdue: boolean;
  lastLoggedDate: string | null;
  /**
   * Consecutive periods with an entry, ending now. The current period counts
   * once logged; while it is still open it neither adds nor breaks the run.
   */
  streak: number;
  /** The last CHECK_IN_HISTORY periods, oldest first, current last. */
  history: CheckInPeriod[];
  /** Of the periods in `history` the tracker was in use for, how many were logged. */
  loggedInHistory: number;
  countedInHistory: number;
}

export function buildCheckIn(
  tracker: Pick<ProgressTracker, "id" | "cadence" | "dailyTarget">,
  entries: readonly MetricEntry[],
  todayISO: string,
  trackingStart?: string,
): CheckInState {
  const cadence = trackerCadence(tracker);
  const mine = entries.filter(
    (e) => e.trackerId === tracker.id && e.date <= todayISO && (!trackingStart || e.date >= trackingStart),
  );

  const loggedPeriods = new Set<string>();
  let lastLoggedDate: string | null = null;
  let firstLoggedDate: string | null = null;
  for (const e of mine) {
    loggedPeriods.add(periodStartISO(cadence, e.date));
    if (!lastLoggedDate || e.date > lastLoggedDate) lastLoggedDate = e.date;
    if (!firstLoggedDate || e.date < firstLoggedDate) firstLoggedDate = e.date;
  }
  const firstPeriod = firstLoggedDate ? periodStartISO(cadence, firstLoggedDate) : null;

  const periodStart = periodStartISO(cadence, todayISO);
  const previousStart = shiftPeriodISO(cadence, todayISO, -1);
  const entriesThisPeriod = mine.filter((e) => periodStartISO(cadence, e.date) === periodStart).length;
  const loggedThisPeriod = entriesThisPeriod > 0;
  const due = !loggedThisPeriod;
  const overdue = due && firstPeriod !== null && firstPeriod <= previousStart && !loggedPeriods.has(previousStart);

  let streak = loggedThisPeriod ? 1 : 0;
  for (let step = -1; firstPeriod !== null; step--) {
    const start = shiftPeriodISO(cadence, todayISO, step);
    if (start < firstPeriod || !loggedPeriods.has(start)) break;
    streak++;
  }

  const size = CHECK_IN_HISTORY[cadence];
  const history: CheckInPeriod[] = [];
  for (let step = -(size - 1); step <= 0; step++) {
    const start = shiftPeriodISO(cadence, todayISO, step);
    history.push({
      start,
      logged: firstPeriod === null || start < firstPeriod ? null : loggedPeriods.has(start),
    });
  }
  // The open current period only counts once it's logged — same grace as the streak.
  const counted = history.filter((p, i) => p.logged !== null && (i < history.length - 1 || p.logged));

  return {
    cadence,
    periodStart,
    nextPeriodStart: shiftPeriodISO(cadence, todayISO, 1),
    entriesThisPeriod,
    loggedThisPeriod,
    due,
    overdue,
    lastLoggedDate,
    streak,
    history,
    loggedInHistory: counted.filter((p) => p.logged).length,
    countedInHistory: counted.length,
  };
}

/** "Due today" / "Due this week" / "Missed last month" / "Logged this year". */
export function checkInStatusLabel(state: Pick<CheckInState, "cadence" | "due" | "overdue">): string {
  const noun = PERIOD_NOUN[state.cadence];
  if (state.overdue) return state.cadence === "daily" ? "Missed yesterday" : `Missed last ${noun}`;
  if (state.due) return state.cadence === "daily" ? "Due today" : `Due this ${noun}`;
  return state.cadence === "daily" ? "Logged today" : `Logged this ${noun}`;
}

/** When the next entry is wanted: "Tomorrow", "Mon, Oct 19", "Nov 1", "Jan 1, 2027". */
export function nextCheckInLabel(state: Pick<CheckInState, "cadence" | "nextPeriodStart">): string {
  switch (state.cadence) {
    case "daily":
      return "Tomorrow";
    case "weekly":
      return formatDate(state.nextPeriodStart, { weekday: "short", month: "short", day: "numeric" });
    case "monthly":
      return formatDate(state.nextPeriodStart, { month: "short", day: "numeric" });
    case "yearly":
      return formatDate(state.nextPeriodStart, { month: "short", day: "numeric", year: "numeric" });
  }
}

/** "6 of last 8 weeks" — the honest record behind the streak. */
export function checkInRecordLabel(state: Pick<CheckInState, "cadence" | "loggedInHistory" | "countedInHistory">): string | null {
  if (state.countedInHistory === 0) return null;
  const noun = PERIOD_NOUN[state.cadence];
  if (state.countedInHistory === 1) return state.loggedInHistory === 1 ? `Logged this ${noun}` : null;
  return `${state.loggedInHistory} of last ${state.countedInHistory} ${noun}s`;
}

export interface DueCheckIn {
  tracker: ProgressTracker;
  state: CheckInState;
}

/**
 * Every tracker still waiting on an entry this period — overdue ones first,
 * then the rest in their given order. What Today and Overview prompt with.
 */
export function dueCheckIns(
  trackers: readonly ProgressTracker[],
  entries: readonly MetricEntry[],
  todayISO: string,
  trackingStart?: string,
): DueCheckIn[] {
  return trackers
    .map((tracker, index) => ({ tracker, state: buildCheckIn(tracker, entries, todayISO, trackingStart), index }))
    .filter(({ state }) => state.due)
    .sort((a, b) => Number(b.state.overdue) - Number(a.state.overdue) || a.index - b.index)
    .map(({ tracker, state }) => ({ tracker, state }));
}
