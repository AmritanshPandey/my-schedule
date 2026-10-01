/**
 * Canonical date utilities — single source of truth for all date formatting
 * used across the app.
 *
 * Previously todayISO() was defined in AddEntryModal, Analytics, PlanCard,
 * and ScheduleApp — all four files identically.
 */

// ── Today ─────────────────────────────────────────────────────────────────────

/** Format a Date as "YYYY-MM-DD" using the local timezone, never UTC. */
export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Return today's date as an ISO string "YYYY-MM-DD" in the local timezone. */
export function todayISO(): string {
  return localISODate(new Date());
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format an ISO date string for display.
 * Default: "May 9, 2026"
 */
export function formatDate(
  iso: string,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", opts);
}

/**
 * Format an ISO date as a short string: "May 9"
 */
export function formatDateShort(iso: string): string {
  return formatDate(iso, { month: "short", day: "numeric" });
}

/**
 * Format an ISO date as "May 9th" with ordinal suffix.
 */
export function formatDateOrdinal(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
      ? "nd"
      : day % 10 === 3 && day !== 13
      ? "rd"
      : "th";
  return `${d.toLocaleDateString("en-US", { month: "short" })} ${day}${suffix}`;
}

/**
 * Return the number of days between two ISO dates (end - start).
 * Returns null if either date is missing or the result is non-positive.
 */
export function daysBetween(start: string, end: string): number | null {
  if (!start || !end) return null;
  const diff = Math.round(
    (new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) /
      86_400_000
  );
  return diff > 0 ? diff : null;
}

/**
 * Add N days to an ISO date and return the result as an ISO string.
 */
export function addDaysToISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

/**
 * Short, unambiguous label for the day a task occurrence belongs to — "Today",
 * otherwise "Sun 30 Aug". Used to title a per-date note so it is obvious the
 * note belongs to that date and not to the task in general.
 */
export function formatDayNoteLabel(dateISO: string, now: Date = new Date()): string {
  if (dateISO === localISODate(now)) return "today";
  const d = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * The effective "Tracking starts" date, never trusted as stored.
 *
 * `isTaskScheduledOn` hides every date before this one, so a start date in the
 * *future* hides everything at once — tasks, routines, streaks, trends and
 * metric entries, app-wide, with nothing on screen to explain why. The date
 * input's `max` is advisory only: it cannot stop a value arriving from a synced
 * device with a skewed clock, from an older build, or from a hand-edited
 * payload, so the guard belongs at the normalize boundary every load passes
 * through rather than on the control.
 *
 * Clamped to today rather than dropped: dropping would silently begin counting
 * years of pre-adoption history into streaks and trends, a larger and less
 * reversible surprise than "tracking starts today". A malformed or absent value
 * is undefined, which means all history — the setting's own "off" state.
 */
export function clampTrackingStart(raw: unknown, today: string): string | undefined {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return raw > today ? today : raw;
}
