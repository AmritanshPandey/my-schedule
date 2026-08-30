"use client";

import { useMemo } from "react";
import { IconCheck } from "@tabler/icons-react";
import { groupRitualsByTime } from "@/lib/timeline/groupRitualsByTime";
import type { Ritual } from "@/lib/useScheduleDB";
import { RITUAL_COLOR_DOT as COLOR_DOTS, RITUAL_DAY_LIMIT as DAY_LIMIT } from "@/lib/ritualColors";

interface RitualLegendProps {
  rituals: Ritual[];
  dateISO: string;
  timelineStartMinutes: number;
  timelineEndMinutes: number;
  timelineTopPadding: number;
  hourHeight: number;
  completedIds: Set<string>;
  trackingStart?: string;
}

export default function RitualLegend({
  rituals,
  dateISO,
  timelineStartMinutes,
  timelineEndMinutes,
  timelineTopPadding,
  hourHeight,
  completedIds,
  trackingStart,
}: RitualLegendProps) {
  const visible = useMemo(() => {
    const groups = groupRitualsByTime(
      rituals, dateISO,
      timelineStartMinutes, timelineEndMinutes,
      timelineTopPadding, hourHeight,
      trackingStart,
    );
    // Flatten in timeline order, then cap to match the overlay dots.
    return groups.flatMap((g) => g.rituals).slice(0, DAY_LIMIT);
  }, [rituals, dateISO, timelineStartMinutes, timelineEndMinutes, timelineTopPadding, hourHeight, trackingStart]);

  if (visible.length === 0) return null;

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
        Routines
      </span>
      {visible.map((ritual) => {
        const dot = ritual.color ? COLOR_DOTS[ritual.color] : "bg-neutral-400";
        const done = completedIds.has(ritual.id);
        return (
          <span
            key={ritual.id}
            className={`flex items-center gap-1.5 text-[11px] font-medium ${
              done
                ? "text-neutral-400 line-through dark:text-neutral-600"
                : "text-neutral-600 dark:text-neutral-300"
            }`}
          >
            <span
              className={`flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full ${dot} ${
                done ? "opacity-50" : "opacity-100"
              }`}
            >
              {done && <IconCheck size={7} strokeWidth={4} className="text-white/90" />}
            </span>
            {ritual.title}
          </span>
        );
      })}
    </div>
  );
}
