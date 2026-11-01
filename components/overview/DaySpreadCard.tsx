"use client";

import { categoryHex, resolveAccentColor } from "@/lib/colorSystem";
import { formatMinutesCompact } from "@/lib/dayBreakdown";
import type { DaySpread } from "@/lib/daySpread";
import { toScheduleDayMinutes } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";

/** Neutral for "Other" and anything without a colour. */
const NEUTRAL = "#A3A3A3";
/** Groups named in the legend; the rest still show on the strip. */
const LEGEND_GROUPS = 3;

export function spreadHex(color: string | null): string {
  return color ? categoryHex(resolveAccentColor(color, "")) : NEUTRAL;
}

/** "6 AM", "1 PM" — a schedule-day minute (which may run past midnight) as a clock hour. */
export function spreadClock(minutes: number): string {
  const total = ((Math.round(minutes / 60) * 60) % 1440 + 1440) % 1440;
  const h24 = Math.floor(total / 60);
  return `${h24 % 12 || 12} ${h24 >= 12 ? "PM" : "AM"}`;
}

/**
 * "Your day" on the phone Overview: when today's waking hours are booked and
 * what they go to. A strip of the waking window with each block where it sits
 * (and a mark for now), then the three biggest groups and the free time.
 * Renders nothing on a day with nothing booked; the hero already says so.
 */
export default function DaySpreadCard({ spread, now = new Date(), onOpen }: { spread: DaySpread; now?: Date; onOpen: () => void }) {
  const { windowStart, windowEnd, blocks, groups, plannedMinutes, freeMinutes } = spread;
  if (blocks.length === 0) return null;

  const span = windowEnd - windowStart;
  const colorOf = new Map(groups.map((g) => [g.id, spreadHex(g.color)]));
  const nowMinutes = toScheduleDayMinutes(now.getHours() * 60 + now.getMinutes(), windowStart);
  const nowPct = nowMinutes >= windowStart && nowMinutes <= windowEnd ? ((nowMinutes - windowStart) / span) * 100 : null;
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => windowStart + span * f);
  const summary = `${formatMinutesCompact(plannedMinutes)} planned, ${formatMinutesCompact(freeMinutes)} free. ${groups
    .map((g) => `${g.label} ${formatMinutesCompact(g.minutes)}`)
    .join(", ")}.`;

  return (
    <section data-testid="overview-day-spread" className={`${CARD} p-0`}>
      <button
        type="button"
        onClick={() => { haptic("light"); onOpen(); }}
        aria-label={`Your day. ${summary} Open Today.`}
        className="block w-full rounded-2xl p-4 text-left transition-colors active:bg-neutral-50 dark:active:bg-white/[0.03]"
      >
        <span className="flex items-baseline justify-between gap-3">
          <span className="text-[14px] font-bold text-neutral-950 dark:text-white">Your day</span>
          <span className="text-[12.5px] font-semibold tabular-nums text-neutral-600 dark:text-neutral-400">
            {formatMinutesCompact(plannedMinutes)} planned · {formatMinutesCompact(freeMinutes)} free
          </span>
        </span>

        {/* The waking day, left to right. Free time is the track itself. */}
        <span aria-hidden className="relative mt-3 block h-10 overflow-hidden rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
          {blocks.map((block, i) => (
            <span
              key={i}
              className="absolute inset-y-1 rounded-md"
              style={{
                left: `${((block.start - windowStart) / span) * 100}%`,
                width: `max(3px, ${((block.end - block.start) / span) * 100}%)`,
                backgroundColor: colorOf.get(block.groupId) ?? NEUTRAL,
              }}
            />
          ))}
          {nowPct !== null && (
            <span className="absolute inset-y-0 w-[2px] -translate-x-1/2 bg-neutral-950 dark:bg-white" style={{ left: `${nowPct}%` }} />
          )}
        </span>
        <span aria-hidden className="mt-1.5 flex justify-between text-[11px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
          {ticks.map((t, i) => (
            <span key={i}>{spreadClock(t)}</span>
          ))}
        </span>

        <span aria-hidden className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          {groups.slice(0, LEGEND_GROUPS).map((g) => (
            <span key={g.id} className="inline-flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf.get(g.id) }} />
              <span className="max-w-[140px] truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">{g.label}</span>
              <span className="text-[13px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">{formatMinutesCompact(g.minutes)}</span>
            </span>
          ))}
          {groups.length > LEGEND_GROUPS && (
            <span className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">+{groups.length - LEGEND_GROUPS} more</span>
          )}
        </span>
      </button>
    </section>
  );
}
