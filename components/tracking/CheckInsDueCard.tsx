"use client";

/**
 * "Check-ins due" — the trackers waiting on this period's entry, on the page
 * you land on. A weekly weigh-in that nobody prompts for quietly stops
 * happening; this is the prompt. Renders nothing when every tracker is
 * checked in, so it never sits there as an empty chore list.
 */
import { useMemo } from "react";
import { IconArrowRight, IconCalendarCheck, IconPlus } from "@tabler/icons-react";
import type { MetricEntry, ProgressTracker } from "@/lib/useScheduleDB";
import { checkInStatusLabel, dueCheckIns } from "@/lib/trackerCadence";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";

/** Beyond this many, the card points to Tracking rather than growing. */
const MAX_ROWS = 4;

interface CheckInsDueCardProps {
  trackers: readonly ProgressTracker[];
  metricEntries: readonly MetricEntry[];
  todayISO: string;
  trackingStart?: string;
  onLog: (tracker: ProgressTracker) => void;
  /** Opens the Tracking page. */
  onOpenTracking?: () => void;
}

export default function CheckInsDueCard({
  trackers,
  metricEntries,
  todayISO,
  trackingStart,
  onLog,
  onOpenTracking,
}: CheckInsDueCardProps) {
  const due = useMemo(
    () => dueCheckIns(trackers, metricEntries, todayISO, trackingStart),
    [trackers, metricEntries, todayISO, trackingStart],
  );
  if (due.length === 0) return null;

  const shown = due.slice(0, MAX_ROWS);
  const more = due.length - shown.length;

  return (
    <section data-testid="checkins-due-card" aria-labelledby="checkins-due-title" className={`${CARD} px-4 py-4`}>
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconCalendarCheck size={15} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />
          <h2 id="checkins-due-title" className="truncate text-[13px] font-bold text-neutral-800 dark:text-neutral-200">
            Check-ins due
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-bold tabular-nums text-neutral-500 dark:border-white/[0.09] dark:bg-white/[0.04] dark:text-neutral-400">
          {due.length}
        </span>
      </div>
      <ul className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
        {shown.map(({ tracker, state }) => (
          <li key={tracker.id} className="flex items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-tight text-neutral-950 dark:text-white">{tracker.title}</p>
              <p className={`mt-0.5 truncate text-[12px] font-bold ${state.overdue ? "text-rose-700 dark:text-rose-400" : "text-amber-800 dark:text-amber-300"}`}>
                {checkInStatusLabel(state)}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Log ${tracker.title}`}
              onClick={() => { haptic("light"); onLog(tracker); }}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-neutral-950 px-4 text-[13px] font-extrabold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
            >
              <IconPlus size={14} strokeWidth={2.6} aria-hidden="true" />
              Log
            </button>
          </li>
        ))}
      </ul>
      {onOpenTracking && (
        <button
          type="button"
          onClick={() => { haptic("light"); onOpenTracking(); }}
          className="mt-1 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
        >
          {more > 0 ? `${more} more in Tracking` : "Open Tracking"}
          <IconArrowRight size={14} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
