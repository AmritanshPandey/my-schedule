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

export const typography = {
  pageTitle:       "text-[28px] font-bold leading-tight tracking-[-0.3px] text-neutral-950 dark:text-white",
  sectionTitle:    "text-[20px] font-bold leading-tight tracking-[-0.3px] text-neutral-950 dark:text-white",
  sheetTitle:      "text-[18px] font-bold text-neutral-950 dark:text-white",
  subsectionTitle: "text-[16px] font-semibold text-neutral-950 dark:text-white",
  eyebrow:         "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500",
  body:            "text-[14px] font-medium leading-relaxed text-neutral-600 dark:text-neutral-400",
  caption:         "text-[12px] font-medium text-neutral-400 dark:text-neutral-500",
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
