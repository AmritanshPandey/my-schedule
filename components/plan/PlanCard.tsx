"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconCalendar,
  IconCheck,
  IconClipboardList,
  IconFlame,
  IconTrendingUp,
} from "@tabler/icons-react";
import type { Plan } from "@/lib/useScheduleDB";
import type { PlanDayState } from "@/lib/planInsights";
import { accentStyles } from "@/lib/colorSystem";

interface PlanCardProps {
  plan: Plan;
  PlanIcon: React.ElementType;
  taskCount: number;
  trackerCount: number;
  dayState: PlanDayState;
  consistency: number;
  dateRange: string | null;
  onSelect: () => void;
}

function PlanCardInner({
  plan,
  PlanIcon,
  taskCount,
  trackerCount,
  dayState,
  consistency,
  dateRange,
  onSelect,
}: PlanCardProps) {
  const accent = accentStyles(plan.color);
  const highConsistency = consistency >= 50;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.987 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="w-full rounded-3xl border border-neutral-200 bg-white px-5 pt-5 pb-4 text-left shadow-sm transition-shadow hover:shadow-md dark:border-white/[0.08] dark:bg-neutral-900 dark:shadow-none"
    >
      {/* ── Top: icon + title ──────────────────────────────────────────────── */}
      <div className="flex items-start gap-3.5">
        <div
          className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${accent.tint} ${accent.icon}`}
        >
          <PlanIcon size={20} strokeWidth={1.7} />
        </div>
        <h2 className="flex-1 min-w-0 pt-0.5 text-[17px] font-bold leading-snug text-neutral-950 dark:text-white line-clamp-2">
          {plan.title}
        </h2>
      </div>

      {/* ── Description ────────────────────────────────────────────────────── */}
      {plan.description && (
        <p className="mt-2.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400 line-clamp-2">
          {plan.description}
        </p>
      )}

      {/* ── Date range (fixed plans only) ──────────────────────────────────── */}
      {dateRange && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <IconCalendar
            size={12}
            strokeWidth={1.8}
            className="shrink-0 text-neutral-400 dark:text-neutral-500"
          />
          <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
            {dateRange}
          </p>
        </div>
      )}

      {/* ── Daily execution status row ──────────────────────────────────────── */}
      {dayState === "complete" && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 dark:bg-green-500/[0.08]">
          <IconCheck
            size={13}
            strokeWidth={2.5}
            className="shrink-0 text-green-500"
          />
          <span className="text-[12px] font-semibold text-green-600 dark:text-green-400">
            Completed Today's Tasks
          </span>
        </div>
      )}
      {dayState === "partial" && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-500/[0.08]">
          <IconFlame
            size={13}
            strokeWidth={2}
            className="shrink-0 text-amber-500"
          />
          <span className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
            Partially Completed Today's Tasks
          </span>
        </div>
      )}

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div className="mt-4 mb-3 border-t border-neutral-100 dark:border-white/[0.05]" />

      {/* ── Bottom meta row ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
          <IconClipboardList size={13} strokeWidth={1.8} />
          {taskCount} Task{taskCount !== 1 ? "s" : ""}
        </span>

        {trackerCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
            <IconTrendingUp size={13} strokeWidth={1.8} />
            {trackerCount} Tracking
          </span>
        )}

        <span
          className={`ml-auto inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums ${
            highConsistency
              ? "text-green-500 dark:text-green-400"
              : "text-rose-500 dark:text-rose-400"
          }`}
        >
          {highConsistency ? (
            <IconArrowUpRight size={13} strokeWidth={2} />
          ) : (
            <IconArrowDownRight size={13} strokeWidth={2} />
          )}
          {consistency}% Consistency
        </span>
      </div>
    </motion.button>
  );
}

export const PlanCard = memo(PlanCardInner);
