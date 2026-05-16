"use client";

import { memo } from "react";
import { motion } from "framer-motion";
import {
  IconCalendar,
  IconCheck,
  IconClipboardList,
  IconFlame,
} from "@tabler/icons-react";
import type { Plan } from "@/lib/useScheduleDB";
import type { AccentColor } from "@/lib/colorSystem";
import type { PlanDayState } from "@/lib/planInsights";
import { accentStyles } from "@/lib/colorSystem";

// ── Status derivation ─────────────────────────────────────────────────────────

type PlanStatus = "on_track" | "at_risk" | "delayed";

const STATUS_CONFIG: Record<PlanStatus, {
  label: string;
  text: string;
  dot: string;
  pulse: boolean;
}> = {
  on_track: {
    label: "ON TRACK",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    pulse: true,
  },
  at_risk: {
    label: "AT RISK",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    pulse: false,
  },
  delayed: {
    label: "NEEDS FOCUS",
    text: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
    pulse: false,
  },
};

function derivePlanStatus(dayState: PlanDayState, consistency: number): PlanStatus {
  if (dayState === "complete" || consistency >= 70) return "on_track";
  if (consistency >= 35) return "at_risk";
  return "delayed";
}

// ── Accent → SVG stroke color ─────────────────────────────────────────────────

const ACCENT_STROKE: Record<AccentColor, string> = {
  blue:    "stroke-blue-500 dark:stroke-blue-400",
  emerald: "stroke-green-500 dark:stroke-green-400",
  violet:  "stroke-violet-500 dark:stroke-violet-400",
  pink:    "stroke-pink-500 dark:stroke-pink-400",
  amber:   "stroke-amber-500 dark:stroke-amber-400",
  cyan:    "stroke-cyan-500 dark:stroke-cyan-400",
};

// ── Progress ring (SVG) ───────────────────────────────────────────────────────

const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

interface ProgressRingProps {
  value: number;
  Icon: React.ElementType;
  iconClass: string;
  tintClass: string;
  strokeClass: string;
}

function ProgressRing({ value, Icon, iconClass, tintClass, strokeClass }: ProgressRingProps) {
  const filled = (Math.max(0, Math.min(100, value)) / 100) * RING_C;

  return (
    <div className="relative shrink-0 w-[52px] h-[52px]">
      {/* SVG ring */}
      <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 52 52">
        {/* Track */}
        <circle
          cx="26" cy="26" r={RING_R}
          fill="none"
          strokeWidth="3.5"
          className="stroke-neutral-100 dark:stroke-white/[0.07]"
        />
        {/* Progress arc */}
        <motion.circle
          cx="26" cy="26" r={RING_R}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className={strokeClass}
          initial={{ strokeDasharray: `0 ${RING_C}` }}
          animate={{ strokeDasharray: `${filled} ${RING_C - filled}` }}
          transition={{ duration: 0.85, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 }}
        />
      </svg>
      {/* Icon in center */}
      <div className={`absolute inset-[7px] rounded-full flex items-center justify-center ${tintClass}`}>
        <Icon size={17} strokeWidth={1.7} className={iconClass} />
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────────

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
  const stroke = ACCENT_STROKE[plan.color as AccentColor] ?? ACCENT_STROKE.cyan;
  const status = derivePlanStatus(dayState, consistency);
  const statusCfg = STATUS_CONFIG[status];


  return (
    <motion.button
      type="button"
      onClick={onSelect}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="w-full rounded-3xl border border-neutral-200 bg-white px-5 pt-5 pb-4 text-left transition-colors hover:border-neutral-300 dark:border-white/[0.08] dark:bg-neutral-900 dark:hover:border-white/[0.14]"
    >
      {/* ── Row 1: status chip ───────────────────────────────────────────── */}
      <motion.div
        className={`flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.07em] ${statusCfg.text}`}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusCfg.dot} ${
            statusCfg.pulse ? "animate-pulse" : ""
          }`}
        />
        {statusCfg.label} · {consistency}%
      </motion.div>

      {/* ── Row 2: progress ring + title / description / date ────────────── */}
      <div className="flex items-start gap-3.5 mt-3">
        <ProgressRing
          value={consistency}
          Icon={PlanIcon}
          iconClass={accent.icon}
          tintClass={accent.tint}
          strokeClass={stroke}
        />

        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="text-[17px] font-bold leading-snug text-neutral-950 dark:text-white line-clamp-2">
            {plan.title}
          </h2>
          {plan.description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400 line-clamp-2">
              {plan.description}
            </p>
          )}
          {dateRange && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <IconCalendar
                size={11}
                strokeWidth={1.8}
                className="shrink-0 text-neutral-400 dark:text-neutral-500"
              />
              <p className="text-[12px] text-neutral-400 dark:text-neutral-500">{dateRange}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: insight chip ──────────────────────────────────────────── */}
      <div className="mt-3.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-xl bg-neutral-50 dark:bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
          <IconClipboardList size={12} strokeWidth={2.2} className="shrink-0" />
          {taskCount} task{taskCount !== 1 ? "s" : ""}
          {trackerCount > 0 && <span className="text-neutral-400 dark:text-neutral-600"> · {trackerCount} tracked</span>}
        </div>
      </div>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="mt-4 mb-3 border-t border-neutral-100 dark:border-white/[0.05]" />

      {/* ── Row 4: today's execution state ───────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        {dayState === "complete" ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
            <IconCheck size={13} strokeWidth={2.5} className="shrink-0" />
            Completed Today
          </span>
        ) : dayState === "partial" ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
            <IconFlame size={13} strokeWidth={2} className="shrink-0" />
            In Progress Today
          </span>
        ) : (
          <span className="text-[12px] text-neutral-400 dark:text-neutral-500">
            {taskCount > 0 ? "Not started today" : "No tasks today"}
          </span>
        )}

        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
          {plan.startDate && !plan.endDate ? "Ongoing" : dateRange ? "" : null}
        </span>
      </div>
    </motion.button>
  );
}

export const PlanCard = memo(PlanCardInner);
