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
  const { groups, dropped } = useMemo(() => {
    const raw = groupRitualsByTime(
      rituals, activeDay,
      timelineStartMinutes, timelineEndMinutes,
      timelineTopPadding, hourHeight,
    );
    // Cap to DAY_LIMIT total rituals across all groups (already filtered to activeDay)
    const total = raw.reduce((sum, g) => sum + g.rituals.length, 0);
    let remaining = DAY_LIMIT;
    const capped = raw
      .map((g) => {
        const take = Math.min(g.rituals.length, remaining);
        remaining -= take;
        return { ...g, rituals: g.rituals.slice(0, take) };
      })
      .filter((g) => g.rituals.length > 0);
    return { groups: capped, dropped: Math.max(0, total - DAY_LIMIT) };
  }, [rituals, activeDay, timelineStartMinutes, timelineEndMinutes, timelineTopPadding, hourHeight]);

  if (groups.length === 0) return null;

  const lastKey = groups[groups.length - 1].key;

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
            {/* Overflow indicator on the last visible group */}
            {dropped > 0 && group.key === lastKey && (
              <span className="rounded-full px-1.5 py-0.5 text-[8px] font-bold leading-none bg-neutral-200 text-neutral-600 dark:bg-white/10 dark:text-white/75">
                +{dropped}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
