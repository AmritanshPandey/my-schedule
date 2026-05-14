"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  IconPlus,
  IconLayoutGrid,
  IconFlame,
  IconTrendingUp,
  IconTrendingDown,
  IconStar,
  IconTarget,
} from "@tabler/icons-react";
import type { DayKey, Task } from "@/lib/useScheduleDB";
import { todayISO, localISODate } from "@/lib/dateUtils";
import {
  calculateCurrentWeekStats,
  buildPlanCompletionDates,
  calculateStreak,
  getMondayOfWeek,
} from "@/lib/consistency/calculateDailyStats";
import { calculateWeeklyHistory } from "@/lib/consistency/calculateWeeklyStats";
import { calculateInsights } from "@/lib/consistency/calculateInsights";
import type { InsightIcon } from "@/lib/consistency/calculateInsights";
import WeeklyConsistencyChart from "./WeeklyConsistencyChart";

// ── Helpers ───────────────────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-neutral-300 dark:bg-neutral-600";
}

function pctTextColor(pct: number): string {
  if (pct >= 80) return "text-emerald-500";
  if (pct >= 40) return "text-amber-500";
  return "text-neutral-400 dark:text-neutral-500";
}

const INSIGHT_ICONS: Record<InsightIcon, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  fire: IconFlame,
  "trend-up": IconTrendingUp,
  "trend-down": IconTrendingDown,
  star: IconStar,
  target: IconTarget,
  calendar: IconLayoutGrid,
};

