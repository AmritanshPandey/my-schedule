/**
 * Preset quick-log amounts for numeric tracking — used by the quantity/
 * duration/count routine completion control and by AddEntryModal's chip row.
 *
 * Originally lived in lib/wellness.ts (Plan-tracker-scoped); moved here as a
 * generic module once Routines took over quantity tracking, so nothing
 * routine-related needs to depend on the (now-removed) Wellness module.
 */
import type { Ritual } from "./useScheduleDB";

/** An unrecognized or missing unit returns `[]` so every existing numeric
 *  tracker renders exactly as it did before this preset table existed. */
export function quickAmountsForUnit(unit?: string): number[] {
  switch ((unit ?? "").trim().toLowerCase()) {
    case "ml": return [100, 250, 500];
    case "l": return [0.25, 0.5, 1];
    case "oz": return [8, 12, 16];
    case "glass":
    case "glasses":
    case "cup":
    case "cups": return [1, 2];
    case "kcal":
    case "cal":
    case "calories": return [100, 250, 500];
    case "g": return [10, 25, 50];
    case "min": return [15, 30, 60];
    case "hr":
    case "hrs":
    case "hour":
    case "hours": return [0.5, 1, 2];
    case "pages":
    case "page": return [5, 10, 20];
    case "reps":
    case "rep":
    case "×":
    case "x": return [5, 10, 20];
    default: return [];
  }
}

/**
 * A routine's own explicit quick-amount presets (set at creation, e.g. by a
 * template) take priority over the generic unit-based table, since a
 * template author knows the ritual's intent better than a bare unit string
 * can express (e.g. Water's [250,500,750] vs. the generic "ml" → [100,250,500]).
 */
export function quickAmountsForRitual(ritual: Pick<Ritual, "unit"> & { quickAmounts?: number[] }): number[] {
  if (ritual.quickAmounts?.length) return ritual.quickAmounts;
  return quickAmountsForUnit(ritual.unit);
}
