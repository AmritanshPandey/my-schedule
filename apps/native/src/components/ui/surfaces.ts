/**
 * Surface vocabulary — native port of components/ui/surfaces.ts. Same class
 * strings; hover/transition variants dropped (no pointer hover on a phone,
 * and NativeWind's transitions would need Reanimated, which isn't linked).
 */

/** Standard card: flat, hairline border, one dark surface across the app. */
export const CARD =
  'rounded-2xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900';

/** Card that navigates or acts on tap. */
export const CARD_INTERACTIVE = `${CARD} active:bg-neutral-50/80 dark:active:bg-[#1B1B1B]`;

/** Recessed inner panel that sits inside a CARD. */
export const SOFT_PANEL =
  'rounded-xl border border-neutral-200/80 bg-neutral-50/90 dark:border-white/[0.07] dark:bg-white/[0.045]';

/** Hairline border colors alone (for dividers and custom containers). */
export const HAIRLINE = 'border-neutral-200/70 dark:border-white/[0.07]';
