"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { IconPlus } from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";
import { accentStyles } from "@/lib/colorSystem";
import type { Plan, ProgressTracker, MetricEntry } from "@/lib/useScheduleDB";

interface TrackerQuickBarProps {
  trackers: ProgressTracker[];
  plans: Plan[];
  metricEntries: MetricEntry[];
  onLog: (tracker: ProgressTracker) => void;
  onNavigate: (planId: string) => void;
}

export default function TrackerQuickBar({
  trackers,
  plans,
  metricEntries,
  onLog,
  onNavigate,
}: TrackerQuickBarProps) {
  // Build a map: trackerId → last entry (entries sorted newest-first)
  const lastEntryByTracker = useMemo(() => {
    const sorted = [...metricEntries].sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, MetricEntry>();
    for (const entry of sorted) {
      if (!map.has(entry.trackerId)) map.set(entry.trackerId, entry);
    }
    return map;
  }, [metricEntries]);

  // Build a map: planId → Plan for quick lookup
  const plansById = useMemo(
    () => new Map(plans.map((p) => [p.id, p])),
    [plans]
  );

  if (trackers.length === 0) return null;

  return (
    <div className="mb-3">
      {/* Section label */}
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
        Trackers
      </p>

      {/* Horizontal scroll row */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {trackers.map((tracker) => {
          const plan = plansById.get(tracker.planId);
          const dotClass = plan
            ? accentStyles(plan.color).dot
            : "bg-neutral-400 dark:bg-neutral-500";
          const lastEntry = lastEntryByTracker.get(tracker.id);
          const lastValueDisplay = lastEntry
            ? `${lastEntry.value}${tracker.unit ? ` ${tracker.unit}` : ""}`
            : "—";

          return (
            <div
              key={tracker.id}
              className="
                flex shrink-0 items-center gap-2
                rounded-2xl border border-neutral-200 bg-white
                px-3 py-2.5
                dark:border-white/[0.08] dark:bg-neutral-900
              "
            >
              {/* Clickable body → navigate to plan */}
              <button
                type="button"
                onClick={() => { haptic("light"); onNavigate(tracker.planId); }}
                className="flex items-center gap-2 min-w-0"
                aria-label={`Go to tracker ${tracker.title}`}
              >
                {/* Colored dot */}
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />

                {/* Text */}
                <div className="min-w-0 text-left">
                  <p className="max-w-[100px] truncate text-[12px] font-semibold text-neutral-800 dark:text-neutral-200 leading-tight">
                    {tracker.title}
                  </p>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500 leading-tight tabular-nums">
                    {lastValueDisplay}
                  </p>
                </div>
              </button>

              {/* Log [+] button */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => { haptic("medium"); onLog(tracker); }}
                aria-label={`Log entry for ${tracker.title}`}
                className="
                  ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center
                  rounded-full bg-neutral-100 text-neutral-500
                  transition-colors active:bg-neutral-200
                  dark:bg-white/[0.07] dark:text-neutral-400 dark:active:bg-white/[0.12]
                "
              >
                <IconPlus size={14} strokeWidth={2.5} />
              </motion.button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
