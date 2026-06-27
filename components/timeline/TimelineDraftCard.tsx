"use client";

import type { CSSProperties } from "react";
import { Pill } from "@/components/ui/Badge";

interface TimelineDraftCardProps {
  startLabel: string;
  endLabel: string;
  durationLabel: string | null;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function TimelineDraftCard({
  startLabel,
  endLabel,
  durationLabel,
  compact = false,
  className = "",
  style,
}: TimelineDraftCardProps) {
  return (
    <div
      className={`pointer-events-none relative flex h-full w-full overflow-hidden rounded-[8px] border border-neutral-200/80 bg-white/95 dark:border-white/[0.08] dark:bg-neutral-900/90 ${className}`}
      style={style}
    >
      <div className="absolute inset-y-0 left-0 w-[3px] bg-emerald-500/75 dark:bg-emerald-400/75" />

      <div className={`relative z-10 flex h-full w-full flex-col justify-between ${compact ? "gap-0.5 p-1.5" : "gap-1 p-2"}`}>
        <span className={`whitespace-nowrap font-extrabold tabular-nums leading-none text-neutral-500 dark:text-neutral-400 ${compact ? "text-[10px]" : "text-[11px]"}`}>
          {startLabel} → {endLabel}
        </span>
        {durationLabel && (
          <Pill className={`w-fit ${compact ? "px-1.5 py-0 text-[9px] leading-[14px]" : "px-2 py-0.5 text-[10px] leading-[15px]"}`}>
            {durationLabel}
          </Pill>
        )}
      </div>
    </div>
  );
}
