"use client";

import { IconFlame } from "@tabler/icons-react";
import type { ExecutionStreak } from "@/lib/consistency/calculateExecutionStreak";

/**
 * The Overview header's streak: days in a row with something done. Amber when
 * today still needs one thing to keep it, so the pill doubles as the nudge.
 * Renders nothing before the first day of a streak.
 */
export default function StreakPill({ streak }: { streak: ExecutionStreak }) {
  if (streak.streak <= 0) return null;
  const atRisk = streak.atRisk;
  return (
    <div
      data-testid="overview-streak"
      title={atRisk ? "Do one thing today to keep it" : undefined}
      className={`inline-flex shrink-0 items-center gap-2.5 rounded-2xl px-3.5 py-2 ${
        atRisk ? "bg-amber-500/12 dark:bg-amber-400/12" : "bg-rose-500/10 dark:bg-rose-400/10"
      }`}
    >
      <IconFlame
        size={22}
        strokeWidth={2}
        aria-hidden
        className={atRisk ? "text-amber-600 dark:text-amber-300" : "text-rose-500 dark:text-rose-400"}
      />
      <span className="flex flex-col leading-none">
        <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">Current streak</span>
        <span className="mt-1 text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
          <span className="text-[20px] font-extrabold tabular-nums text-neutral-950 dark:text-white">{streak.streak}</span> {streak.streak === 1 ? "day" : "days"}
        </span>
      </span>
    </div>
  );
}
