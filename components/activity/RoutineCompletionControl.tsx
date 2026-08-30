"use client";

/**
 * The primary completion action for one routine row, on one day — dispatches
 * by trackingType so RoutineRow doesn't need to know the details of any one
 * tracking mode.
 *
 * checkbox   → tap the circle (unchanged visual from the original RitualView
 *              card: 44px ring, green fill + check when done).
 * quantity/
 * duration/
 * count      → a small "+amount" pill (the primary preset) plus an undo
 *              affordance once something's been logged today. Every log call
 *              goes through the caller's `onLogAmount`, which — mirroring the
 *              fix already made in AddEntryModal.tsx for a real stale-closure
 *              bug — must itself be backed by a functional `setSchedule`
 *              updater so rapid taps can never lose an increment.
 * checklist/
 * times      → a compact "done/total" pill. Tapping it does not expand steps
 *              inline (kept out of the row to avoid a second layout mode) —
 *              opening the routine's detail view is where steps (checklist)
 *              or occurrences (times) are checked off individually.
 */
import { m, AnimatePresence } from "framer-motion";
import { IconCheck, IconMinus, IconPlus } from "@tabler/icons-react";
import type { Ritual } from "@/lib/useScheduleDB";
import type { RitualDayProgress } from "@/lib/consistency/ritualDayStatus";
import { quickAmountsForRitual } from "@/lib/quickAmounts";
import { haptic } from "@/lib/haptics";

interface RoutineCompletionControlProps {
  ritual: Ritual;
  progress: RitualDayProgress;
  missed: boolean;
  onToggleCheckbox: () => void;
  onLogAmount: (amount: number) => void;
  onUndoLastLog: () => void;
}

export default function RoutineCompletionControl({
  ritual,
  progress,
  missed,
  onToggleCheckbox,
  onLogAmount,
  onUndoLastLog,
}: RoutineCompletionControlProps) {
  const trackingType = ritual.trackingType ?? "checkbox";

  if (trackingType === "quantity" || trackingType === "duration" || trackingType === "count") {
    const [primaryAmount] = quickAmountsForRitual(ritual);
    return (
      <div className="flex shrink-0 items-center gap-1">
        {progress.value > 0 && (
          <button
            type="button"
            aria-label="Undo last log"
            onClick={() => { haptic("light"); onUndoLastLog(); }}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-neutral-400 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-500 dark:hover:bg-white/[0.05]"
          >
            <IconMinus size={14} strokeWidth={2.4} />
          </button>
        )}
        <m.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => { haptic("medium"); onLogAmount(primaryAmount ?? 1); }}
          aria-label={`Log +${primaryAmount ?? 1}${ritual.unit ?? ""}`}
          className={`flex h-8 items-center gap-1 rounded-full border px-3 text-[12px] font-bold transition-colors ${
            progress.complete
              ? "border-transparent bg-green-500 text-white"
              : "border-neutral-200 text-neutral-700 hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-200 dark:hover:bg-white/[0.05]"
          }`}
        >
          {progress.complete ? <IconCheck size={13} strokeWidth={2.6} /> : <IconPlus size={12} strokeWidth={2.6} />}
          {primaryAmount ?? 1}{ritual.unit ? ` ${ritual.unit}` : ""}
        </m.button>
      </div>
    );
  }

  if (trackingType === "checklist" || trackingType === "times") {
    return (
      <span
        className={`flex h-8 shrink-0 items-center rounded-full px-3 text-[12px] font-bold tabular-nums ${
          progress.complete
            ? "bg-green-500 text-white"
            : "border border-neutral-200 text-neutral-600 dark:border-white/[0.10] dark:text-neutral-300"
        }`}
      >
        {progress.stepsDone}/{progress.stepsTotal}
      </span>
    );
  }

  // checkbox (including legacy undefined trackingType) — unchanged behavior.
  const done = progress.complete;
  return (
    <m.button
      type="button"
      whileTap={{ scale: 0.86 }}
      onClick={() => { haptic("light"); onToggleCheckbox(); }}
      aria-label={done ? "Mark incomplete" : missed ? "Mark complete for missed day" : "Mark complete"}
      aria-pressed={done}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[2.5px] transition-colors ${
        done
          ? "border-transparent bg-green-500"
          : missed
            ? "border-neutral-300 bg-neutral-200 dark:border-white/15 dark:bg-white/10"
            : "border-neutral-300 bg-transparent dark:border-neutral-600"
      }`}
    >
      <AnimatePresence initial={false}>
        {done && (
          <m.span
            key="check"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
          >
            <IconCheck size={24} strokeWidth={3} className="text-white" />
          </m.span>
        )}
      </AnimatePresence>
    </m.button>
  );
}
