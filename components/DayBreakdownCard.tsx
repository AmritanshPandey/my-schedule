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
  buildActiveHours,
  buildDayBreakdown,
  donutSegments,
  formatMinutesCompact,
  HELD_TIME_ID,
  UNSCHEDULED_ID,
} from "@/lib/dayBreakdown";
import { DEFAULT_TIMELINE_START_MINUTES, getConfiguredDayStartMinutes } from "@/lib/timeline/displayWindow";
import { isTaskScheduledOn, resolveOccurrence } from "@/lib/taskOccurrence";
import { getSlots } from "@/lib/taskMutations";
import { parseTimeToMinutes, toScheduleDayMinutes } from "@/lib/timeUtils";

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
  /**
   * Supplies the waking-day start for the active-hours bar.
   *
   * Required, not optional: as an optional prop a shell that forgot to pass it
   * would still type-check and silently report everyone's day as starting at
   * the default — the same trap `TaskBlockCard.category` documents.
   */
  preferences: Schedule["preferences"];
}

/**
 * "7 AM" / "11:30 PM" / "4 AM (next day)" — a schedule-day minute as a clock time.
 *
 * The "(next day)" marker matters: the schedule day runs to 28:00, and wrapping
 * that to a bare "4 AM" put the day's end an hour *before* a 5:30 AM start with
 * nothing on screen saying otherwise.
 */
