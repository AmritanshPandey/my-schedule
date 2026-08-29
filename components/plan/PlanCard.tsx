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
import { derivePlanStatus, type PlanDayState, type PlanStatus } from "@/lib/planInsights";
import { PLAN_NEUTRAL } from "@/lib/colorSystem";
import IconButton from "@/components/ui/IconButton";
import { CARD_INTERACTIVE } from "@/components/ui/surfaces";
import AnimatedNumber from "@/components/ui/AnimatedNumber";

// ── Status derivation ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<Exclude<PlanStatus, "unproven">, {
  label: string;
  text: string;
  dot: string;
  pulse: boolean;
}> = {
  on_track: {
    label: "On track",
    text: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
    pulse: true,
  },
  at_risk: {
    label: "At risk",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    pulse: false,
  },
  delayed: {
    label: "Needs focus",
    text: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500",
    pulse: false,
  },
};

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
  const status = derivePlanStatus(dayState, consistency, plan);
  const statusCfg = status === "unproven" ? null : STATUS_CONFIG[status];

  return (
    <m.div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={`group relative flex w-full cursor-pointer flex-col px-5 pb-4 pt-5 text-left outline-none transition-[border-color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-emerald-500/60 lg:min-h-[220px] ${CARD_INTERACTIVE}`}
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

      {/* ── Row 1: status ─────────────────────────────────────────────────────
          Deliberately absent while the plan is unproven. The instrument turns
          on when there is something to measure; an empty gauge reading zero on
          day one is noise wearing the costume of a signal. "Not started today"
          at the foot of the card already states the honest fact. */}
      {statusCfg && (
        <m.div
          className={`flex items-center gap-1.5 text-[10.5px] font-bold ${statusCfg.text}`}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusCfg.dot} ${
              statusCfg.pulse ? "animate-pulse" : ""
            }`}
          />
          {/* Tracking is scoped to the words. Applied to the whole row it also
              spaced the digit away from its own percent sign, which read as
              "0 %" — a stray space, not a number. */}
          <span className="uppercase tracking-[0.07em]">{statusCfg.label}</span>
          <span aria-hidden className="opacity-60">·</span>
          <span className="tabular-nums">
            <AnimatedNumber value={consistency} />%
          </span>
        </m.div>
      )}

      {/* ── Row 2: identity + title / description / date ─────────────────────
          The icon is identity and nothing else. It used to wear a progress ring
          reporting the same consistency figure printed above it — two encodings
          of one number, and the ring was the unreadable one: a hairline at low
          values, and at exactly zero a *dot*, because a round line cap paints a
          full round end even on a zero-length dash. That dot sat in the status
          colour at twelve o'clock on every card and looked like a badge that
          meant something. It meant the value was nothing. */}
      <div className={`flex items-start gap-3.5 ${statusCfg ? "mt-3" : ""}`}>
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${PLAN_NEUTRAL.tint} ${PLAN_NEUTRAL.iconBorder}`}
        >
          <PlanIcon size={19} strokeWidth={1.7} className={PLAN_NEUTRAL.icon} />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="line-clamp-2 text-[16px] font-bold leading-snug text-neutral-950 dark:text-white">
            {plan.title}
          </h2>
          {plan.description && (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {plan.description}
            </p>
          )}
          {dateRange && (
            <div className="mt-1.5 flex items-center gap-1.5">
              {/* neutral-500/400, not 400/500: the lighter pair measured
                  3.79:1 in dark and 2.53:1 in light, both under the 4.5:1 AA
                  floor for 12px text. Muted has to stay readable. */}
              <IconCalendar
                size={11}
                strokeWidth={1.8}
                className="shrink-0 text-neutral-500 dark:text-neutral-400"
              />
              <p className="text-[12px] text-neutral-500 dark:text-neutral-400">{dateRange}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: what's in the plan ────────────────────────────────────── */}
      <div className="mt-3.5 flex items-center gap-2 lg:mt-auto lg:pt-4">
        <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-transparent bg-neutral-50 px-3 py-2 text-[12px] font-semibold text-neutral-600 transition-colors group-hover:border-neutral-200 group-hover:bg-white dark:bg-white/[0.04] dark:text-neutral-300 dark:group-hover:border-white/[0.10] dark:group-hover:bg-white/[0.06]">
          <IconChecklist size={12} strokeWidth={2.2} className="shrink-0" />
          {taskCount} task{taskCount !== 1 ? "s" : ""}
          {/* "trackers", not "tracked": this counts ProgressTracker rows — the
              numeric metrics behind the plan's "Progress Tracking" section — and
              has nothing to do with isTrackedTask, which is what "tracked"
              means everywhere else. "5 tasks · 0 tracked" would have implied
              those tasks don't count toward anything, which is false. */}
          {/* Was neutral-400/600 — 2.30:1 in dark, which is not "secondary",
              it is unreadable. One step down from the pill's own colour keeps
              the hierarchy while clearing AA. */}
          {trackerCount > 0 && (
            <span className="text-neutral-500 transition-colors group-hover:text-neutral-600 dark:text-neutral-400 dark:group-hover:text-neutral-300">
              {" "}· {trackerCount} tracker{trackerCount !== 1 ? "s" : ""}
            </span>
          )}
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
      <div className="mb-3 mt-4 border-t border-neutral-100 dark:border-white/[0.05]" />

      {/* ── Row 4: today ──────────────────────────────────────────────────
          The one line about *today*, which is a different fact from the status
          chip's standing over time — so both earn their place. "No end date"
          used to sit at the right of this row; it described the plan's dates,
          not its execution, and next to "Completed Today" it read as a state.
          The date line above already says "Starts <date>" for an open-ended
          plan, so it was saying it twice as well. */}
      <div className="flex items-center gap-3">
        {dayState === "complete" ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
            <IconCheck size={13} strokeWidth={2.5} className="shrink-0" />
            Completed today
          </span>
        ) : dayState === "partial" ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
            <IconFlame size={13} strokeWidth={2} className="shrink-0" />
            In progress today
          </span>
        ) : (
          <span className="text-[12px] text-neutral-500 dark:text-neutral-400">
            {taskCount > 0 ? "Not started today" : "No tasks today"}
          </span>
        )}
      </div>
    </m.div>
  );
}

export const PlanCard = memo(PlanCardInner);
