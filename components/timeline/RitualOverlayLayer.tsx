"use client";

import { useMemo } from "react";
import RitualStrip from "./RitualStrip";
import { groupRitualsByTime } from "@/lib/timeline/groupRitualsByTime";
import type { Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { RITUAL_DAY_LIMIT as DAY_LIMIT } from "@/lib/ritualColors";

interface RitualOverlayLayerProps {
  rituals: Ritual[];
  ritualCompletions: RitualCompletion[];
  dateISO: string;
  timelineStartMinutes: number;
  timelineEndMinutes: number;
  timelineTopPadding: number;
  hourHeight: number;
  completedIds: Set<string>;
  onToggleComplete: (id: string) => void;
  /** One occurrence of a "times" ritual — toggles just that occurrence's row. */
  onToggleStep: (ritualId: string, stepId: string) => void;
  trackingStart?: string;
}

export default function RitualOverlayLayer({
  rituals,
  ritualCompletions,
  dateISO,
  timelineStartMinutes,
  timelineEndMinutes,
  timelineTopPadding,
  hourHeight,
  completedIds,
  onToggleComplete,
  onToggleStep,
  trackingStart,
}: RitualOverlayLayerProps) {
  // Which (ritualId, stepId) pairs already have a completion row on dateISO —
  // the per-occurrence analogue of completedIds, which only knows whole-ritual
  // day-completion and can't tell one "times" occurrence from another.
  const todaysStepDone = useMemo(() => {
    const done = new Set<string>();
    for (const c of ritualCompletions) {
      if (c.date === dateISO && c.stepId) done.add(`${c.ritualId}:${c.stepId}`);
    }
    return done;
  }, [ritualCompletions, dateISO]);

  const { groups, dropped } = useMemo(() => {
    const raw = groupRitualsByTime(
      rituals, dateISO,
      timelineStartMinutes, timelineEndMinutes,
      timelineTopPadding, hourHeight,
      trackingStart,
    );
    // Cap to DAY_LIMIT total occurrences across all groups (already filtered to dateISO)
    const total = raw.reduce((sum, g) => sum + g.occurrences.length, 0);
    let remaining = DAY_LIMIT;
    const capped = raw
      .map((g) => {
        const take = Math.min(g.occurrences.length, remaining);
        remaining -= take;
        return { ...g, occurrences: g.occurrences.slice(0, take) };
      })
      .filter((g) => g.occurrences.length > 0);
    return { groups: capped, dropped: Math.max(0, total - DAY_LIMIT) };
  }, [rituals, dateISO, timelineStartMinutes, timelineEndMinutes, timelineTopPadding, hourHeight, trackingStart]);

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
            {group.occurrences.map((occ) => {
              const key = occ.stepId ? `${occ.ritual.id}:${occ.stepId}` : occ.ritual.id;
              const completed = occ.stepId ? todaysStepDone.has(key) : completedIds.has(occ.ritual.id);
              return (
                <RitualStrip
                  key={key}
                  ritual={occ.ritual}
                  time={occ.time}
                  completed={completed}
                  onToggle={() =>
                    occ.stepId ? onToggleStep(occ.ritual.id, occ.stepId) : onToggleComplete(occ.ritual.id)
                  }
                />
              );
            })}
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
