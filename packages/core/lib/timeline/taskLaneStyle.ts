/**
 * Pure lane geometry for a timeline task block. Shared by ScheduleApp (the
 * task cards) and CurrentTaskHighlightLayer (the "now" ring) so the two can
 * never drift apart.
 */
export interface LaneGeometry {
  top: number;
  height: number;
  lane: number;
  laneCount: number;
}

export function taskLaneStyle(layout: LaneGeometry): {
  top: number;
  height: number;
  left: string;
  width: string;
} {
  const gap = layout.laneCount > 1 ? 3 : 0;
  const width = 100 / layout.laneCount;
  return {
    top: layout.top,
    height: layout.height,
    left: `calc(${layout.lane * width}% + ${layout.lane > 0 ? gap / 2 : 0}px)`,
    width: `calc(${width}% - ${layout.laneCount > 1 ? gap : 0}px)`,
  };
}
