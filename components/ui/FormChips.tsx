"use client";

import type { ReactNode } from "react";
import { typography } from "@/components/ui/Typography";

/**
 * The mobile-first form kit every create/edit sheet shares (DESIGN.md
 * "Forms"): a label above its control, never a cramped left column; choices
 * as 44px chips with 14px labels; a row of choices that scrolls sideways on
 * one line rather than wrapping into a second crowded row. Desktop gets the
 * same rhythm a touch tighter (40px chips, 13px labels, rows that wrap).
 */

const CHIP_ON = "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900";
const CHIP_OFF =
  "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-200 dark:hover:border-white/20";

export const CHOICE_CHIP = "inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold tabular-nums transition-colors lg:h-10 lg:px-3.5 lg:text-[13px]";

/** A chip's on/off colours, for a chip-like control with its own shape (a day). */
export function choiceChipTone(active: boolean): string {
  return active ? CHIP_ON : CHIP_OFF;
}

export function choiceChipClass(active: boolean): string {
  return `${CHOICE_CHIP} ${choiceChipTone(active)}`;
}

export function ChoiceChip({
  active,
  label,
  onClick,
  ariaLabel,
  detail,
  className = "",
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  ariaLabel?: string;
  /** A quieter second part of the label ("· 3 similar tasks"). */
  detail?: string;
  className?: string;
}) {
  return (
    <button type="button" aria-pressed={active} aria-label={ariaLabel} onClick={onClick} className={`${choiceChipClass(active)} ${className}`}>
      {label}
      {detail && <span className={`ml-1 font-medium ${active ? "text-white/70 dark:text-neutral-900/60" : "text-neutral-500 dark:text-neutral-400"}`}>{detail}</span>}
    </button>
  );
}

/**
 * A sheet's primary action, pinned to the sheet's bottom edge so it stays in
 * view over a long form and, as the sheet shrinks to the visual viewport,
 * above the keyboard. For a form padded `px-5`; pair it with
 * `className="scroll-pb-24"` on the BottomSheet so a field scrolled into view
 * clears it.
 */
export const STICKY_SHEET_FOOTER =
  "sticky bottom-0 z-20 -mx-5 mt-2 flex items-center gap-2.5 border-t border-neutral-200 bg-white px-5 py-3 dark:border-white/[0.08] dark:bg-neutral-900";

/** A field's label, above it: the one label style every form uses. */
export function FieldLabel({ children, right, htmlFor }: { children: ReactNode; right?: ReactNode; htmlFor?: string }) {
  return (
    <div className="mb-2 flex min-h-[18px] items-center justify-between gap-3">
      <label htmlFor={htmlFor} className={`block ${typography.eyebrow}`}>
        {children}
      </label>
      {right}
    </div>
  );
}

/** A labelled field: label on top, the control full width below. */
export function FormSection({ label, right, children, className = "" }: { label: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <FieldLabel right={right}>{label}</FieldLabel>
      {children}
    </div>
  );
}

/**
 * A labelled row of chips. On a phone it scrolls sideways on one line and
 * bleeds to the sheet's edges (the house `px-5`), so the cut-off last chip
 * says "more this way"; on desktop it wraps.
 */
export function ChipRow({ label, children, ariaLabel }: { label?: ReactNode; children: ReactNode; ariaLabel?: string }) {
  return (
    <div>
      {/* Sentence case, not an eyebrow: a chip row is a quick-pick under a
          field ("Start at · Now Morning"), not a section of its own. */}
      {label && <p className="mb-2 text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">{label}</p>}
      <div role="group" aria-label={ariaLabel} className="-mx-5 flex gap-2 overflow-x-auto overscroll-x-contain px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {children}
      </div>
    </div>
  );
}
