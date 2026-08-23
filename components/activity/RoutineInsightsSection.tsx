"use client";

/**
 * A few compact lines, not a dashboard — every fact here is either directly
 * from `buildRoutineInsights` or omitted. No fabricated copy when a field is
 * null; the section itself renders nothing until there's at least one line
 * worth saying.
 */
import { IconTrendingUp, IconTrendingDown, IconFlame, IconAlertTriangle } from "@tabler/icons-react";
import type { RoutineInsights } from "@/lib/consistency/routineInsights";
import { CARD } from "@/components/ui/surfaces";

interface RoutineInsightsSectionProps {
  insights: RoutineInsights;
}

export default function RoutineInsightsSection({ insights }: RoutineInsightsSectionProps) {
  const { overallPct, deltaVsLastWeek, mostConsistent, needsAttention } = insights;
  const hasAnything = overallPct !== null || mostConsistent !== null || needsAttention !== null;
  if (!hasAnything) return null;

  return (
    <div className={`space-y-2.5 p-4 ${CARD}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
        Insights
      </p>

      {overallPct !== null && (
        <div className="flex items-center gap-2 text-[13px] leading-snug text-neutral-700 dark:text-neutral-200">
          <span className="font-bold tabular-nums text-neutral-950 dark:text-white">{overallPct}%</span>
          <span>of scheduled routines done this week</span>
          {deltaVsLastWeek !== null && deltaVsLastWeek !== 0 && (
            <span
              className={`inline-flex items-center gap-0.5 text-[12px] font-bold tabular-nums ${
                deltaVsLastWeek > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"
              }`}
            >
              {deltaVsLastWeek > 0 ? <IconTrendingUp size={13} strokeWidth={2.4} /> : <IconTrendingDown size={13} strokeWidth={2.4} />}
              {Math.abs(deltaVsLastWeek)}pt
            </span>
          )}
        </div>
      )}

      {mostConsistent && (
        <p className="flex items-center gap-1.5 text-[13px] leading-snug text-neutral-700 dark:text-neutral-200">
          <IconFlame size={14} strokeWidth={2.2} className="shrink-0 text-emerald-500" />
          <span>
            <span className="font-bold text-neutral-950 dark:text-white">{mostConsistent.ritual.title}</span> is your most
            consistent — {mostConsistent.streak}-day streak
          </span>
        </p>
      )}

      {needsAttention && (
        <p className="flex items-center gap-1.5 text-[13px] leading-snug text-neutral-700 dark:text-neutral-200">
          <IconAlertTriangle size={14} strokeWidth={2.2} className="shrink-0 text-amber-500" />
          <span>
            <span className="font-bold text-neutral-950 dark:text-white">{needsAttention.ritual.title}</span> needs
            attention — {needsAttention.adherencePct}% over the last 30 days
          </span>
        </p>
      )}
    </div>
  );
}
