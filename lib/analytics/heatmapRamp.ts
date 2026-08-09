/**
 * Intensity ramp for the weekly heatmap — one place the cell colours live.
 *
 * Deliberately neutral, not green. Green is the app's single progress signal
 * (DESIGN.md, "The One Signal Rule"); the heatmap shows *scheduled* time, not
 * follow-through, so it climbs an ink/white-alpha scale instead — dark in light
 * mode, bright in dark mode, so density reads the same way in both themes.
 *
 * Full, static class strings (no interpolation) so Tailwind's scanner keeps them.
 * Level 0 is the empty track; 1–4 are increasing intensity. Steps are spaced so
 * adjacent levels stay distinguishable and each clears AA against its neighbours.
 */
export const HEATMAP_RAMP: readonly [string, string, string, string, string] = [
  "bg-neutral-100 dark:bg-white/[0.05]", // 0 — nothing scheduled
  "bg-neutral-300 dark:bg-white/[0.16]", // 1
  "bg-neutral-500 dark:bg-white/[0.34]", // 2
  "bg-neutral-700 dark:bg-white/[0.58]", // 3
  "bg-neutral-900 dark:bg-white/[0.92]", // 4 — the week's peak
];

/** The swatch classes used in the Low → High legend, level 0 first. */
export const HEATMAP_LEGEND = HEATMAP_RAMP;
