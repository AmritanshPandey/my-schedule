/**
 * Drag-interaction helpers for the day timeline.
 * All functions are pure (no React / DOM side-effects) so they can be
 * imported freely and tested in isolation.
 */

export const DRAG_SNAP_MINUTES = 15;
export const DRAG_MIN_DURATION = 15;
export const DRAG_DEFAULT_DURATION = 60;
/** Pixels the pointer must travel before drag-create activates. */
export const DRAG_THRESHOLD_PX = 8;
/** Milliseconds of stationary hold before drag-move activates. */
export const LONG_PRESS_MS = 300;

// ── Snap & clamp ──────────────────────────────────────────────────────────────

export function snapMinutes(minutes: number, snap = DRAG_SNAP_MINUTES): number {
  return Math.round(minutes / snap) * snap;
}

export function clampMinutes(minutes: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, minutes));
}

// ── Coordinate conversion ─────────────────────────────────────────────────────

/**
 * Convert a viewport clientY to timeline minutes.
 * `gridEl` is the task-grid div (absolutely-sized, not the scroll container).
 */
export function pointerToMinutes(
  clientY: number,
  gridEl: HTMLElement,
  timelineTopPadding: number,
  hourHeight: number,
  timelineStartMinutes: number,
): number {
  const rect = gridEl.getBoundingClientRect();
  const y = clientY - rect.top;
  return ((y - timelineTopPadding) / hourHeight) * 60 + timelineStartMinutes;
}

/**
 * Convert a clientY inside a vertically scrollable grid into schedule minutes.
 * `gridTop` should be the column's viewport top edge and `scrollTop` is the
 * vertical scroll offset of the grid container.
 */
export function pointerToScrollableMinutes(
  clientY: number,
  gridTop: number,
  scrollTop: number,
  pixelsPerMinute: number,
  timelineStartMinutes: number,
): number {
  return ((clientY - gridTop + scrollTop) / pixelsPerMinute) + timelineStartMinutes;
}

/** Convert timeline minutes → px top offset within the task grid. */
export function minutesToTop(
  minutes: number,
  timelineTopPadding: number,
  hourHeight: number,
  timelineStartMinutes: number,
): number {
  return timelineTopPadding + ((minutes - timelineStartMinutes) / 60) * hourHeight;
}

/** Convert a duration in minutes → px height. */
export function minutesToHeight(durationMinutes: number, hourHeight: number): number {
  return (durationMinutes / 60) * hourHeight;
}

// ── Time formatting ───────────────────────────────────────────────────────────

/**
 * Convert timeline minutes (may be > 1440 for overnight) to a 12-hour
 * display string ("9:30 AM") matching Task.startTime format.
 */
export function minutesToDisplayTime(minutes: number): string {
  const n = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(n / 60);
  const min = n % 60;
  const suf = h24 >= 12 ? "PM" : "AM";
  let h = h24 % 12;
  if (h === 0) h = 12;
  return `${h}:${min.toString().padStart(2, "0")} ${suf}`;
}

/**
 * Convert timeline minutes to an HTML input[type=time] value "HH:MM".
 * Wraps overnight (> 1440) back to the next-day clock time.
 */
export function minutesToInputTime(minutes: number): string {
  const n = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Human-readable duration label: "1h 30m", "45m", "2h".
 */
export function getDurationLabel(startMin: number, endMin: number): string {
  const total = endMin - startMin;
  if (total <= 0) return "0m";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