function fmtClock(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  const mm = total % 60;
  const suffix = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 || 12;
  const clock = mm === 0 ? `${h} ${suffix}` : `${h}:${String(mm).padStart(2, "0")} ${suffix}`;
  return minutes >= 1440 ? `${clock} (next day)` : clock;
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
 *
 * The ring is the whole 24-hour day, unscheduled time included, so a wedge's
 * percentage means "share of my day" and is comparable across days. It used to
 * be a share of whatever happened to be booked, which read the same at 2 hours
 * scheduled as at 14.
 */
export default function DayBreakdownCard({ activities, categories, todayKey, todayISO, preferences }: DayBreakdownCardProps) {
  const [day, setDay] = useState<DayKey>(todayKey);
  // Hovering/focusing a legend row lifts its wedge and swaps the centre readout
  // to that slice — an informative peek, not decoration. Null = show the total.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const dateISO = useMemo(() => isoForWeekday(todayISO, todayKey, day), [todayISO, todayKey, day]);
  // The previous weekday's overnight tails land inside this day, exactly where
  // the timeline draws them, so they are counted here rather than on their
  // start day. `activities` is weekday-keyed and dateless, so Monday simply
  // reads the `sunday` bucket against the preceding Sunday's date.
  const carryIn = useMemo(() => {
    const prev = DAYS[(DAYS.indexOf(day) + 6) % 7];
    return { tasks: activities[prev] ?? [], dateISO: addDaysToISO(dateISO, -1) };
  }, [activities, day, dateISO]);
  // One anchor for the whole card — the donut math, the active-hours window,
  // and the footer all read the same number, so they can't disagree the way
  // a fixed 4 AM boundary used to (a gap between 4:00 and a later configured
  // start showed up as phantom "Unscheduled" time).
  const dayStartMinutes =
    getConfiguredDayStartMinutes(preferences?.dayStartTime) ?? DEFAULT_TIMELINE_START_MINUTES;
  const breakdown = useMemo(
    () =>
      buildDayBreakdown(
        activities[day] ?? [],
        categories,
        dateISO,
        carryIn,
        preferences?.startDate,
        dayStartMinutes,
      ),
    [activities, day, categories, dateISO, carryIn, preferences?.startDate, dayStartMinutes],
  );
  const { slices, totalMinutes, committedMinutes, overlapMinutes } = breakdown;
  const active = useMemo(
    () => buildActiveHours(breakdown, preferences?.sleepHours),
    [breakdown, preferences?.sleepHours],
  );
  // The day's real end: a fixed "End of day" caps an abnormally late task;
  // otherwise it's the end of the last timed task on this weekday (never the
  // 4 AM schedule boundary). Null when nothing is timed.
  //
  // `dayEndAuto` has to be checked, not just the presence of `dayEndMinutes`:
  // the settings row leaves the old fixed value in place when you switch to
  // "Follow last task", so reading the number alone silently ignores the mode.
  // And the scan is gated on `isTaskScheduledOn` so a skipped occurrence can no
  // longer drag the day's end out to a block that never ran.
  const resolvedDayEndMinutes = useMemo(() => {
    if (!preferences?.dayEndAuto && typeof preferences?.dayEndMinutes === "number") {
      return preferences.dayEndMinutes;
    }
    let lastEnd: number | null = null;
    for (const t of activities[day] ?? []) {
      if (!isTaskScheduledOn(t, dateISO, true, preferences?.startDate)) continue;
      const occ = resolveOccurrence(t, dateISO);
      for (const s of getSlots(occ)) {
        const rawEnd = parseTimeToMinutes(s.endTime);
        const rawStart = parseTimeToMinutes(s.startTime);
        if (rawEnd === null || rawStart === null) continue;
        let end = toScheduleDayMinutes(rawEnd);
        const start = toScheduleDayMinutes(rawStart);
        if (end <= start) end += 24 * 60; // spans midnight
        if (lastEnd === null || end > lastEnd) lastEnd = end;
      }
    }
    return lastEnd;
  }, [activities, day, dateISO, preferences?.dayEndAuto, preferences?.dayEndMinutes, preferences?.startDate]);
  const segments = useMemo(
    () => donutSegments(slices, totalMinutes, CIRCUMFERENCE),
    [slices, totalMinutes],
  );
  // The chart is the only thing the filter changes, so its label has to name
  // the day too — otherwise a screen reader hears the same "today" for all
  // seven selections.
  const dayLabel = day === todayKey ? "today" : `on ${day[0].toUpperCase()}${day.slice(1)}`;
  const hoveredSlice = hoveredId ? slices.find((s) => s.id === hoveredId) ?? null : null;

  return (
    <section data-testid="overview-day-breakdown" className={`${CARD} px-5 py-4`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconChartPie size={15} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
          <p className="truncate text-[13px] font-bold text-neutral-800 dark:text-neutral-200">Where the day goes</p>
        </div>
        {committedMinutes > 0 && (
          <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-bold tabular-nums text-neutral-500 dark:border-white/[0.09] dark:bg-white/[0.04] dark:text-neutral-400">
            {formatMinutesCompact(committedMinutes)}
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

      {committedMinutes === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center dark:border-white/[0.09]">
          <p className="text-[16px] font-bold text-neutral-950 dark:text-white">
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
                const isFree = slice.id === UNSCHEDULED_ID;
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
                    stroke={isHeld || isFree ? undefined : categoryHex(slice.color ?? "cyan")}
                    // Dim the other wedges when a legend row is active, so the
                    // hovered slice reads as the figure and the rest as ground.
                    style={{ opacity: hoveredId && hoveredId !== seg.id ? 0.22 : 1 }}
                    className={`transition-opacity duration-200 motion-reduce:transition-none ${
                      isFree
                        // Fainter than held time: unbooked hours are the one
                        // wedge that should recede rather than compete.
                        ? "stroke-neutral-200 dark:stroke-white/[0.10]"
                        : isHeld ? "stroke-neutral-400 dark:stroke-neutral-500" : ""
                    }`}
                  />
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <span className="text-[22px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">
                {formatMinutesCompact(hoveredSlice ? hoveredSlice.minutes : committedMinutes)}
              </span>
              {/* neutral-500/400 rather than 400/500: #A1A1A1 on white is
                  2.5:1 and fails AA at this size, as does neutral-500 on the
                  dark card. This pairing clears 4.5:1 in both themes. */}
              <span className="mt-1 max-w-full truncate text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                {hoveredSlice ? hoveredSlice.label : "Committed"}
              </span>
            </div>
          </div>

          {/* Legend */}
          <ul className="flex w-full min-w-0 flex-col gap-2">
            {slices.map((slice) => (
              <li
                key={slice.id}
                tabIndex={0}
                onMouseEnter={() => setHoveredId(slice.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(slice.id)}
                onBlur={() => setHoveredId(null)}
                className={`-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-0.5 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-neutral-900/20 dark:focus-visible:ring-white/25 ${
                  hoveredId === slice.id ? "bg-neutral-50 dark:bg-white/[0.04]" : ""
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    slice.id === HELD_TIME_ID ? "bg-neutral-400 dark:bg-neutral-500" : ""
                  } ${
                    slice.id === UNSCHEDULED_ID ? "bg-neutral-200 dark:bg-white/[0.14]" : ""
                  }`}
                  style={
                    slice.id === HELD_TIME_ID || slice.id === UNSCHEDULED_ID
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
                  <span className="w-8 text-right text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
                    {slice.pct}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Active hours. Sits outside the empty-state branch on purpose: a day
          with nothing on it is exactly when "24h free" is worth saying.

          Sleep is not in this budget in either direction — it defines the
          waking window rather than being charged against it. Counting it both
          ways is what used to report "25h 30m / 17h": 7h 45m of sleep measured
          against a window that had already had 7h taken out for it. */}
      <div className="mt-4 border-t border-neutral-200/70 pt-3 dark:border-white/[0.07]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
            Active hours
          </p>
          <p className="shrink-0 text-[12px] font-bold tabular-nums text-neutral-700 dark:text-neutral-300">
            {formatMinutesCompact(active.activeMinutes)} / {formatMinutesCompact(active.wakingMinutes)}
          </p>
        </div>

        {/* Plain divs rather than <ProgressBar>: that component animates width
            through framer's `m`, and the iOS Dashboard tab has no LazyMotion
            ancestor, so the fill would sit at 0 forever there. Two fills over a
            neutral track — active work, then deliberate rest — so recovery
            reads as time spent on purpose rather than as leftover slack. */}
        <div
          role="img"
          aria-label={`${formatMinutesCompact(active.activeMinutes)} active and ${formatMinutesCompact(active.restMinutes)} rest, of ${formatMinutesCompact(active.wakingMinutes)} awake`}
          className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.08]"
        >
          <div
            className="h-full bg-emerald-600 transition-[width] duration-500 motion-reduce:transition-none dark:bg-emerald-400"
            style={{ width: `${active.activePct}%` }}
          />
          <div
            className="h-full bg-indigo-400 transition-[width] duration-500 motion-reduce:transition-none dark:bg-indigo-500"
            style={{ width: `${active.restPct}%` }}
          />
        </div>

        {/* The four buckets partition 24h by construction, so active+rest can
            never exceed the waking window — the old "overbooked" state is
            unreachable. What can still go wrong is booking the day so full that
            sleep no longer fits, which is the warning worth showing. */}
        {active.sleepShortfallMinutes > 0 ? (
          <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            {breakdown.sleepIsScheduled
              ? `${formatMinutesCompact(active.sleepShortfallMinutes)} less sleep than your ${formatMinutesCompact(active.sleepTargetMinutes)}`
              : `Only ${formatMinutesCompact(active.sleepMinutes)} left for sleep — ${formatMinutesCompact(active.sleepShortfallMinutes)} short of your ${formatMinutesCompact(active.sleepTargetMinutes)}`}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-400 dark:bg-indigo-500" />
              {formatMinutesCompact(active.restMinutes)} rest
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-200 dark:bg-white/[0.14]" />
              {formatMinutesCompact(active.freeMinutes)} free
            </span>
            <span className="text-neutral-500 dark:text-neutral-400">
              {formatMinutesCompact(active.sleepMinutes)} sleep
            </span>
          </div>
        )}

        {/* Union math counts a double-booked minute once, which is what makes
            the ring honest — but it would also swallow the fact that two things
            are booked on top of each other. This is that signal, restored. */}
        {overlapMinutes > 0 && (
          <p className="mt-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            {formatMinutesCompact(committedMinutes + overlapMinutes)} booked across{" "}
            {formatMinutesCompact(committedMinutes)} of clock — {formatMinutesCompact(overlapMinutes)} double-booked
          </p>
        )}
      </div>

      {/* Names, in one breath, exactly the window the ring above measures —
          so a gap that reads as "Unscheduled" can be checked against these two
          numbers instead of taken on faith. Merged into one line rather than a
          split justify-between row: two facts read as disconnected metadata,
          one sentence reads as an explanation. */}
      <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
        <span className="font-semibold text-neutral-700 dark:text-neutral-300">Ring covers</span>{" "}
        <span className="tabular-nums">{fmtClock(dayStartMinutes)}</span>
        {" – "}
        <span className="tabular-nums">{fmtClock(resolvedDayEndMinutes ?? dayStartMinutes + 24 * 60)}</span>
      </p>
    </section>
  );
}
