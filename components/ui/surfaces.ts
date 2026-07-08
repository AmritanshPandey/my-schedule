/**
 * Surface vocabulary — the one place card/panel container styles live.
 *
 * Border-opacity law (dark mode):
 * - Level 1 — card hairline:           white/[0.07]  (DESIGN.md doctrine)
 * - Level 2 — inner panel / divider:   white/[0.06]
 * - Level 3 — interactive control:     white/[0.10]
 *
 * Radius law:
 * - controls ≤24px → 6px (rounded-pr-sm) · 26–32px controls → 8px
 * - inner panels → 12px (rounded-xl) · cards → 16px (rounded-2xl) · pills → full
 *
 * Depth is chrome-led: cards stay flat (hairline-defined). Elevation/shadow is
 * reserved for floating chrome and designated hero moments, always tagged
 * `data-glass` so the e2e banned-effects guard exempts them.
 */

/** Standard card: flat, hairline border, one dark surface across the app. */
export const CARD =
  "rounded-2xl border border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900";

/**
 * Card that navigates or acts on click/tap. Hover stays flat — border shift +
 * subtle bg tint, never shadow. Only apply where hover implies clickability.
 */
export const CARD_INTERACTIVE =
  `${CARD} transition-colors lg:hover:border-neutral-300/80 lg:hover:bg-neutral-50/60 dark:lg:hover:border-white/[0.13] dark:lg:hover:bg-[#1B1B1B]`;

/** Recessed inner panel that sits inside a CARD. */
export const SOFT_PANEL =
  "rounded-xl border border-neutral-200/70 bg-neutral-50 dark:border-white/[0.06] dark:bg-white/[0.04]";

/** Hairline border colors alone (for dividers and custom containers). */
export const HAIRLINE = "border-neutral-200/70 dark:border-white/[0.07]";
