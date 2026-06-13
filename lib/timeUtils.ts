/**
 * Canonical time utilities — single source of truth for all time parsing,
 * formatting, and conversion used across the app.
 *
 * Previously these functions were duplicated in ScheduleApp.tsx, Progress.tsx,
 * TimeSlotPicker.tsx, ListTaskCard.tsx, and AddTaskModal.tsx.
 */

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Convert a display time string to total minutes from midnight.
 * Accepts both 12-hour ("9:30 AM") and 24-hour ("09:30") formats.
 * Returns null if the string cannot be parsed.
 */
export function parseTimeToMinutes(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;

  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHour) {
    let h = Number(twelveHour[1]);
    const m = Number(twelveHour[2]);
    if (h < 1 || h > 12 || m > 59) return null;
    const suf = twelveHour[3].toUpperCase();
    if (suf === "PM" && h !== 12) h += 12;
    if (suf === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }

  const twentyFour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const h = Number(twentyFour[1]);
    const m = Number(twentyFour[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  return null;
}

/**
 * Convert clock minutes into the app's 4 AM-to-4 AM schedule-day space.
 * Times after midnight but before the boundary belong at the end of the day.
 */
export function toScheduleDayMinutes(minutes: number, dayStartMinutes = 4 * 60): number {
  return minutes < dayStartMinutes ? minutes + 24 * 60 : minutes;
}

// ── Conversion ────────────────────────────────────────────────────────────────

/**
 * Convert minutes-from-midnight to an HTML input[type=time] value ("09:30").
 * Clamps to the valid 00:00–23:59 range.
 */
export function minutesToInputTime(minutes: number): string {
  const clamped = Math.min(Math.max(Math.round(minutes), 0), 23 * 60 + 59);
  const h = Math.floor(clamped / 60).toString().padStart(2, "0");
  const m = (clamped % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Convert a display time ("9:30 AM") to an HTML input[type=time] value ("09:30").
 */
export function displayToInputTime(value: string): string {
  const raw = value.trim();
  const m12 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = Number(m12[1]);
    const min = m12[2];
    const suf = m12[3].toUpperCase();
    if (suf === "PM" && h !== 12) h += 12;
    if (suf === "AM" && h === 12) h = 0;
    return `${h.toString().padStart(2, "0")}:${min}`;
  }
  const m24 = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return `${Number(m24[1]).toString().padStart(2, "0")}:${m24[2]}`;
  return "";
}

/**
 * Convert an HTML input[type=time] value ("09:30") to a display time ("09:30 AM").
 */
export function inputToDisplayTime(value: string): string {
  const m = value.match(/^(\d{2}):(\d{2})$/);
  if (!m) return value.trim();
  let h = Number(m[1]);
  const min = m[2];
  const suf = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h.toString().padStart(2, "0")}:${min} ${suf}`;
}

/**
 * Normalize any stored time ("14:00", "7:00 AM", "07:00") into a clean 12-hour
 * display string ("2:00 PM"). Stored times are inconsistent across the app —
 * AI-generated tasks use 24-hour, manually parsed ones use 12-hour — so always
 * run a value through this before showing it. Returns the trimmed input
 * unchanged if it can't be parsed.
 */
export function formatDisplayTime(value: string): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return value.trim();
  let h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suf = h >= 12 ? "PM" : "AM";
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m.toString().padStart(2, "0")} ${suf}`;
}

// ── Duration ──────────────────────────────────────────────────────────────────

/**
 * Return a human-readable duration string between two display times.
 * Handles overnight tasks (end < start). Returns null if times can't be parsed.
 */
export function formatDuration(startTime: string, endTime: string): string | null {
  const start = parseTimeToMinutes(startTime);
  let end = parseTimeToMinutes(endTime);
  if (start === null || end === null) return null;
  if (end === start) return "0m";
  if (end < start) end += 1440; // overnight
  const total = end - start;
  if (total <= 0) return null;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Return a human-readable duration from raw minutes.
 */
export function formatMinutes(total: number): string {
  if (total <= 0) return "0m";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Get the current clock time as minutes from midnight.
 */
export function currentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
