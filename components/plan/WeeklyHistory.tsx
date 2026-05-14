"use client";

import { motion } from "framer-motion";
import { IconTrendingUp, IconTrendingDown } from "@tabler/icons-react";
import type { WeekStats } from "@/lib/consistency/calculateWeeklyStats";

// ── Color helpers ─────────────────────────────────────────────────────────────

function barColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-neutral-300 dark:bg-neutral-600";
}

function pctColor(pct: number): string {
  if (pct >= 80) return "text-emerald-500";
  if (pct >= 40) return "text-amber-500";
  return "text-neutral-500 dark:text-neutral-400";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface WeeklyHistoryProps {
  weekStats: WeekStats[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WeeklyHistory({ weekStats }: WeeklyHistoryProps) {
  if (weekStats.length === 0) return null;

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
      {weekStats.map((week, i) => {
        const isCurrentWeek = i === weekStats.length - 1;
        const trendUp = week.trendVsPrev !== null && week.trendVsPrev > 0;
        const trendDown = week.trendVsPrev !== null && week.trendVsPrev < -2;

        return (
          <motion.div
            key={week.weekStart}
            className={`flex-none w-[88px] rounded-2xl p-3 border transition-colors ${
              isCurrentWeek
                ? "border-neutral-300 bg-white dark:border-white/[0.15] dark:bg-white/[0.07]"
                : "border-neutral-100 bg-neutral-50 dark:border-white/[0.06] dark:bg-white/[0.03]"
            }`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut", delay: i * 0.04 }}
          >
            {/* Label */}
            <p className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500 leading-none mb-1.5">
              {week.label}
            </p>

            {/* Percentage */}
            <p className={`text-[20px] font-black leading-none tabular-nums ${pctColor(week.pct)}`}>
              {week.scheduled > 0 ? `${week.pct}%` : "—"}
            </p>

            {/* Mini progress bar */}
            <div className="mt-2.5 h-1.5 rounded-full bg-neutral-200 dark:bg-white/[0.08] overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${barColor(week.pct)}`}
                initial={{ width: "0%" }}
                animate={{ width: week.scheduled > 0 ? `${week.pct}%` : "0%" }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.15 + i * 0.05 }}
              />
            </div>

            {/* Trend */}
            {week.trendVsPrev !== null && (
              <div
                className={`mt-1.5 flex items-center gap-0.5 text-[10px] font-semibold ${
                  trendUp
                    ? "text-emerald-500"
                    : trendDown
                    ? "text-rose-400"
                    : "text-neutral-400 dark:text-neutral-500"
                }`}
              >
                {trendUp ? (
                  <IconTrendingUp size={10} strokeWidth={2.5} />
                ) : trendDown ? (
                  <IconTrendingDown size={10} strokeWidth={2.5} />
                ) : null}
                {trendUp
                  ? `+${week.trendVsPrev}%`
                  : trendDown
                  ? `${week.trendVsPrev}%`
                  : "steady"}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
