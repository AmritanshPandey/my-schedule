"use client";

import { memo } from "react";
import type { Task } from "@/lib/useScheduleDB";
import { useNowMinutes } from "@/lib/timeline/useNowMinutes";
import { mapMinutesToTimeline } from "@/lib/timeline/displayWindow";
import { taskLaneStyle } from "@/lib/timeline/taskLaneStyle";

export interface HighlightLayout {
  task: Task;
  color: string;
  start: number; // timeline-minute space (overnight already +1440)
  end: number;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
}

interface CurrentTaskHighlightLayerProps {
  layouts: HighlightLayout[];
  activeDay: string;
  todayKey: string;
  timelineStartMinutes: number;
  timelineEndMinutes: number;
}

/**
 * Green "now" ring hugging the block you should be executing right now.
 *
 * Green is sanctioned here — the current task IS the progress signal. Owns its
 * own 30s tick (leaf layer, per useNowMinutes guidance) so the parent timeline
 * never re-renders for time. The ring slides (top/height transition) when the
 * current task changes; reduced motion zeroes the transition globally.
 * data-glass: the ring shadow is chrome-led depth, exempted from the e2e
 * banned-effects guard.
 */
function CurrentTaskHighlightLayerInner({
  layouts,
  activeDay,
  todayKey,
  timelineStartMinutes,
  timelineEndMinutes,
}: CurrentTaskHighlightLayerProps) {
  const nowMinutes = mapMinutesToTimeline(
    useNowMinutes(),
    timelineStartMinutes,
    timelineEndMinutes,
  );

  if (activeDay !== todayKey) return null;

  const current = layouts.find(
    (l) =>
      nowMinutes >= l.start &&
      nowMinutes < l.end &&
      !l.task.completed &&
      !l.task.missed,
  );
  if (!current) return null;

  const lane = taskLaneStyle(current);

  return (
    <div
      aria-hidden="true"
      data-glass
      className="pointer-events-none absolute z-20 rounded-[10px] transition-[top,height,left,width] duration-300 shadow-[0_0_0_1.5px_rgba(0,166,62,0.55),0_8px_24px_-12px_rgba(0,166,62,0.35)] dark:shadow-[0_0_0_1.5px_rgba(47,212,110,0.5),0_8px_24px_-12px_rgba(47,212,110,0.4)]"
      style={{
        top: lane.top - 2,
        height: lane.height + 4,
        left: `calc(${lane.left} - 2px)`,
        width: `calc(${lane.width} + 4px)`,
        transitionTimingFunction: "var(--ease-out-quint)",
      }}
    />
  );
}

export const CurrentTaskHighlightLayer = memo(CurrentTaskHighlightLayerInner);
