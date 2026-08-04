"use client";

import { useMemo, useState } from "react";
import { IconChartPie } from "@tabler/icons-react";
import type { DayKey, Schedule, TaskCategory } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/scheduleConstants";
import { categoryHex } from "@/lib/colorSystem";
import { addDaysToISO } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";
import {
  buildDayBreakdown,
  donutSegments,
  formatMinutesCompact,
  HELD_TIME_ID,
} from "@/lib/dayBreakdown";

const SIZE = 132;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

interface DayBreakdownCardProps {
  /** Every weekday bucket — the filter reads across all of them. */
  activities: Schedule["activities"];
  categories: readonly TaskCategory[];
  /** Today's weekday, used as the default selection. */
  todayKey: DayKey;
  /** Today's ISO date, the anchor the other weekdays are resolved against. */
  todayISO: string;
}

/** The ISO date of `day` within the same Mon–Sun week as `todayISO`. */
function isoForWeekday(todayISO: string, todayKey: DayKey, day: DayKey): string {
  return addDaysToISO(todayISO, DAYS.indexOf(day) - DAYS.indexOf(todayKey));
}

/**
 * "Where the day goes" — scheduled time as a donut, one arc per category.
 *
 * The weekday filter reads the schedule the way it is actually stored: tasks
 * live in weekday buckets, so "which weekday" is the native question, and
 * switching is a pure re-read rather than a fetch.
 *
 * Deliberately a donut rather than a filled pie: the hole carries the total, so
 * the chart answers "how much of my day is committed" and "to what" at once.
 * Hand-rolled SVG — the project has no charting dependency and this needs none.
 */
export default function DayBreakdownCard({ activities, categories, todayKey, todayISO }: DayBreakdownCardProps) {
  const [day, setDay] = useState<DayKey>(todayKey);
  const dateISO = useMemo(() => isoForWeekday(todayISO, todayKey, day), [todayISO, todayKey, day]);
  const { slices, totalMinutes } = useMemo(
    () => buildDayBreakdown(activities[day] ?? [], categories, dateISO),
    [activities, day, categories, dateISO],
  );
  const segments = useMemo(
    () => donutSegments(slices, totalMinutes, CIRCUMFERENCE),
    [slices, totalMinutes],
  );
  // The chart is the only thing the filter changes, so its label has to name
  // the day too — otherwise a screen reader hears the same "today" for all
  // seven selections.
  const dayLabel = day === todayKey ? "today" : `on ${day[0].toUpperCase()}${day.slice(1)}`;

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

      {/* Weekday filter. Seven 1-char chips keep it to a single row on the
          narrowest shell without wrapping or scrolling. */}
      <div role="group" aria-label="Filter by weekday" className="mb-3 flex items-center gap-1">
        {DAYS.map((d, i) => {
          const selected = d === day;
          const isToday = d === todayKey;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={selected}
              aria-label={`${d[0].toUpperCase()}${d.slice(1)}${isToday ? " (today)" : ""}`}
              onClick={() => { haptic("light"); setDay(d); }}
              className={`h-7 flex-1 rounded-lg text-[11px] font-bold tabular-nums transition-colors ${
                selected
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : isToday
                  // Today stays legible when it is not the selection, so the
                  // filter never loses its anchor.
                  ? "bg-neutral-100 text-neutral-900 dark:bg-white/[0.10] dark:text-white"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
              }`}
            >
              {DAY_INITIALS[i]}
            </button>
          );
        })}
      </div>

      {totalMinutes === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center dark:border-white/[0.09]">
          <p className="text-[15px] font-bold text-neutral-950 dark:text-white">
            {day === todayKey ? "Nothing scheduled today" : "Nothing scheduled"}
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
              aria-label={`Scheduled time ${dayLabel}: ${slices
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
                const isHeld = slice.id === HELD_TIME_ID;
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
                    stroke={isHeld ? undefined : categoryHex(slice.color ?? "cyan")}
                    className={isHeld ? "stroke-neutral-400 dark:stroke-neutral-500" : undefined}
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
              <li key={slice.id} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    slice.id === HELD_TIME_ID ? "bg-neutral-400 dark:bg-neutral-500" : ""
                  }`}
                  style={
                    slice.id === HELD_TIME_ID
                      ? undefined
                      : { backgroundColor: categoryHex(slice.color ?? "cyan") }
                  }
                />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
                  {slice.label}
                </span>
                {/* Duration and share read as one figure, so they sit closer
                    to each other than to the label — which buys the label back
                    the few pixels it needs in the narrow desktop column. */}
                <span className="flex shrink-0 items-baseline gap-1.5">
                  <span className="text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
                    {formatMinutesCompact(slice.minutes)}
                  </span>
                  <span className="w-8 text-right text-[12px] font-bold tabular-nums text-neutral-400 dark:text-neutral-500">
                    {slice.pct}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
