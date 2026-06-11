"use client";

import { memo } from "react";
import type { Task } from "@/lib/useScheduleDB";
import { accentStyles } from "@/lib/colorSystem";
import { resolveTaskState } from "@/lib/taskCompletion";
import { taskLaneStyle } from "@/lib/timeline/taskLaneStyle";
import { useNowMinutes } from "@/lib/timeline/useNowMinutes";
import { toScheduleDayMinutes } from "@/lib/timeUtils";

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
 * Draws a color-matched glow ring around whatever task is happening right now
 * (start ≤ now < end) so it pops out of the stack. Completed tasks are skipped
 * — a finished block isn't "happening".
 *
 * Isolated memo'd leaf with its own tick. The `layouts` prop is the stable
 * memoized array from ScheduleApp (changes only when the day's tasks change),
 * so passing it here doesn't cause extra renders — only this leaf re-evaluates
 * on each tick, never the task cards.
 */
function CurrentTaskHighlightLayerInner({
  layouts,
  activeDay,
  todayKey,
  timelineStartMinutes,
  timelineEndMinutes,
}: CurrentTaskHighlightLayerProps) {
  const nowMinutes = toScheduleDayMinutes(useNowMinutes(), timelineStartMinutes);

  if (activeDay !== todayKey || nowMinutes < timelineStartMinutes || nowMinutes > timelineEndMinutes) {
    return null;
  }

  const current = layouts.filter((l) => {
    if (nowMinutes < l.start || nowMinutes >= l.end) return false;
    // Resolved (completed or missed) blocks aren't "happening" — no glow.
    const st = resolveTaskState(l.task, l.task.subtasks?.length ?? 0);
    return st !== "completed" && st !== "missed";
  });

  if (current.length === 0) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      {current.map((l) => (
        // Mirror the task-block wrapper (px-0.5 py-[2px]) so the ring hugs the card exactly.
        <div key={l.task.id} className="absolute px-0.5 py-[2px]" style={taskLaneStyle(l)}>
          <div className={`h-full w-full rounded-[8px] ${accentStyles(l.color).glowRing}`} />
        </div>
      ))}
    </div>
  );
}

export const CurrentTaskHighlightLayer = memo(CurrentTaskHighlightLayerInner);
