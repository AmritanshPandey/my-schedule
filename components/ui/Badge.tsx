"use client";

import type { AccentColor } from "@/lib/colorSystem";

// ── Accent-colored badge ──────────────────────────────────────────────────────

const ACCENT_CLASSES: Record<AccentColor, string> = {
  red:     "bg-red-500/10     text-red-600     border-red-500/25     dark:bg-red-500/15     dark:text-red-400     dark:border-red-400/35",
  orange:  "bg-orange-500/10  text-orange-600  border-orange-500/25  dark:bg-orange-500/15  dark:text-orange-400  dark:border-orange-400/35",
  amber:   "bg-amber-500/10   text-amber-600   border-amber-500/25   dark:bg-amber-500/15   dark:text-amber-400   dark:border-amber-400/35",
  yellow:  "bg-yellow-500/10  text-yellow-600  border-yellow-500/25  dark:bg-yellow-500/15  dark:text-yellow-400  dark:border-yellow-400/35",
  lime:    "bg-lime-500/10    text-lime-600    border-lime-500/25    dark:bg-lime-500/15    dark:text-lime-400    dark:border-lime-400/35",
  green:   "bg-green-500/10   text-green-600   border-green-500/25   dark:bg-green-500/15   dark:text-green-400   dark:border-green-400/35",
  emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-400/35",
  teal:    "bg-teal-500/10    text-teal-600    border-teal-500/25    dark:bg-teal-500/15    dark:text-teal-400    dark:border-teal-400/35",
  cyan:    "bg-cyan-500/10    text-cyan-600    border-cyan-500/25    dark:bg-cyan-500/15    dark:text-cyan-400    dark:border-cyan-400/35",
  sky:     "bg-sky-500/10     text-sky-600     border-sky-500/25     dark:bg-sky-500/15     dark:text-sky-400     dark:border-sky-400/35",
  blue:    "bg-blue-500/10    text-blue-600    border-blue-500/25    dark:bg-blue-500/15    dark:text-blue-400    dark:border-blue-400/35",
  indigo:  "bg-indigo-500/10  text-indigo-600  border-indigo-500/25  dark:bg-indigo-500/15  dark:text-indigo-400  dark:border-indigo-400/35",
  violet:  "bg-violet-500/10  text-violet-600  border-violet-500/25  dark:bg-violet-500/15  dark:text-violet-400  dark:border-violet-400/35",
  purple:  "bg-purple-500/10  text-purple-600  border-purple-500/25  dark:bg-purple-500/15  dark:text-purple-400  dark:border-purple-400/35",
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/25 dark:bg-fuchsia-500/15 dark:text-fuchsia-400 dark:border-fuchsia-400/35",
  pink:    "bg-pink-500/10    text-pink-600    border-pink-500/25    dark:bg-pink-500/15    dark:text-pink-400    dark:border-pink-400/35",
  rose:    "bg-rose-500/10    text-rose-600    border-rose-500/25    dark:bg-rose-500/15    dark:text-rose-400    dark:border-rose-400/35",
};

interface AccentBadgeProps {
  color: AccentColor;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AccentBadge({ color, icon, children, className = "" }: AccentBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        ACCENT_CLASSES[color],
        className,
      ].join(" ")}
    >
      {icon}
      {children}
    </span>
  );
}

// ── Neutral pill ──────────────────────────────────────────────────────────────
// Used for duration labels, time ranges, counters, etc.

interface PillProps {
  children: React.ReactNode;
  className?: string;
}

export function Pill({ children, className = "" }: PillProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border border-neutral-200 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-500",
        "dark:border-white/[0.08] dark:text-neutral-400",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

// ── Weekday pill ──────────────────────────────────────────────────────────────
// Used in linked task rows to show which days a recurring task runs on.

interface DayPillProps {
  label: string;
  active: boolean;
}

export function DayPill({ label, active }: DayPillProps) {
  return (
    <span
      className={[
        "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-pr-sm text-[11px] font-bold transition-colors",
        active
          ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
          : "text-neutral-400 dark:text-neutral-600",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

// ── Index-based badge color cycle (for meta fields) ───────────────────────────
// Replaces inferBadgeClass() defined in ScheduleApp.tsx and PlanCard.tsx.

const BADGE_CYCLE: AccentColor[] = [
  "blue", "emerald", "violet", "amber", "pink", "cyan",
  "red", "orange", "teal", "sky", "indigo", "purple", "fuchsia", "rose", "green", "lime", "yellow",
];

export function cycleAccentColor(index: number): AccentColor {
  return BADGE_CYCLE[index % BADGE_CYCLE.length];
}
