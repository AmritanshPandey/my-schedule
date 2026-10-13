"use client";

import { m } from "framer-motion";
import { IconCheck, IconRepeat } from "@tabler/icons-react";
import type { Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import { RITUAL_COLOR_DOT as COLOR_DOT } from "@/lib/ritualColors";
import { groupRitualEntriesForDate, ritualDayProgress } from "@/lib/consistency/ritualDayStatus";
import { routineWhenLabel } from "@/lib/routineDetails";
import { ritualScheduledOnDate } from "@/lib/consistency/calculateRitualStreak";

interface TodayRitualsBarProps {
  rituals: Ritual[];
  /** The date this bar represents — decides what's due and what a tap marks.
   *  Supersedes the old weekday-only filter, so interval routines
   *  ("every 3 days") now appear on the right days here too. */
  dateISO: string;
  ritualCompletions: RitualCompletion[];
  /** One tap marks any routine done for the day (rated 100%). */
  onMarkDone: (id: string) => void;
  /** Takes back an explicit mark. */
  onUnmarkDone: (id: string) => void;
  /** A routine done through logging alone has no mark to take back — it opens instead. */
  onOpenDetail?: (ritual: Ritual) => void;
}

export default function TodayRitualsBar({
  rituals,
  dateISO,
  ritualCompletions,
  onMarkDone,
  onUnmarkDone,
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
        <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
          <IconRepeat size={14} strokeWidth={1.8} />
          <span className="text-[13px] font-bold tabular-nums">
            {doneCount}/{todayRituals.length}
          </span>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" style={{ touchAction: "pan-x" }}>
        {todayRituals.map((ritual) => {
          const progress = progressFor(ritual);
          const done = progress.complete;
          const dot = ritual.color ? COLOR_DOT[ritual.color] : "bg-neutral-300 dark:bg-neutral-600";

          // Every routine is done in one tap — the detail is reference. A
          // routine already done through logging has no mark to take back,
          // so it opens rather than silently doing nothing.
          const handleTap = () => {
            haptic(done ? "light" : "medium");
            if (!done) return onMarkDone(ritual.id);
            if (progress.markedDone) return onUnmarkDone(ritual.id);
            return onOpenDetail?.(ritual);
          };

          const meta = done
            ? progress.followed !== null && progress.followed < 100 ? `${progress.followed}%` : "Done"
            : routineWhenLabel(ritual);

          return (
            <m.button
              key={ritual.id}
              type="button"
              whileTap={{ scale: 0.93 }}
              onClick={handleTap}
              aria-pressed={done}
              aria-label={done ? `Mark not done: ${ritual.title}` : `Mark done: ${ritual.title}`}
              className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 transition-all duration-200 ${
                done
                  ? "border-neutral-100 bg-neutral-50 dark:border-white/[0.04] dark:bg-white/[0.03]"
                  : "border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900"
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                done ? "bg-green-500" : dot
              }`}>
                {done && <IconCheck size={11} strokeWidth={3} className="text-white" />}
              </span>
              <span className={`whitespace-nowrap text-[12px] font-semibold leading-none ${
                done ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-700 dark:text-neutral-200"
              }`}>
                {ritual.title}
              </span>
              <span className="whitespace-nowrap text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                {meta}
              </span>
            </m.button>
          );
        })}
      </div>
    </div>
  );
}
