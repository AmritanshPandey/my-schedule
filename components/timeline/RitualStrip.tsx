"use client";

import { motion } from "framer-motion";
import { IconCheck } from "@tabler/icons-react";
import type { Ritual, RitualColor } from "@/lib/useScheduleDB";

const COLOR_DOTS: Record<RitualColor, string> = {
  rose:    "bg-rose-400",
  sky:     "bg-sky-400",
  violet:  "bg-violet-400",
  amber:   "bg-amber-400",
  emerald: "bg-emerald-400",
  fuchsia: "bg-fuchsia-400",
};

interface RitualStripProps {
  ritual: Ritual;
  completed: boolean;
  onToggle: () => void;
}

export default function RitualStrip({ ritual, completed, onToggle }: RitualStripProps) {
  const dot = ritual.color ? COLOR_DOTS[ritual.color] : "bg-neutral-400";

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      onClick={onToggle}
      className={`
        pointer-events-auto inline-flex items-center gap-1.5
        h-[24px] shrink-0 rounded-full
        px-2.5
        bg-white/80 backdrop-blur-sm
        border border-neutral-200/60
        shadow-[0_1px_4px_0_rgba(0,0,0,0.06)]
        dark:bg-neutral-900/75 dark:border-white/[0.09] dark:shadow-none
        transition-opacity duration-200 select-none
        ${completed ? "opacity-40" : "opacity-100"}
      `}
    >
      {completed ? (
        <IconCheck size={8} strokeWidth={3} className="text-green-500 shrink-0" />
      ) : (
        <span className={`h-[7px] w-[7px] rounded-full shrink-0 ${dot}`} />
      )}
      <span className="text-[10px] font-semibold leading-none text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
        {ritual.title}
      </span>
    </motion.button>
  );
}
