"use client";

import type { ElementType, ReactNode } from "react";

interface TextProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
}

// ── Raw class strings ─────────────────────────────────────────────────────────
// Import `typography` when you need to apply a style to an existing element
// (e.g. a <label>, a <span> inside a flex row, etc.) rather than using the
// component wrapper.
//
// Sizes come from the `--text-*` scale in app/globals.css. This file used to
// declare its own ladder (28/20/18/16/14/12/11) alongside DESIGN.md's
// (40/22/15/13/11), so the app carried two competing scales plus 22 raw
// `text-[Npx]` values. There is now one ladder and this is a view onto it.

// The muted ramp runs neutral-500 in light and neutral-400 in dark, never the
// other way round. It used to be inverted here — the lighter grey on white, the
// darker one on #171717 — which is the worst pick available in both themes:
// measured 2.58:1 and 3.78:1 against their real backgrounds, where AA wants 4.5.
// The corrected pair reads 4.74:1 and 6.96:1. DESIGN.md §Neutral names #737373
// (neutral-500) as Muted "secondary text, labels", so this is what the system
// always said; only the implementation disagreed.
//
// These values are tuned against the page ground. A surface one tonal step in —
// a category-tinted timeline block, the sidebar shell, a neutral-100 inner panel —
// pulls neutral-500 down to 3.95-4.35:1, under AA again. Muted text on those takes
// neutral-600 in light; the dark end is unaffected. eyebrow and caption take that
// value outright: they are the two styles that appear on every surface in the app,
// so they are tuned for the worst of them rather than for white.
export const typography = {
  pageTitle:       "text-display font-semibold leading-tight tracking-[-0.3px] text-neutral-950 dark:text-white",
  sectionTitle:    "text-headline font-semibold leading-tight tracking-[-0.3px] text-neutral-950 dark:text-white",
  sheetTitle:      "text-lead font-semibold text-neutral-950 dark:text-white",
  subsectionTitle: "text-subtitle font-semibold text-neutral-950 dark:text-white",
  eyebrow:         "text-label font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400",
  body:            "text-bodylg font-medium leading-relaxed text-neutral-600 dark:text-neutral-400",
  caption:         "text-caption font-medium text-neutral-600 dark:text-neutral-400",
} as const;

// ── Component wrappers ────────────────────────────────────────────────────────
// Change styles once here → all uses update automatically.

export function PageTitle({ children, className = "", as: Tag = "h1" }: TextProps) {
  return (
    <Tag className={`${typography.pageTitle} ${className}`}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, className = "", as: Tag = "h2" }: TextProps) {
  return (
    <Tag className={`${typography.sectionTitle} ${className}`}>
      {children}
    </Tag>
  );
}

export function SheetTitle({ children, className = "", as: Tag = "h2" }: TextProps) {
  return (
    <Tag className={`${typography.sheetTitle} ${className}`}>
      {children}
    </Tag>
  );
}

export function SubsectionTitle({ children, className = "", as: Tag = "h2" }: TextProps) {
  return (
    <Tag className={`${typography.subsectionTitle} ${className}`}>
      {children}
    </Tag>
  );
}

export function Eyebrow({ children, className = "", as: Tag = "p" }: TextProps) {
  return (
    <Tag className={`${typography.eyebrow} ${className}`}>
      {children}
    </Tag>
  );
}

export function BodyText({ children, className = "", as: Tag = "p" }: TextProps) {
  return (
    <Tag className={`${typography.body} ${className}`}>
      {children}
    </Tag>
  );
}

export function Caption({ children, className = "", as: Tag = "p" }: TextProps) {
  return (
    <Tag className={`${typography.caption} ${className}`}>
      {children}
    </Tag>
  );
}
