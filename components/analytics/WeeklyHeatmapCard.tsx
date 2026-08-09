"use client";

import { useMemo } from "react";
import { IconCalendarWeek } from "@tabler/icons-react";
import type { DayKey, Schedule } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/scheduleConstants";
import { CARD } from "@/components/ui/surfaces";
import { formatMinutesCompact } from "@/lib/dayBreakdown";
import {
  buildWeeklyHeatmap,
  levelForMinutes,
  BAND_LABELS,
} from "@/lib/analytics/weeklyHeatmap";
import { HEATMAP_RAMP } from "@/lib/analytics/heatmapRamp";

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

interface WeeklyHeatmapCardProps {
  activities: Schedule["activities"];
  todayKey: DayKey;
  todayISO: string;
}

/**
 * "Busiest hours" — scheduled time as a weekday × time-of-day grid.
 *
 * The companion to the donut: the donut answers *where* the day's time goes, the
 * heatmap answers *when* across the week. Hand-rolled CSS grid — no charting
 * dependency, and no framer, so it renders on the iOS Dashboard tab (which has
 * no LazyMotion ancestor) as readily as on desktop.
 */
export default function WeeklyHeatmapCard({ activities, todayKey, todayISO }: WeeklyHeatmapCardProps) {
  const { grid, maxMinutes, totalMinutes } = useMemo(
    () => buildWeeklyHeatmap(activities, todayISO, todayKey),
    [activities, todayISO, todayKey],
  );

  const todayIdx = DAYS.indexOf(todayKey);

  // A short spoken summary so a screen reader hears the shape, not 42 cells.
  const ariaLabel = useMemo(() => {
    if (totalMinutes === 0) return "Weekly heatmap: nothing scheduled.";
    let peak = { d: 0, b: 0, m: 0 };
    grid.forEach((row, d) =>
      row.forEach((m, b) => {
        if (m > peak.m) peak = { d, b, m };
      }),
    );
    const dayName = DAYS[peak.d];
    return `Weekly heatmap of scheduled time. Busiest around ${BAND_LABELS[peak.b]} on ${dayName[0].toUpperCase()}${dayName.slice(1)}.`;
  }, [grid, totalMinutes]);

  return (
    <section data-testid="overview-weekly-heatmap" className={`${CARD} px-5 py-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconCalendarWeek size={15} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
          <p className="truncate text-[13px] font-bold text-neutral-800 dark:text-neutral-200">Busiest hours</p>
        </div>
        {totalMinutes > 0 && (
          <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-bold tabular-nums text-neutral-500 dark:border-white/[0.09] dark:bg-white/[0.04] dark:text-neutral-400">
            {formatMinutesCompact(totalMinutes)}/wk
          </span>
        )}
      </div>

      {totalMinutes === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center dark:border-white/[0.09]">
          <p className="text-[16px] font-bold text-neutral-950 dark:text-white">Nothing scheduled yet</p>
          <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
            Block time across the week and the busy hours light up here.
          </p>
        </div>
      ) : (
        <>
          <div
            role="img"
            aria-label={ariaLabel}
            className="grid gap-x-1.5 gap-y-1"
            style={{ gridTemplateColumns: "auto repeat(7, minmax(0, 1fr))" }}
          >
            {/* Header row: corner + weekday initials */}
            <span aria-hidden className="" />
            {DAY_INITIALS.map((initial, d) => (
              <span
                key={d}
                aria-hidden
                className={`pb-1 text-center text-[10px] font-bold tabular-nums ${
                  d === todayIdx
                    ? "text-neutral-900 dark:text-white"
                    : "text-neutral-400 dark:text-neutral-500"
                }`}
              >
                {initial}
              </span>
            ))}

            {/* One row per 4-hour band */}
            {BAND_LABELS.map((label, b) => (
              <FragmentRow key={label} label={label}>
                {DAYS.map((day, d) => {
                  const minutes = grid[d][b];
                  const level = levelForMinutes(minutes, maxMinutes);
                  const dayName = `${day[0].toUpperCase()}${day.slice(1)}`;
                  return (
                    <div
                      key={day}
                      title={`${dayName} · ${label} · ${formatMinutesCompact(minutes)}`}
                      className={`aspect-square min-h-[14px] w-full rounded-[4px] transition-colors ${HEATMAP_RAMP[level]} ${
                        d === todayIdx ? "ring-1 ring-inset ring-neutral-900/15 dark:ring-white/20" : ""
                      }`}
                    />
                  );
                })}
              </FragmentRow>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center justify-end gap-1.5">
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">Low</span>
            {HEATMAP_RAMP.map((cls, i) => (
              <span key={i} aria-hidden className={`h-2.5 w-2.5 rounded-[3px] ${cls}`} />
            ))}
            <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">High</span>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * A band's row: its left-hand time label followed by the seven day cells.
 * A fragment keeps the cells as direct grid children so they align to the
 * `repeat(7, 1fr)` columns rather than nesting into one cell.
 */
function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="flex items-center pr-1.5 text-right text-[9px] font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
        {label}
      </span>
      {children}
    </>
  );
}