const INSIGHT_ICON_COLOR: Record<InsightIcon, string> = {
  fire: "text-amber-500",
  "trend-up": "text-emerald-500",
  "trend-down": "text-rose-400",
  star: "text-amber-500",
  target: "text-emerald-500",
  calendar: "text-blue-400",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ConsistencyOverviewProps {
  planId: string;
  activities: Record<DayKey, Task[]>;
  planStartDate?: string;
  onAddTask: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ConsistencyOverview({
  planId,
  activities,
  planStartDate,
  onAddTask,
}: ConsistencyOverviewProps) {
  const today = useMemo(() => todayISO(), []);

  const hasTasks = useMemo(
    () => Object.values(activities).some((tasks) => tasks.some((t) => t.planId === planId)),
    [activities, planId],
  );

  const dayStats = useMemo(
    () => calculateCurrentWeekStats(planId, activities, today),
    [planId, activities, today],
  );

  const weekStats = useMemo(() => {
    const all = calculateWeeklyHistory(planId, activities, today, 8);
    if (!planStartDate) return all;
    // Only keep weeks whose Monday falls on or after the plan-start week
    const planMondayISO = localISODate(getMondayOfWeek(new Date(planStartDate + "T00:00:00")));
    return all.filter((w) => w.weekStart >= planMondayISO);
  }, [planId, activities, today, planStartDate]);

  const completionDates = useMemo(
    () => buildPlanCompletionDates(planId, activities),
    [planId, activities],
  );

  const streak = useMemo(
    () => calculateStreak(completionDates, today),
    [completionDates, today],
  );

  const insights = useMemo(
    () => calculateInsights(dayStats, weekStats, streak),
    [dayStats, weekStats, streak],
  );

  // completed / all scheduled this week
  const { thisWeekCompleted, thisWeekScheduled, thisWeekPct } = useMemo(() => {
    const pastAndToday = dayStats.filter((d) => !d.isFuture);
    const completed = pastAndToday.reduce((s, d) => s + d.completed, 0);
    const scheduled = dayStats.reduce((s, d) => s + d.scheduled, 0);
    const pct = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
    return { thisWeekCompleted: completed, thisWeekScheduled: scheduled, thisWeekPct: pct };
  }, [dayStats]);

  const showHistory = weekStats.length > 1;

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!hasTasks) {
    return (
      <div className="rounded-[24px] border border-dashed border-neutral-200 dark:border-white/[0.08] py-10 px-6 text-center">
        <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-white/[0.06] flex items-center justify-center mx-auto mb-3">
          <IconLayoutGrid size={18} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
        </div>
        <p className="text-[14px] font-semibold text-neutral-900 dark:text-white mb-1">
          No linked tasks yet
        </p>
        <p className="text-[13px] text-neutral-400 dark:text-neutral-500 max-w-[200px] mx-auto leading-relaxed mb-4">
          Link activities to this plan to start tracking consistency.
        </p>
        <button
          type="button"
          onClick={onAddTask}
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.04] transition-colors"
        >
          <IconPlus size={15} strokeWidth={2.5} />
          Add Activity
        </button>
      </div>
    );
  }

  // ── Full card ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Main card */}
      <div className="rounded-[24px] border border-neutral-200 bg-white overflow-hidden dark:border-white/[0.08] dark:bg-neutral-900">

        {/* ── Section 1: Header ──────────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-4">

          {/* Eyebrow + streak */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              This Week
            </p>
            {streak > 0 && (
              <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-600 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-400">
                <IconFlame size={11} strokeWidth={2.5} />
                {streak}d streak
              </div>
            )}
          </div>

          {/* Big % + label */}
          <div className="flex items-baseline gap-2 mb-3">
            <motion.span
              className="text-[40px] font-black leading-none tabular-nums text-neutral-950 dark:text-white"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              {thisWeekPct}%
            </motion.span>
            <span className="text-[13px] font-medium text-neutral-400 dark:text-neutral-500">
              consistency
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full bg-neutral-100 dark:bg-white/[0.07] overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${barColor(thisWeekPct)}`}
              initial={{ width: "0%" }}
              animate={{ width: `${thisWeekPct}%` }}
              transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
            />
          </div>

          {/* 2-col metric tiles */}
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-neutral-400 dark:text-neutral-500 mb-0.5">
                Completed
              </p>
              <p className="text-[15px] font-bold text-neutral-950 dark:text-white tabular-nums leading-snug">
                {thisWeekCompleted}
                <span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">
                  /{thisWeekScheduled}
                </span>
              </p>
            </div>
            <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] px-3.5 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-neutral-400 dark:text-neutral-500 mb-0.5">
                Streak
              </p>
              <p className="text-[15px] font-bold text-neutral-950 dark:text-white tabular-nums leading-snug">
                {streak}
                <span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">
                  {" "}days
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* ── Section 2: Daily breakdown ─────────────────────────────────── */}
        <div className="border-t border-neutral-100 dark:border-white/[0.06] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500 mb-3.5">
            Daily Breakdown
          </p>
          <WeeklyConsistencyChart dayStats={dayStats} />
        </div>

        {/* ── Section 3: Past weeks (inside card) ───────────────────────── */}
        {showHistory && (
          <div className="border-t border-neutral-100 dark:border-white/[0.06] px-5 pb-5 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500 mb-3">
              Past Weeks
            </p>
            <div className="flex gap-4 overflow-x-auto scrollbar-none -mx-1 px-1 pb-0.5">
              {weekStats.map((week, i) => {
                const trendUp = week.trendVsPrev !== null && week.trendVsPrev > 0;
                const trendDown = week.trendVsPrev !== null && week.trendVsPrev < -2;
                const isCurrentWeek = i === weekStats.length - 1;

                return (
                  <motion.div
                    key={week.weekStart}
                    className="flex-none w-[62px]"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut", delay: i * 0.04 }}
                  >
                    <p className={`text-[10px] font-semibold mb-1 leading-none ${
                      isCurrentWeek
                        ? "text-neutral-700 dark:text-neutral-300"
                        : "text-neutral-400 dark:text-neutral-500"
                    }`}>
                      {week.label}
                    </p>
                    <p className={`text-[18px] font-black tabular-nums leading-none ${
                      week.scheduled > 0 ? pctTextColor(week.pct) : "text-neutral-300 dark:text-neutral-700"
                    }`}>
                      {week.scheduled > 0 ? `${week.pct}%` : "—"}
                    </p>
                    <div className="mt-2 h-1 rounded-full bg-neutral-100 dark:bg-white/[0.07] overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${barColor(week.pct)}`}
                        initial={{ width: "0%" }}
                        animate={{ width: week.scheduled > 0 ? `${week.pct}%` : "0%" }}
                        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 + i * 0.04 }}
                      />
                    </div>
                    {week.trendVsPrev !== null && (
                      <div className={`mt-1 flex items-center gap-0.5 text-[9px] font-bold ${
                        trendUp ? "text-emerald-500" : trendDown ? "text-rose-400" : "text-neutral-300 dark:text-neutral-700"
                      }`}>
                        {trendUp ? (
                          <IconTrendingUp size={8} strokeWidth={2.5} />
                        ) : trendDown ? (
                          <IconTrendingDown size={8} strokeWidth={2.5} />
                        ) : null}
                        {trendUp
                          ? `+${week.trendVsPrev}%`
                          : trendDown
                          ? `${week.trendVsPrev}%`
                          : "—"}
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Insight chips — below the card, inline style */}
      {insights.length > 0 && (
        <motion.div
          className="flex flex-wrap gap-2"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut", delay: 0.15 }}
        >
          {insights.map((insight) => {
            const Icon = INSIGHT_ICONS[insight.icon];
            return (
              <div
                key={insight.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 dark:border-white/[0.08] dark:bg-neutral-900"
              >
                <Icon
                  size={12}
                  strokeWidth={2.5}
                  className={`shrink-0 ${INSIGHT_ICON_COLOR[insight.icon]}`}
                />
                <span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-300">
                  {insight.label}
                </span>
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
