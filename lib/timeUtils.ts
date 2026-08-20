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
  // Defensive: callers occasionally pass an untimed task's `undefined` start/end.
  // Without this guard `.trim()` throws and crashes the caller (e.g. snooze).
  if (typeof value !== "string") return null;
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
 * Wraps overnight/negative values into a valid 00:00–23:59 clock time (e.g.
 * 1500 → "01:00") — the single canonical implementation; `dragTimeUtils`
 * re-exports this. In-range callers are unaffected.
 */
export function minutesToInputTime(minutes: number): string {
  const n = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(n / 60).toString().padStart(2, "0");
  const m = (n % 60).toString().padStart(2, "0");
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
export function formatDisplayTime(value: string | undefined | null): string {
  if (!value) return "";
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
 * Total duration across a list of time blocks (slots), summed. Each block's
 * duration is computed like formatDuration (handling overnight). Blocks that
 * can't be parsed are skipped. Returns null if nothing parses.
 */
export function formatSlotsDuration(
  slots: ReadonlyArray<{ startTime: string; endTime: string }>
): string | null {
  let total = 0;
  let any = false;
  for (const slot of slots) {
    const start = parseTimeToMinutes(slot.startTime);
    let end = parseTimeToMinutes(slot.endTime);
    if (start === null || end === null) continue;
    if (end < start) end += 1440; // overnight
    const d = end - start;
    if (d <= 0) continue;
    total += d;
    any = true;
  }
  if (!any) return null;
  return formatMinutes(total);
}

/**
 * Render a list of time blocks as a compact combined range string, e.g.
 * "9:00 AM – 10:00 AM · 3:00 PM – 4:00 PM". Uses formatDisplayTime per bound.
 */
export function formatSlotsRange(
  slots: ReadonlyArray<{ startTime: string; endTime: string }>
): string {
  return slots
    .map((s) => `${formatDisplayTime(s.startTime)} – ${formatDisplayTime(s.endTime)}`)
    .join(" · ");
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
 * Parse a free-text subtask duration into minutes. Accepts the loose formats
 * users actually type: "5min", "5m", "1h", "1h30m", "1h 30", "90", "90m",
 * "1:30" (h:mm), "1.5h". Returns null when nothing numeric can be extracted so
 * callers can treat unparseable durations as "unknown" rather than zero.
 */
export function parseDurationMinutes(value: string | undefined | null): number | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  // "1:30" → 1h 30m
  const clock = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) {
    const h = Number(clock[1]);
    const m = Number(clock[2]);
    if (m > 59) return null;
    return h * 60 + m;
  }

  // "1.5h" / "1.5 hr" → fractional hours
  const fractionalHours = raw.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)$/);
  if (fractionalHours) {
    return Math.round(Number(fractionalHours[1]) * 60);
  }

  // "1h30m", "1h 30", "2h", "45m", "30 min", "20mins"
  const hoursMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  const minutesMatch = raw.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (hoursMatch || minutesMatch) {
    let total = 0;
    if (hoursMatch) total += Number(hoursMatch[1]) * 60;
    if (minutesMatch) total += Number(minutesMatch[1]);
    // "1h 30" — a trailing bare number after the hours is minutes.
    if (hoursMatch && !minutesMatch) {
      const trailing = raw.slice(raw.indexOf(hoursMatch[0]) + hoursMatch[0].length).match(/(\d+)/);
      if (trailing) total += Number(trailing[1]);
    }
    return Math.round(total);
  }

  // Bare number → minutes.
  const bare = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return Math.round(Number(bare[1]));

  return null;
}

/**
 * Get the current clock time as minutes from midnight.
 */
export function currentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}
