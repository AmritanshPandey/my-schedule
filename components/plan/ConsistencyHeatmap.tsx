"use client";

import { IconFlame } from "@tabler/icons-react";
import type { DayCell } from "@/lib/roadmapEngine";

interface ConsistencyHeatmapProps {
  cells: DayCell[]; // plan-period cells, padded to week boundaries (Sunday start)
  streakDays: number;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Shown on rows 1 (Mon), 3 (Wed), 5 (Fri) — 0-indexed from Sunday
const DAY_LABELS: Record<number, string> = { 1: "Mo", 3: "We", 5: "Fr" };

export default function ConsistencyHeatmap({ cells, streakDays }: ConsistencyHeatmapProps) {
  // Cells arrive already padded to Sunday-start week boundaries.
  // Arrange into columns (each column = 7 cells = 1 week, Sun→Sat).
  const totalWeeks = Math.ceil(cells.length / 7);
  const weeks: DayCell[][] = Array.from({ length: totalWeeks }, (_, w) =>
    cells.slice(w * 7, w * 7 + 7)
  );

  // Build month label for each week column.
  // Show the month name at the first column where that month appears.
  const monthLabels: (string | null)[] = weeks.map((week, wi) => {
    for (const cell of week) {
      if (!cell.date || cell.isOutsidePlan) continue;
      const d = new Date(cell.date + "T00:00:00");
      const dayNum = d.getDate();
      // Show label when the 1st of a month falls in this week, OR for the
      // very first week that has a valid in-plan date.
      if (dayNum <= 7) {
        // Check that previous week didn't already show this month
        if (wi === 0) return MONTHS[d.getMonth()];
        const prevWeekMonth = weeks[wi - 1]
          .filter((c) => c.date && !c.isOutsidePlan)
          .map((c) => new Date(c.date + "T00:00:00").getMonth())[0];
        if (prevWeekMonth !== d.getMonth()) return MONTHS[d.getMonth()];
      }
    }
    return null;
  });

  // Ensure the first in-plan week always gets a month label.
  const firstLabelIdx = monthLabels.findIndex((l) => l !== null);
  if (firstLabelIdx === -1) {
    const firstPlanWeek = weeks.findIndex((w) => w.some((c) => !c.isOutsidePlan));
    if (firstPlanWeek !== -1) {
      const firstCell = weeks[firstPlanWeek].find((c) => c.date && !c.isOutsidePlan);
      if (firstCell) {
        monthLabels[firstPlanWeek] = MONTHS[new Date(firstCell.date + "T00:00:00").getMonth()];
      }
    }
  }

  const today = new Date().toISOString().split("T")[0];

  const CELL = "w-[13px] h-[13px] rounded-[3px] shrink-0";

  function cellClass(cell: DayCell): string {
    if (cell.isOutsidePlan) return `${CELL} opacity-0 pointer-events-none`;
    if (cell.date === today) {
      // Today: always show a border ring regardless of intensity
      const base = intensityBase(cell);
      return `${CELL} ${base} ring-1 ring-offset-0 ring-neutral-400/60 dark:ring-neutral-500/50`;
    }
    return `${CELL} ${intensityBase(cell)}`;
  }

  function intensityBase(cell: DayCell): string {
    if (cell.isFuture) return "bg-neutral-100/70 dark:bg-white/[0.04]";
    switch (cell.intensity) {
      case 3: return "bg-green-500 dark:bg-green-500";
      case 2: return "bg-green-400 dark:bg-green-600";
      case 1: return "bg-green-200 dark:bg-green-800/80";
      default: return "bg-neutral-100 dark:bg-white/[0.06]";
    }
  }

  return (
    <div className="w-full">
      {/* Streak pill (top right) */}
      {streakDays > 1 && (
        <div className="flex justify-end mb-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 dark:bg-green-500/10 dark:border-green-500/25 px-2.5 py-1 text-[11px] font-semibold text-green-600 dark:text-green-400">
            <IconFlame size={13} strokeWidth={2} />
            {streakDays} Day Streak
          </span>
        </div>
      )}

      {/* Scrollable grid */}
      <div className="overflow-x-auto pb-1 -mx-1 px-1">
        <div className="inline-flex gap-1 min-w-0">

          {/* Day-of-week labels column */}
          <div className="flex flex-col gap-[3px] shrink-0 mt-[18px]">
            {Array.from({ length: 7 }, (_, i) => (
              <div
                key={i}
                className="h-[13px] flex items-center justify-end pr-1"
              >
                {DAY_LABELS[i] ? (
                  <span className="text-[9px] font-medium text-neutral-400 dark:text-neutral-600 leading-none">
                    {DAY_LABELS[i]}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          {/* Week columns */}
          <div className="flex flex-col">
            {/* Month labels row */}
            <div className="flex gap-[3px] mb-[4px] h-[14px]">
              {weeks.map((_, wi) => (
                <div key={wi} className="w-[13px] shrink-0 flex items-start justify-center">
                  {monthLabels[wi] ? (
                    <span className="text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 leading-none whitespace-nowrap -translate-x-1/2 relative left-1/2">
                      {monthLabels[wi]}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Cell grid */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((cell, di) => (
                    <div
                      key={`${wi}-${di}`}
                      title={
                        cell.date && !cell.isOutsidePlan
                          ? cell.isFuture
                            ? cell.date
                            : `${cell.date}: ${cell.count} completion${cell.count !== 1 ? "s" : ""}`
                          : undefined
                      }
                      className={cellClass(cell)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-3 justify-end">
        <span className="text-[10px] text-neutral-400 dark:text-neutral-600">Less</span>
        {([0, 1, 2, 3] as const).map((lvl) => (
          <div
            key={lvl}
            className={[
              "w-[10px] h-[10px] rounded-[2px]",
              lvl === 0 ? "bg-neutral-100 dark:bg-white/[0.06]" :
              lvl === 1 ? "bg-green-200 dark:bg-green-800/80" :
              lvl === 2 ? "bg-green-400 dark:bg-green-600" :
                          "bg-green-500",
            ].join(" ")}
          />
        ))}
        <span className="text-[10px] text-neutral-400 dark:text-neutral-600">More</span>
      </div>
    </div>
  );
}
