"use client";

import { m } from "framer-motion";
import { IconCheck } from "@tabler/icons-react";
import type { Ritual, RitualColor } from "@/lib/useScheduleDB";

const COLOR_DOTS: Record<RitualColor, string> = {
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

interface RitualStripProps {
  ritual: Ritual;
  completed: boolean;
  onToggle: () => void;
}

export default function RitualStrip({ ritual, completed, onToggle }: RitualStripProps) {
  const dot = ritual.color ? COLOR_DOTS[ritual.color] : "bg-neutral-400";

  return (
    <m.button
      type="button"
      whileTap={{ scale: 0.82 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      onClick={onToggle}
      title={ritual.title}
      className={`
        pointer-events-auto
        flex items-center justify-center
        h-4 w-4 shrink-0 rounded-full cursor-pointer
        hover:brightness-110 active:brightness-95
        transition-all duration-150 select-none
        ${completed ? "opacity-50" : "opacity-100"}
        ${dot}
      `}
    >
      {completed && (
        <IconCheck size={8} strokeWidth={3.5} className="text-white/90" />
      )}
    </m.button>
  );
}
