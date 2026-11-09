"use client";

import { IconArrowRight, IconChartLine, IconPlus } from "@tabler/icons-react";
import type { ProgressTracker } from "@/lib/useScheduleDB";
import type { ActiveTrackingRow } from "@/lib/overview";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Sparkline from "@/components/ui/Sparkline";
import TrendChange from "@/components/ui/TrendChange";

/** "1.5" not "1.50", "500" not "500.0". */
function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Every tracker at a glance: where it is, which way it's moving, and one tap
 * to log. A tracker waiting on this period's check-in carries a "Due" badge
 * and sits first — the Check-ins due card, folded into the list it belongs to.
 */
export default function ActiveTrackingCard({
  rows,
  limit,
  onLogTracker,
  onOpenTracking,
  onSetUp,
}: {
  rows: ActiveTrackingRow[];
  /** Show at most this many (the phone); the rest are a tap away. */
  limit?: number;
  onLogTracker: (tracker: ProgressTracker) => void;
  onOpenTracking: () => void;
  /** Where "Set up tracking" goes when there are no trackers yet. */
  onSetUp: () => void;
}) {
  const shown = limit !== undefined ? rows.slice(0, limit) : rows;
  const hidden = rows.length - shown.length;

  return (
    <section data-testid="overview-tracking-card" className={`${CARD} px-4 pb-2 pt-4`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold text-neutral-950 dark:text-white">Active tracking</h2>
        {hidden > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { haptic("light"); onOpenTracking(); }} className="-my-2">
            See all {rows.length}
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-5 text-center">
          <IconChartLine size={22} strokeWidth={2} className="mx-auto text-neutral-400" aria-hidden />
          <p className="mt-2 text-[13px] text-neutral-500 dark:text-neutral-400">Track a metric on any plan to see it move here.</p>
          <Button
            variant="secondary"
            size="md"
            onClick={() => { haptic("light"); onSetUp(); }}
            trailingIcon={<IconArrowRight size={16} strokeWidth={2.5} />}
            className="mt-3"
          >
            Set up tracking
          </Button>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-100 dark:divide-white/[0.06]">
          {shown.map(({ stat, checkIn }) => {
            const { tracker, latestValue, trend, series } = stat;
            const unit = tracker.unit?.trim() ?? "";
            const lineTone =
              trend?.state === "positive"
                ? "text-emerald-500 dark:text-emerald-400"
                : trend?.state === "negative"
                ? "text-rose-500 dark:text-rose-400"
                : "text-neutral-400 dark:text-neutral-500";
            return (
              <li key={tracker.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-neutral-950 dark:text-white">{tracker.title}</span>
                    {checkIn.due && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          checkIn.overdue
                            ? "bg-rose-500/10 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300"
                            : "bg-amber-500/12 text-amber-800 dark:bg-amber-400/12 dark:text-amber-300"
                        }`}
                      >
                        Due
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
                      {latestValue !== null ? `${fmt(latestValue)}${unit ? ` ${unit}` : ""}` : "Nothing logged yet"}
                    </span>
                    {trend && <TrendChange direction={trend.direction} state={trend.state} pct={trend.pct} />}
                  </span>
                </span>
                <Sparkline values={series} className={lineTone} />
                <IconButton
                  label={`Log ${tracker.title}`}
                  variant="primary"
                  size="md"
                  onClick={() => { haptic("light"); onLogTracker(tracker); }}
                >
                  <IconPlus size={18} strokeWidth={2.5} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
