"use client";

import { useMemo } from "react";
import { IconTrendingUp, IconTrendingDown, IconMinus, IconChartBar } from "@tabler/icons-react";
import type { Schedule } from "@/lib/useScheduleDB";
import { computeExecutionTrend, trendNarrative } from "@/lib/executionAnalytics";
import { CARD } from "@/components/ui/surfaces";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

function barColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 50) return "bg-amber-400";
  if (pct > 0) return "bg-rose-400";
  return "bg-neutral-200 dark:bg-white/[0.08]";
}

function valueColor(pct: number): string {
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 50) return "text-amber-600 dark:text-amber-400";
  if (pct > 0) return "text-rose-600 dark:text-rose-400";
  return "text-neutral-900 dark:text-white";
}

export default function ExecutionTrendCard({ schedule }: { schedule: Schedule }) {
  const trend = useMemo(() => computeExecutionTrend(schedule), [schedule]);
  const { weeks, current, deltaPct, averagePct, bestPct } = trend;
  const narrative = useMemo(() => trendNarrative(trend), [trend]);
  const maxPct = Math.max(...weeks.map((w) => w.pct), 10);

  // Plain-English comparison to last week.
  const comparison =
    deltaPct > 0
      ? { Icon: IconTrendingUp, text: `${deltaPct}% better than last week`, cls: "text-emerald-600 dark:text-emerald-400" }
      : deltaPct < 0
      ? { Icon: IconTrendingDown, text: `${Math.abs(deltaPct)}% lower than last week`, cls: "text-rose-500 dark:text-rose-400" }
      : { Icon: IconMinus, text: "Same as last week", cls: "text-neutral-400 dark:text-neutral-500" };

  return (
    <div className={`${CARD} px-5 py-4`}>
      <div className="flex items-center gap-2 mb-4">
        <IconChartBar size={14} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500 shrink-0" />
        <p className="text-[13px] font-bold text-neutral-800 dark:text-neutral-200 truncate">
          Weekly Progress
        </p>
      </div>

      {/* Headline: big number + plain sentence */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-baseline gap-1">
            <span className={`text-[40px] font-extrabold leading-none tabular-nums ${valueColor(current.pct)}`}>
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
        </div>
        <span className={`flex items-center gap-1 text-[12px] font-bold ${comparison.cls}`}>
          <comparison.Icon size={15} strokeWidth={2.5} />
          {comparison.text}
        </span>
      </div>

      {/* One-line momentum read */}
      {narrative && (
        <p className="mt-3 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
          {narrative}
        </p>
      )}

      {/* Supporting chart — last 8 weeks */}
      <div className="mt-5 flex items-end gap-1.5" style={{ height: 44 }}>
        {weeks.map((week, i) => {
          const h = Math.max(3, Math.round((week.pct / maxPct) * 44));
          return (
            <div
              key={week.monStr}
              className={`animate-bar-rise flex-1 rounded-t transition-[height,opacity] duration-300 ${barColor(week.pct)} ${
                week.isCurrentWeek ? "opacity-100" : "opacity-50"
              }`}
              style={{ height: h, animationDelay: `${i * 30}ms` }}
              title={`Week of ${week.label}: ${week.pct}%`}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-neutral-400 dark:text-neutral-500">
        <span>8 weeks ago</span>
        <span>Avg {averagePct}% · Best {bestPct}%</span>
        <span className="font-semibold text-neutral-500 dark:text-neutral-400">This week</span>
      </div>
    </div>
  );
}
