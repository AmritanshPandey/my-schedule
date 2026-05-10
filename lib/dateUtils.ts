/**
 * Canonical date utilities — single source of truth for all date formatting
 * used across the app.
 *
 * Previously todayISO() was defined in AddEntryModal, Analytics, PlanCard,
 * and ScheduleApp — all four files identically.
 */

// ── Today ─────────────────────────────────────────────────────────────────────

/** Return today's date as an ISO string "YYYY-MM-DD". */
export function todayISO(): string {
  return new Date().toISOString().split("T")[0];
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
  return d.toISOString().split("T")[0];
}
