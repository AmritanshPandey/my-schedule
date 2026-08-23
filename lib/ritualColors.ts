/**
 * Ritual (Routine) color → Tailwind class maps — the single source, replacing
 * three previously-duplicated copies (RitualView.tsx, RitualSheet.tsx,
 * RitualStrip.tsx/RitualLegend.tsx). Each map serves a distinct visual role;
 * they aren't interchangeable despite all being keyed by the same 10 colors.
 */
import type { RitualColor } from "./useScheduleDB";

/** Solid dot/pill fill — timeline markers, legend dots, color-picker swatches. */
export const RITUAL_COLOR_DOT: Record<RitualColor, string> = {
  rose:    "bg-rose-400",
  sky:     "bg-sky-400",
  violet:  "bg-violet-400",
  amber:   "bg-amber-400",
  emerald: "bg-emerald-400",
  fuchsia: "bg-fuchsia-400",
  orange:  "bg-orange-400",
  cyan:    "bg-cyan-400",
  indigo:  "bg-indigo-400",
  teal:    "bg-teal-400",
};

/** Card/row left-border accent (RitualView's compact rows). */
export const RITUAL_COLOR_BORDER: Record<RitualColor, string> = {
  rose:    "border-rose-500",
  sky:     "border-sky-500",
  violet:  "border-violet-500",
  amber:   "border-amber-500",
  emerald: "border-emerald-500",
  fuchsia: "border-fuchsia-500",
  orange:  "border-orange-500",
  cyan:    "border-cyan-500",
  indigo:  "border-indigo-500",
  teal:    "border-teal-500",
};

/** Selection ring around the chosen color swatch in RitualSheet's color picker. */
export const RITUAL_COLOR_SELECT_RING: Record<RitualColor, string> = {
  rose:    "ring-rose-400",
  sky:     "ring-sky-400",
  violet:  "ring-violet-400",
  amber:   "ring-amber-400",
  emerald: "ring-emerald-400",
  fuchsia: "ring-fuchsia-400",
  orange:  "ring-orange-400",
  cyan:    "ring-cyan-400",
  indigo:  "ring-indigo-400",
  teal:    "ring-teal-400",
};

/**
 * Max routines shown before a "+N" overflow chip, on the timeline overlay and
 * its text legend. Kept as one constant so the two surfaces can't drift out
 * of sync the way RitualOverlayLayer (12) and RitualLegend (8) previously did.
 */
export const RITUAL_DAY_LIMIT = 12;

/**
 * Max active routines a user can create. Raised from the original 8 now that
 * templates make more routines likely (a skincare AM + PM pair, water,
 * several supplements...); enforced identically in both shells.
 */
export const MAX_RITUALS = 20;
