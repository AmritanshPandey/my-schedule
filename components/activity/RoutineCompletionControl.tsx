"use client";

/**
 * The one completion control every routine shares: a 44px ring you tap to say
 * "done". Whatever the routine tracks — an amount, a checklist, several times
 * a day — finishing it for the day is the same single tap; the detail is
 * reference, and how closely it was followed is a separate, optional rating.
 *
 * The caller decides what a tap means (mark, open the rating, take the mark
 * back) — see RoutineRow.
 */
import { m, AnimatePresence } from "framer-motion";
import { IconCheck } from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";

interface RoutineCompletionControlProps {
  title: string;
  done: boolean;
  missed: boolean;
  onPress: () => void;
}

export default function RoutineCompletionControl({ title, done, missed, onPress }: RoutineCompletionControlProps) {
  return (
    <m.button
      type="button"
      whileTap={{ scale: 0.86 }}
      onClick={() => { haptic(done ? "light" : "medium"); onPress(); }}
      aria-label={done ? `Mark ${title} not done` : missed ? `Mark ${title} done for that day` : `Mark ${title} done`}
      aria-pressed={done}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[2.5px] transition-colors ${
        done
          ? "border-transparent bg-green-500"
          : missed
            ? "border-neutral-300 bg-neutral-200 dark:border-white/15 dark:bg-white/10"
            : "border-neutral-300 bg-transparent hover:border-neutral-400 dark:border-neutral-600 dark:hover:border-neutral-500"
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
