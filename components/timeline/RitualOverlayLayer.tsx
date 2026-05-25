"use client";

import { useMemo } from "react";
import RitualStrip from "./RitualStrip";
import { groupRitualsByTime } from "@/lib/timeline/groupRitualsByTime";
import type { Ritual, DayKey } from "@/lib/useScheduleDB";

const DAY_LIMIT = 8;

interface RitualOverlayLayerProps {
  rituals: Ritual[];
  activeDay: DayKey;
  timelineStartMinutes: number;
  timelineEndMinutes: number;
  timelineTopPadding: number;
  hourHeight: number;
  completedIds: Set<string>;
  onToggleComplete: (id: string) => void;
}

export default function RitualOverlayLayer({
  rituals,
  activeDay,
  timelineStartMinutes,
  timelineEndMinutes,
  timelineTopPadding,
  hourHeight,
  completedIds,
  onToggleComplete,
}: RitualOverlayLayerProps) {
  const groups = useMemo(() => {
    const raw = groupRitualsByTime(
      rituals, activeDay,
      timelineStartMinutes, timelineEndMinutes,
      timelineTopPadding, hourHeight,
    );
    // Cap to DAY_LIMIT total rituals across all groups (already filtered to activeDay)
    let remaining = DAY_LIMIT;
    return raw
      .map((g) => {
        const take = Math.min(g.rituals.length, remaining);
        remaining -= take;
        return { ...g, rituals: g.rituals.slice(0, take) };
      })
      .filter((g) => g.rituals.length > 0);
  }, [rituals, activeDay, timelineStartMinutes, timelineEndMinutes, timelineTopPadding, hourHeight]);

  if (groups.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[22]">
      {groups.map((group) => (
        <div
          key={group.key}
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: group.top - 5 }}
        >
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {group.rituals.map((ritual) => (
              <RitualStrip
                key={ritual.id}
                ritual={ritual}
                completed={completedIds.has(ritual.id)}
                onToggle={() => onToggleComplete(ritual.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
