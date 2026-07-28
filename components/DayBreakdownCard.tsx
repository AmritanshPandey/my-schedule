"use client";

import { useMemo, useState } from "react";
import { IconChartPie } from "@tabler/icons-react";
import type { Category, DayKey, Task } from "@/lib/useScheduleDB";
import { categoryHex } from "@/lib/colorSystem";
import { CARD } from "@/components/ui/surfaces";
import { DAYS, DAY_LABELS, previousDayKey } from "@/lib/scheduleConstants";
import { addDaysToISO, weekdayOfISO } from "@/lib/dateUtils";
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
  /**
   * Every weekday's tasks. The card picks the day itself, and needs the
   * neighbouring bucket anyway to pull in overnight carry-in (e.g. sleep).
   */
  activities: Partial<Record<DayKey, readonly Task[]>>;
  categories: readonly Category[];
  /** Today's date — the default selection and the anchor for the weekday strip. */
  todayISO: string;
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
export default function DayBreakdownCard({ activities, categories, todayISO }: DayBreakdownCardProps) {
  const todayKey = weekdayOfISO(todayISO);
  const [day, setDay] = useState<DayKey>(todayKey);
  const isToday = day === todayKey;

  // The date of the selected weekday in the week containing today. Recurrence
  // and per-date exceptions are date-driven, so the breakdown needs a real date
  // rather than just a weekday bucket.
  const dateISO = useMemo(
    () => addDaysToISO(todayISO, DAYS.indexOf(day) - DAYS.indexOf(todayKey)),
    [todayISO, day, todayKey],
  );

  // "Saturday", not the two-letter chip label — this reads in a sentence.
  const dayName = useMemo(
    () => new Date(dateISO + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" }),
    [dateISO],
  );

  const { slices, totalMinutes } = useMemo(
    () =>
      buildDayBreakdown({
        dateISO,
        tasks: activities[day] ?? [],
        previousTasks: activities[previousDayKey(day)] ?? [],
        categories,
      }),
    [activities, day, categories, dateISO],
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

      {/* Day filter. Horizontally scrollable so seven chips never wrap on a
          narrow phone; the selected day carries the label, so the readout below
          is never ambiguous about which day it describes. */}
      <div className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {DAYS.map((d) => {
          const selected = d === day;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              aria-pressed={selected}
              className={`h-7 shrink-0 rounded-full px-2.5 text-[11px] font-bold transition-colors ${
                selected
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                  : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400 dark:hover:bg-white/[0.1]"
              }`}
            >
              {DAY_LABELS[d]}
              {d === todayKey && !selected && (
                <span className="ml-1 inline-block h-1 w-1 rounded-full bg-green-500 align-middle" />
              )}
            </button>
          );
        })}
      </div>

      {totalMinutes === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center dark:border-white/[0.09]">
          <p className="text-[15px] font-bold text-neutral-950 dark:text-white">
            Nothing scheduled {isToday ? "today" : `on ${dayName}`}
          </p>
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
              aria-label={`Scheduled time on ${dayName}: ${slices
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
