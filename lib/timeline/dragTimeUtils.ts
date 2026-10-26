/**
 * The DOM-coupled half of drag-interaction helpers — `pointerToMinutes` takes
 * a real `HTMLElement`, so it can't live in packages/core (no DOM lib there).
 * Everything else moved to packages/core/lib/timeline/dragTimeUtils.ts, which
 * this file re-exports so existing import sites are unchanged.
 */

export * from "@planr/core/lib/timeline/dragTimeUtils";

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
