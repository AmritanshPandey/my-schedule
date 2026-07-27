"use client";

import { useMemo } from "react";
import { IconChartPie } from "@tabler/icons-react";
import type { Category, DayKey, Task } from "@/lib/useScheduleDB";
import { categoryHex } from "@/lib/colorSystem";
import { CARD } from "@/components/ui/surfaces";
import {
  buildDayBreakdown,
  donutSegments,
  formatMinutesCompact,
} from "@/lib/dayBreakdown";

const SIZE = 132;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface DayBreakdownCardProps {
  tasks: readonly Task[];
  /** The previous weekday's tasks — supplies overnight carry-in (e.g. sleep). */
  previousTasks: readonly Task[];
  categories: readonly Category[];
  dateISO: string;
  /** Only used for the empty-state copy. */
  dayKey?: DayKey;
}

/**
 * "Where the day goes" — a day's scheduled time as a donut, one arc per
 * category, with overnight blocks split at midnight across the two days they
 * touch.
 *
 * Deliberately a donut rather than a filled pie: the hole carries the total, so
 * the chart answers "how much of my day is committed" and "to what" at once.
 * Hand-rolled SVG — the project has no charting dependency and this needs none.
 */
export default function DayBreakdownCard({ tasks, previousTasks, categories, dateISO }: DayBreakdownCardProps) {
  const { slices, totalMinutes } = useMemo(
    () => buildDayBreakdown({ dateISO, tasks, previousTasks, categories }),
    [tasks, previousTasks, categories, dateISO],
  );
  const segments = useMemo(
    () => donutSegments(slices, totalMinutes, CIRCUMFERENCE),
    [slices, totalMinutes],
  );

  return (
    <section data-testid="overview-day-breakdown" className={`${CARD} px-4 py-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconChartPie size={15} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
          <p className="truncate text-[13px] font-bold text-neutral-800 dark:text-neutral-200">Where the day goes</p>
        </div>
        {totalMinutes > 0 && (
          <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-bold tabular-nums text-neutral-500 dark:border-white/[0.09] dark:bg-white/[0.04] dark:text-neutral-400">
            {formatMinutesCompact(totalMinutes)}
          </span>
        )}
      </div>

      {totalMinutes === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center dark:border-white/[0.09]">
          <p className="text-[15px] font-bold text-neutral-950 dark:text-white">Nothing scheduled today</p>
          <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
            Block some time and this shows how it splits.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
          {/* Donut */}
          <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              role="img"
              aria-label={`Scheduled time today: ${slices
                .map((s) => `${s.label} ${formatMinutesCompact(s.minutes)}`)
                .join(", ")}`}
              /* -90deg so the first arc starts at 12 o'clock. */
              style={{ transform: "rotate(-90deg)" }}
            >
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                className="stroke-neutral-100 dark:stroke-white/[0.06]"
              />
              {segments.map((seg) => {
                const slice = slices.find((s) => s.id === seg.id)!;
                return (
                  <circle
                    key={seg.id}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    strokeWidth={STROKE}
                    // A hairline gap between arcs keeps adjacent wedges legible
                    // without a stroke that would misreport the proportions.
                    strokeDasharray={`${Math.max(0, seg.dash - 1.5)} ${CIRCUMFERENCE}`}
                    strokeDashoffset={-seg.offset}
                    stroke={categoryHex(slice.color)}
                  />
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[20px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">
                {formatMinutesCompact(totalMinutes)}
              </span>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                Scheduled
              </span>
            </div>
          </div>

          {/* Legend */}
          <ul className="flex w-full min-w-0 flex-col gap-2">
            {slices.map((slice) => (
              <li key={slice.id} className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryHex(slice.color) }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
                  {slice.label}
                </span>
                <span className="shrink-0 text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
                  {formatMinutesCompact(slice.minutes)}
                </span>
                <span className="w-9 shrink-0 text-right text-[12px] font-bold tabular-nums text-neutral-400 dark:text-neutral-500">
                  {slice.pct}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
