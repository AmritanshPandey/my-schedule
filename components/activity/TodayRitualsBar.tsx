"use client";

import { m } from "framer-motion";
import { IconCheck, IconRepeat, IconPlus } from "@tabler/icons-react";
import type { Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import { formatDisplayTime } from "@/lib/timeUtils";
import { RITUAL_COLOR_DOT as COLOR_DOT } from "@/lib/ritualColors";
import { groupRitualEntriesForDate, ritualDayProgress } from "@/lib/consistency/ritualDayStatus";
import { quickAmountsForRitual } from "@/lib/quickAmounts";
import { ritualScheduledOnDate } from "@/lib/consistency/calculateRitualStreak";

interface TodayRitualsBarProps {
  rituals: Ritual[];
  /** The date this bar represents — decides what's due and dates quick-adds.
   *  Supersedes the old weekday-only filter, so interval routines
   *  ("every 3 days") now appear on the right days here too. */
  dateISO: string;
  ritualCompletions: RitualCompletion[];
  /** Checkbox routines only. */
  onToggle: (id: string) => void;
  /** Quantity / duration / count — logs one quick-add increment. */
  onLogAmount: (id: string, amount: number) => void;
  /** Checklist routines open their detail view; a pill can't express 4 steps. */
  onOpenDetail?: (ritual: Ritual) => void;
}

export default function TodayRitualsBar({
  rituals,
  dateISO,
  ritualCompletions,
  onToggle,
  onLogAmount,
  onOpenDetail,
}: TodayRitualsBarProps) {
  const todayRituals = rituals.filter((r) => ritualScheduledOnDate(r, dateISO));
  if (todayRituals.length === 0) return null;

  const entriesByRitual = groupRitualEntriesForDate(ritualCompletions, dateISO);
  const progressFor = (r: Ritual) => ritualDayProgress(r, entriesByRitual.get(r.id) ?? []);
  const doneCount = todayRituals.filter((r) => progressFor(r).complete).length;

  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center justify-between px-0.5">
        <span className="text-[12px] font-black uppercase tracking-[0.10em] text-neutral-800 dark:text-neutral-200">
          Routines
        </span>
        <div className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500">
          <IconRepeat size={14} strokeWidth={1.8} />
          <span className="text-[13px] font-bold tabular-nums">
            {doneCount}/{todayRituals.length}
          </span>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: "pan-x" }}>
        {todayRituals.map((ritual) => {
          const trackingType = ritual.trackingType ?? "checkbox";
          const progress = progressFor(ritual);
          const done = progress.complete;
          const dot = ritual.color ? COLOR_DOT[ritual.color] : "bg-neutral-300 dark:bg-neutral-600";

          const isMeasured = trackingType === "quantity" || trackingType === "duration" || trackingType === "count";
          const isChecklist = trackingType === "checklist";
          // The first quick-add preset is this pill's increment. Without one
          // there is no unambiguous amount to log, so the pill opens the
          // routine instead of guessing a number.
          const increment = isMeasured ? quickAmountsForRitual(ritual)[0] : undefined;

          // A tap must never complete more than it is entitled to. Only a
          // checkbox routine is completable in one tap; measured routines log
          // one increment, and anything else opens its detail view.
          const handleTap = () => {
            haptic("light");
            if (trackingType === "checkbox") return onToggle(ritual.id);
            if (isMeasured && increment !== undefined && !done) return onLogAmount(ritual.id, increment);
            return onOpenDetail?.(ritual);
          };

          // Trailing text carries the real state: progress for measured
          // routines, steps for a checklist, the scheduled time otherwise.
          const meta = isMeasured
            ? `${progress.value}${ritual.target ? `/${ritual.target}` : ""}${ritual.unit ? ` ${ritual.unit}` : ""}`
            : isChecklist && progress.stepsTotal > 0
              ? `${progress.stepsDone}/${progress.stepsTotal}`
              : ritual.anyTime
                ? "Anytime"
                : formatDisplayTime(ritual.time);

          const canQuickAdd = isMeasured && increment !== undefined && !done;

          return (
            <m.button
              key={ritual.id}
              type="button"
              whileTap={{ scale: 0.93 }}
              onClick={handleTap}
              aria-label={
                canQuickAdd
                  ? `Log ${increment}${ritual.unit ? ` ${ritual.unit}` : ""} of ${ritual.title}, ${meta} so far`
                  : trackingType === "checkbox"
                    ? `${done ? "Mark not done" : "Mark done"}: ${ritual.title}`
                    : `Open ${ritual.title}, ${meta}`
              }
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 transition-all duration-200 ${
                done
                  ? "border-neutral-100 bg-neutral-50 opacity-55 dark:border-white/[0.04] dark:bg-white/[0.03]"
                  : "border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900"
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                done ? "bg-green-500" : dot
              }`}>
                {done ? (
                  <IconCheck size={9} strokeWidth={3} className="text-white" />
                ) : canQuickAdd ? (
                  <IconPlus size={10} strokeWidth={3} className="text-white" />
                ) : null}
              </span>
              <span className={`whitespace-nowrap text-[12px] font-semibold leading-none ${
                done
                  ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-600"
                  : "text-neutral-700 dark:text-neutral-200"
              }`}>
                {ritual.title}
              </span>
              <span className="whitespace-nowrap text-[11px] font-medium tabular-nums text-neutral-400 dark:text-neutral-500">
                {meta}
              </span>
            </m.button>
          );
        })}
      </div>
    </div>
  );
}
