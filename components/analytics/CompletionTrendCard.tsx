"use client";

import { useMemo } from "react";
import { IconTrendingUp, IconTrendingDown, IconMinus, IconChartBar, IconX } from "@tabler/icons-react";
import type { Schedule } from "@/lib/useScheduleDB";
import { computeExecutionTrend, trendNarrative } from "@/lib/executionAnalytics";
import { CARD } from "@/components/ui/surfaces";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

function valueColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  if (pct > 0) return "text-rose-600 dark:text-rose-400";
  return "text-neutral-900 dark:text-white";
}

const PLOT_H = 76;

/**
 * "Task completion trend" — the premium combo read.
 *
 * Bars are how *many* scheduled tasks got done each week; the line is the
 * completion *rate* that puts those counts in proportion. Two questions, one
 * chart: raw output and follow-through. Green is legitimate here — this is the
 * app's one progress signal — so the line and the live week wear it while past
 * weeks recede to neutral.
 *
 * Hand-rolled: CSS-flex bars (exact, animate without framer so it renders on the
 * iOS Dashboard tab), an SVG polyline for the rate with a non-scaling stroke,
 * and HTML dots that stay perfectly round under the stretched viewBox.
 */
export default function CompletionTrendCard({ schedule }: { schedule: Schedule }) {
  const trend = useMemo(() => computeExecutionTrend(schedule), [schedule]);
  const { weeks, current, deltaPct, averagePct, bestPct, currentMissed } = trend;
  const narrative = useMemo(() => trendNarrative(trend), [trend]);

  const n = weeks.length;
  const maxCompleted = Math.max(1, ...weeks.map((w) => w.completed));

  // x is the column centre as a 0–100 fraction; y is inverted pct. The line SVG
  // uses a 0 0 100 100 viewBox with a non-scaling stroke, so these map straight
  // across the plot without distorting the stroke width.
  const linePoints = useMemo(
    () =>
      weeks
        .map((w, i) => `${((i + 0.5) / n) * 100},${(1 - w.pct / 100) * 100}`)
        .join(" "),
    [weeks, n],
  );

  const comparison =
    deltaPct > 0
      ? { Icon: IconTrendingUp, text: `${deltaPct}% better than last week`, cls: "text-emerald-600 dark:text-emerald-400" }
      : deltaPct < 0
      ? { Icon: IconTrendingDown, text: `${Math.abs(deltaPct)}% lower than last week`, cls: "text-rose-500 dark:text-rose-400" }
      : { Icon: IconMinus, text: "Same as last week", cls: "text-neutral-400 dark:text-neutral-500" };

  return (
    <div data-testid="completion-trend-card" className={`${CARD} px-5 py-4`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconChartBar size={14} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
          <p className="truncate text-[13px] font-bold text-neutral-800 dark:text-neutral-200">Task completion trend</p>
        </div>
        {/* Legend — bar = count, line = rate */}
        <div className="flex shrink-0 items-center gap-3 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1">
            <span aria-hidden className="h-2.5 w-2 rounded-[2px] bg-emerald-500" />
            Done
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            Rate
          </span>
        </div>
      </div>

      {/* Headline: big number + plain sentence */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-1">
            <span className={`text-[40px] font-bold leading-none tabular-nums ${valueColor(current.pct)}`}>
              <AnimatedNumber value={current.pct} />
            </span>
            <span className={`text-[20px] font-extrabold ${valueColor(current.pct)}`}>%</span>
          </div>
          <p className="mt-1.5 text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
            of this week&apos;s tasks done
          </p>
          <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
            {current.completed} of {current.scheduled} tasks
          </p>
          {currentMissed > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[12px] font-bold tabular-nums text-rose-600 dark:text-rose-400">
              <IconX size={13} strokeWidth={2.5} />
              {currentMissed} missed this week
            </p>
          )}
        </div>
        <span className={`flex items-center gap-1 text-right text-[12px] font-bold ${comparison.cls}`}>
          <comparison.Icon size={15} strokeWidth={2.5} />
          {comparison.text}
        </span>
      </div>

      {narrative && (
        <p className="mt-3 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{narrative}</p>
      )}

      {/* Combo chart — bars (completed count) + line (completion rate) */}
      <div className="relative mt-5" style={{ height: PLOT_H }}>
        {/* Bars */}
        <div className="absolute inset-0 flex items-end gap-1">
          {weeks.map((week, i) => {
            const h = Math.max(3, Math.round((week.completed / maxCompleted) * PLOT_H));
            return (
              <div
                key={week.monStr}
                className={`animate-bar-rise flex-1 rounded-t ${
                  week.isCurrentWeek
                    ? "bg-emerald-500"
                    : "bg-neutral-200 dark:bg-white/[0.10]"
                }`}
                style={{ height: h, animationDelay: `${i * 30}ms` }}
                title={`Week of ${week.label}: ${week.completed} done · ${week.pct}%`}
              />
            );
          })}
        </div>

        {/* Completion-rate line */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polyline
            points={linePoints}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-emerald-600 dark:stroke-emerald-400"
          />
        </svg>

        {/* Line dots — HTML so they stay round under the stretched viewBox */}
        {weeks.map((week, i) => (
          <span
            key={week.monStr}
            aria-hidden
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white dark:ring-neutral-900 ${
              week.isCurrentWeek ? "h-2 w-2 bg-emerald-600 dark:bg-emerald-400" : "h-1.5 w-1.5 bg-emerald-600 dark:bg-emerald-400"
            }`}
            style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${(1 - week.pct / 100) * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400 dark:text-neutral-500">
        <span>{n} weeks ago</span>
        <span>Avg {averagePct}% · Best {bestPct}%</span>
        <span className="font-semibold text-neutral-500 dark:text-neutral-400">This week</span>
      </div>
    </div>
  );
}
