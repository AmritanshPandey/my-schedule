"use client";

import { motion } from "framer-motion";
import { IconCheck } from "@tabler/icons-react";
import type { Ritual, RitualColor, DayKey } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";

const COLOR_DOT: Record<RitualColor, string> = {
  rose:    "bg-rose-400",
  sky:     "bg-sky-400",
  violet:  "bg-violet-400",
  amber:   "bg-amber-400",
  emerald: "bg-emerald-400",
  fuchsia: "bg-fuchsia-400",
  orange:  "bg-orange-400",
  cyan:    "bg-cyan-400",
  indigo:  "bg-indigo-400",
  teal:    "bg-teal-400",
};

interface TodayRitualsBarProps {
  rituals: Ritual[];
  activeDay: DayKey;
  completedIds: Set<string>;
  onToggle: (id: string) => void;
}

export default function TodayRitualsBar({
  rituals,
  activeDay,
  completedIds,
  onToggle,
}: TodayRitualsBarProps) {
  const todayRituals = rituals.filter((r) => {
    if (r.repeatDays && r.repeatDays.length > 0 && !r.repeatDays.includes(activeDay)) return false;
    return true;
  });

  if (todayRituals.length === 0) return null;

  const doneCount = todayRituals.filter((r) => completedIds.has(r.id)).length;

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
          Routines
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
          {doneCount}/{todayRituals.length}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: "pan-x" }}>
        {todayRituals.map((ritual) => {
          const done = completedIds.has(ritual.id);
          const dot = ritual.color ? COLOR_DOT[ritual.color] : "bg-neutral-300 dark:bg-neutral-600";

          return (
            <motion.button
              key={ritual.id}
              type="button"
              whileTap={{ scale: 0.93 }}
              onClick={() => { haptic("light"); onToggle(ritual.id); }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 transition-all duration-200 ${
                done
                  ? "border-neutral-100 bg-neutral-50 opacity-55 dark:border-white/[0.04] dark:bg-white/[0.03]"
                  : "border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900"
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${
                done ? "bg-green-500" : `${dot}`
              }`}>
                {done && <IconCheck size={9} strokeWidth={3} className="text-white" />}
              </span>
              <span className={`whitespace-nowrap text-[12px] font-semibold leading-none ${
                done
                  ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-600"
                  : "text-neutral-700 dark:text-neutral-200"
              }`}>
                {ritual.title}
              </span>
              <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                {ritual.time}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
