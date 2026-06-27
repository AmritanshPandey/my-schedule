"use client";

import { memo } from "react";
import { m } from "framer-motion";
import {
  IconCalendar,
  IconCheck,
  IconChecklist,
  IconFlame,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { Plan } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import type { AccentColor } from "@/lib/colorSystem";
import type { PlanDayState } from "@/lib/planInsights";
import { accentStyles } from "@/lib/colorSystem";
import IconButton from "@/components/ui/IconButton";

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
  red:     "stroke-red-500 dark:stroke-red-400",
  orange:  "stroke-orange-500 dark:stroke-orange-400",
  amber:   "stroke-amber-500 dark:stroke-amber-400",
  yellow:  "stroke-yellow-500 dark:stroke-yellow-400",
  lime:    "stroke-lime-500 dark:stroke-lime-400",
  green:   "stroke-green-500 dark:stroke-green-400",
  emerald: "stroke-emerald-500 dark:stroke-emerald-400",
  teal:    "stroke-teal-500 dark:stroke-teal-400",
  cyan:    "stroke-cyan-500 dark:stroke-cyan-400",
  sky:     "stroke-sky-500 dark:stroke-sky-400",
  blue:    "stroke-blue-500 dark:stroke-blue-400",
  indigo:  "stroke-indigo-500 dark:stroke-indigo-400",
  violet:  "stroke-violet-500 dark:stroke-violet-400",
  purple:  "stroke-purple-500 dark:stroke-purple-400",
  fuchsia: "stroke-fuchsia-500 dark:stroke-fuchsia-400",
  pink:    "stroke-pink-500 dark:stroke-pink-400",
  rose:    "stroke-rose-500 dark:stroke-rose-400",
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
        <m.circle
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
  onQuickLog?: () => void;
  onDelete?: () => void;
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
  onQuickLog,
  onDelete,
}: PlanCardProps) {
  const accent = accentStyles(plan.color);
  const stroke = ACCENT_STROKE[plan.color as AccentColor] ?? ACCENT_STROKE.cyan;
  const status = derivePlanStatus(dayState, consistency);
  const statusCfg = STATUS_CONFIG[status];

  return (
    <m.div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      whileHover={{ y: 0 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="group relative flex w-full cursor-pointer flex-col rounded-2xl border border-neutral-200/70 bg-white px-5 pb-4 pt-5 text-left transition-colors hover:border-neutral-300/80 dark:border-white/[0.07] dark:bg-neutral-900 dark:hover:border-white/[0.12] lg:min-h-[220px]"
    >
      {/* Delete — corner affordance. The absolute position lives on this wrapper
          because IconButton's `tap-target` class sets `position: relative`, which
          would otherwise override an `absolute` on the button itself and drop it
          inline at the top-left. Subtle by default (so it's reachable on touch,
          which has no hover) and emphasized on hover. */}
      {onDelete && (
        <div className="absolute right-2.5 top-2.5 z-10 opacity-60 transition-opacity group-hover:opacity-100">
          <IconButton
            label="Delete plan"
            variant="dangerGhost"
            size="xs"
            radius="xl"
            onClick={(e) => { e.stopPropagation(); haptic("light"); onDelete(); }}
          >
            <IconTrash size={15} strokeWidth={2} />
          </IconButton>
        </div>
      )}

      {/* ── Row 1: status chip ───────────────────────────────────────────── */}
      <m.div
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
      </m.div>

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
          <h2 className="text-[16px] font-bold leading-snug text-neutral-950 dark:text-white line-clamp-2">
            {plan.title}
          </h2>
          {plan.description && (
            <p className="mt-0.5 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400 line-clamp-2">
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
      <div className="mt-3.5 flex items-center gap-2 lg:mt-auto lg:pt-4">
        <div className="flex flex-1 items-center gap-1.5 rounded-xl bg-neutral-50 dark:bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
          <IconChecklist size={12} strokeWidth={2.2} className="shrink-0" />
          {taskCount} task{taskCount !== 1 ? "s" : ""}
          {trackerCount > 0 && <span className="text-neutral-400 dark:text-neutral-600"> · {trackerCount} tracked</span>}
        </div>
        {onQuickLog && trackerCount > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); haptic("light"); onQuickLog(); }}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-50 active:scale-95 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
            aria-label="Log entry"
          >
            <IconPlus size={14} strokeWidth={2.5} />
          </button>
        )}
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

        {plan.startDate && !plan.endDate && (
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
            Ongoing
          </span>
        )}
      </div>
    </m.div>
  );
}

export const PlanCard = memo(PlanCardInner);
