"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import RitualStrip from "./RitualStrip";
import { groupRitualsByTime } from "@/lib/timeline/groupRitualsByTime";
import type { Ritual, DayKey } from "@/lib/useScheduleDB";

const MAX_VISIBLE = 3;

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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groups = useMemo(
    () => groupRitualsByTime(
      rituals, activeDay,
      timelineStartMinutes, timelineEndMinutes,
      timelineTopPadding, hourHeight,
    ),
    [rituals, activeDay, timelineStartMinutes, timelineEndMinutes, timelineTopPadding, hourHeight]
  );

  if (groups.length === 0) return null;

  function toggleExpand(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-[22]">
      {groups.map((group) => {
        const expanded = expandedGroups.has(group.key);
        const visible = expanded ? group.rituals : group.rituals.slice(0, MAX_VISIBLE);
        const overflow = group.rituals.length - MAX_VISIBLE;

        return (
          <div
            key={group.key}
            className="absolute left-1 right-1"
            style={{ top: group.top - 13 }}
          >
            <div className="flex items-center gap-1 flex-wrap">
              {visible.map((ritual) => (
                <RitualStrip
                  key={ritual.id}
                  ritual={ritual}
                  completed={completedIds.has(ritual.id)}
                  onToggle={() => onToggleComplete(ritual.id)}
                />
              ))}

              {/* Overflow pill */}
              <AnimatePresence>
                {!expanded && overflow > 0 && (
                  <motion.button
                    key="overflow"
                    type="button"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.14 }}
                    onClick={() => toggleExpand(group.key)}
                    className="
                      pointer-events-auto inline-flex items-center
                      h-[24px] rounded-full px-2.5
                      bg-white/80 backdrop-blur-sm
                      border border-neutral-200/60
                      shadow-[0_1px_4px_0_rgba(0,0,0,0.06)]
                      dark:bg-neutral-900/75 dark:border-white/[0.09] dark:shadow-none
                      text-[10px] font-bold text-neutral-500 dark:text-neutral-400
                      select-none
                    "
                  >
                    +{overflow}
                  </motion.button>
                )}
                {expanded && (
                  <motion.button
                    key="collapse"
                    type="button"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.14 }}
                    onClick={() => toggleExpand(group.key)}
                    className="
                      pointer-events-auto inline-flex items-center
                      h-[24px] rounded-full px-2.5
                      bg-neutral-100/80 backdrop-blur-sm
                      border border-neutral-200/60
                      dark:bg-white/[0.06] dark:border-white/[0.09]
                      text-[10px] font-bold text-neutral-500 dark:text-neutral-400
                      select-none
                    "
                  >
                    less
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
}
