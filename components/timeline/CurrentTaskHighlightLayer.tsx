"use client";

import { memo } from "react";
import type { Task } from "@/lib/useScheduleDB";
import { useNowMinutes } from "@/lib/timeline/useNowMinutes";
import { mapMinutesToTimeline } from "@/lib/timeline/displayWindow";
import { taskLaneStyle } from "@/lib/timeline/taskLaneStyle";

export interface HighlightLayout {
  task: Task;
  /** Null for held time and uncategorised tasks, which have no accent. */
  color: string | null;
  start: number; // timeline-minute space (overnight already +1440)
  end: number;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
  /** Set for one phase of a multi-slot task, so the ring can respect per-slot completion. */
  slotIndex?: number;
  isMultiSlot?: boolean;
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

  // A multi-slot task's `completed` flag only flips once EVERY phase is done, so
  // the ring has to read this phase's own state — otherwise a finished 9am block
  // keeps glowing as "do this now" while you're inside it.
  const isBlockDone = (l: HighlightLayout) =>
    l.isMultiSlot && l.slotIndex !== undefined
      ? (l.task.completedSlotIndices ?? []).includes(l.slotIndex)
      : !!l.task.completed;

  const current = layouts.find(
    (l) =>
      nowMinutes >= l.start &&
      nowMinutes < l.end &&
      !isBlockDone(l) &&
      !l.task.missed,
  );
  if (!current) return null;

  const lane = taskLaneStyle(current);

  return (
    <div
      aria-hidden="true"
      data-glass
      className="pointer-events-none absolute z-20 rounded-[10px] transition-[top,height,left,width] duration-300 shadow-now"
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
