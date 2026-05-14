"use client";

import { motion } from "framer-motion";
import type { DayStats } from "@/lib/consistency/calculateDailyStats";

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

interface WeeklyConsistencyChartProps {
  dayStats: DayStats[];
}

export default function WeeklyConsistencyChart({ dayStats }: WeeklyConsistencyChartProps) {
  return (
    <div className="space-y-2.5">
      {dayStats.map((day, i) => (
        <motion.div
          key={day.dayKey}
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2, ease: "easeOut", delay: i * 0.035 }}
        >
          {/* Day label */}
          <span
            className={`w-7 shrink-0 text-[12px] font-bold ${
              day.isToday
                ? "text-neutral-950 dark:text-white"
                : "text-neutral-400 dark:text-neutral-500"
            }`}
          >
            {day.label}
          </span>

          {/* Bar track */}
          <div className="relative flex-1 h-2 rounded-full bg-neutral-100 dark:bg-white/[0.07] overflow-hidden">
            {!day.isFuture && day.scheduled > 0 && (
              <motion.div
                className={`absolute inset-y-0 left-0 rounded-full ${barColor(day.pct)}`}
                initial={{ width: "0%" }}
                animate={{ width: `${day.pct}%` }}
                transition={{
                  duration: 0.65,
                  ease: [0.25, 0.46, 0.45, 0.94],
                  delay: 0.08 + i * 0.045,
                }}
              />
            )}
          </div>

          {/* Percentage */}
          <span
            className={`w-8 shrink-0 text-right text-[12px] font-bold tabular-nums ${
              day.isFuture || day.scheduled === 0
                ? "text-neutral-300 dark:text-neutral-700"
                : pctTextColor(day.pct)
            }`}
          >
            {day.isFuture || day.scheduled === 0 ? "—" : `${day.pct}%`}
          </span>
        </motion.div>
      ))}
    </div>
  );
}
