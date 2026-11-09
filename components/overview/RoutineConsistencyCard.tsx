"use client";

import type { RoutineConsistencyRow, RoutineDayMark } from "@/lib/overview";
import { CARD } from "@/components/ui/surfaces";

const DOT: Record<RoutineDayMark, string> = {
  done: "bg-emerald-500",
  missed: "bg-amber-500",
  // Today (still open) and days ahead: the plan, not the record.
  future: "border border-neutral-300 dark:border-white/20",
  off: "bg-neutral-100 dark:bg-white/[0.06]",
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * This week's follow-through per routine: a dot per day — green done, amber
 * missed, hollow still open, faint when the routine wasn't due — and the
 * week's % over the days that were due.
 */
export default function RoutineConsistencyCard({ rows, pct }: { rows: RoutineConsistencyRow[]; pct: number }) {
  if (rows.length === 0) return null;
  return (
    <section data-testid="overview-routine-card" className={`${CARD} px-4 pb-2 pt-4`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-bold text-neutral-950 dark:text-white">Routine consistency</h2>
        <span className="text-[13px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">{pct}% this week</span>
      </div>
      <ul className="mt-2 divide-y divide-neutral-100 dark:divide-white/[0.06]">
        {rows.map(({ ritual, days }) => (
          <li key={ritual.id} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0 truncate text-[14px] font-semibold text-neutral-900 dark:text-neutral-100">{ritual.title}</span>
            <span
              className="flex shrink-0 gap-1.5"
              role="img"
              aria-label={days.map((mark, i) => `${DAY_NAMES[i]} ${mark === "off" ? "not due" : mark === "future" ? "open" : mark}`).join(", ")}
            >
              {days.map((mark, i) => (
                <span key={i} className={`h-2.5 w-2.5 rounded-full ${DOT[mark]}`} />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
