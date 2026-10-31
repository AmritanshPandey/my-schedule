import type { StatusTone, WeekVerdict } from "@/lib/overview";

/**
 * Class names for the one status ramp (lib/overview.ts statusTone). Every
 * Overview instrument — week bars, routine bars, the verdict — reads off these
 * so a glance means the same thing everywhere.
 */
export const TONE_FILL: Record<StatusTone, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-400",
  bad: "bg-rose-400",
  none: "bg-neutral-300 dark:bg-white/15",
};

export const VERDICT_PILL: Record<WeekVerdict, string> = {
  "on-track": "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400",
  "at-risk": "bg-amber-500/12 text-amber-700 dark:bg-amber-400/12 dark:text-amber-300",
  behind: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300",
};
