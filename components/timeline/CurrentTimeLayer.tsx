"use client";

import { memo, useEffect, useState } from "react";

interface CurrentTimeLayerProps {
  activeDay: string;
  todayKey: string;
  timelineStartMinutes: number;
  timelineEndMinutes: number;
  timelineTopPadding: number;
  hourHeight: number;
}

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Renders the red "now" indicator line on the timeline.
 * Owns its own 30-second interval so the parent never re-renders for time ticks.
 */
function CurrentTimeLayerInner({
  activeDay,
  todayKey,
  timelineStartMinutes,
  timelineEndMinutes,
  timelineTopPadding,
  hourHeight,
}: CurrentTimeLayerProps) {
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);

  useEffect(() => {
    const id = window.setInterval(() => setNowMinutes(getCurrentMinutes()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const visible =
    activeDay === todayKey &&
    nowMinutes >= timelineStartMinutes &&
    nowMinutes <= timelineEndMinutes;

  if (!visible) return null;

  const top = timelineTopPadding + ((nowMinutes - timelineStartMinutes) / 60) * hourHeight;

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
      style={{ top }}
    >
      <div className="relative shrink-0 flex h-3 w-3 items-center justify-center -ml-[5px]">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" />
        <span className="relative h-2 w-2 rounded-full bg-red-500" />
      </div>
      <div className="h-[1.5px] flex-1 bg-gradient-to-r from-red-500 via-red-500/60 to-transparent" />
    </div>
  );
}

export const CurrentTimeLayer = memo(CurrentTimeLayerInner);
