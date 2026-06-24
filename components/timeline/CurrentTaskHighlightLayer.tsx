import type { Task } from "@/lib/useScheduleDB";

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
 * Current-task glow intentionally disabled.
 */
function CurrentTaskHighlightLayer(_props: CurrentTaskHighlightLayerProps) {
  return null;
}

export { CurrentTaskHighlightLayer };
