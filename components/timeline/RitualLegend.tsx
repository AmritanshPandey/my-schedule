"use client";

import { useMemo } from "react";
import { IconCheck } from "@tabler/icons-react";
import { COLOR_DOTS } from "./RitualStrip";
import { groupRitualsByTime } from "@/lib/timeline/groupRitualsByTime";
import type { Ritual, DayKey } from "@/lib/useScheduleDB";

// Keep in sync with RitualOverlayLayer's cap so the legend mirrors the dots.
const DAY_LIMIT = 8;

interface RitualLegendProps {
  rituals: Ritual[];
  activeDay: DayKey;
  timelineStartMinutes: number;
  timelineEndMinutes: number;
  timelineTopPadding: number;
  hourHeight: number;
  completedIds: Set<string>;
}

export default function RitualLegend({
  rituals,
  activeDay,
  timelineStartMinutes,
  timelineEndMinutes,
  timelineTopPadding,
  hourHeight,
  completedIds,
}: RitualLegendProps) {
  const visible = useMemo(() => {
    const groups = groupRitualsByTime(
      rituals, activeDay,
      timelineStartMinutes, timelineEndMinutes,
      timelineTopPadding, hourHeight,
    );
    // Flatten in timeline order, then cap to match the overlay dots.
    return groups.flatMap((g) => g.rituals).slice(0, DAY_LIMIT);
  }, [rituals, activeDay, timelineStartMinutes, timelineEndMinutes, timelineTopPadding, hourHeight]);

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
