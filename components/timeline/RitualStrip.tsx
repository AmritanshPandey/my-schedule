"use client";

import { m } from "framer-motion";
import { IconCheck } from "@tabler/icons-react";
import type { Ritual, RitualColor } from "@/lib/useScheduleDB";

export const COLOR_DOTS: Record<RitualColor, string> = {
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

/**
 * A ritual on the timeline: a colored dot that grows into a capsule on
 * hover/focus to reveal its name, and carries its own done state.
 *
 * The capsule is absolutely positioned and right-anchored inside a fixed 16px
 * button, so expanding never reflows the dots beside it — it reads as the dot
 * itself stretching rather than a tooltip appearing next to it. Growing
 * leftward keeps it inside the day column (the dots sit on the column's right
 * edge in WeekGrid).
 *
 * Done state mirrors the rest of the app: the name gets a strikethrough and the
 * round end-cap holds a tick.
 *
 * The label uses dark ink, not white — every dot colour is a 400-level fill, on
 * which white text lands around 2:1 and fails WCAG AA.
 */
export default function RitualStrip({ ritual, completed, onToggle }: RitualStripProps) {
  const dot = ritual.color ? COLOR_DOTS[ritual.color] : "bg-neutral-400";

  return (
    <m.button
      type="button"
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 500, damping: 28 }}
      onClick={onToggle}
      aria-pressed={completed}
      aria-label={`${ritual.title}${ritual.time ? ` at ${ritual.time}` : ""} — ${completed ? "done, tap to undo" : "tap to mark done"}`}
      title={ritual.title}
      className="group/ritual pointer-events-auto relative h-4 w-4 shrink-0 cursor-pointer select-none rounded-full hover:z-20 focus-visible:z-20"
    >
      <span
        className={`
          absolute right-0 top-1/2 flex h-6 max-w-[150px] -translate-y-1/2 items-center
          rounded-full ring-2 ring-white transition-[filter] duration-150 dark:ring-neutral-950
          group-hover/ritual:brightness-110 group-active/ritual:brightness-95
          ${completed ? "opacity-60" : "opacity-100"}
          ${dot}
        `}
      >
        {/* max-width, not the 0fr→1fr grid trick: this capsule is absolutely
            positioned and shrink-to-fit, and an `fr` has no definite space to
            divide in that context — it resolves to 0 and never opens. */}
        <span
          className="
            max-w-0 overflow-hidden transition-[max-width] duration-200 ease-out
            group-hover/ritual:max-w-[150px] group-focus-visible/ritual:max-w-[150px]
          "
        >
          <span className="flex items-center gap-1 whitespace-nowrap pl-2 pr-0.5 text-[10px] font-bold leading-none text-neutral-950">
            <span className={completed ? "line-through decoration-neutral-950/60" : ""}>
              {ritual.title}
            </span>
            {ritual.time && (
              <span className="font-semibold tabular-nums text-neutral-950/60">{ritual.time}</span>
            )}
          </span>
        </span>

        {/* Round end-cap — always 16px, holds the tick once done. */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center">
          {completed && <IconCheck size={16} strokeWidth={2} className="text-neutral-950" />}
        </span>
      </span>
    </m.button>
  );
}
