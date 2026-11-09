"use client";

import { IconRepeat } from "@tabler/icons-react";
import type { TodayRoutineRow } from "@/lib/overview";
import { iconGlyph, getIconPickerStyle } from "@/components/SectionIcons";
import RoutineCompletionControl from "@/components/activity/RoutineCompletionControl";
import { CARD } from "@/components/ui/surfaces";
import Button from "@/components/ui/Button";
import { haptic } from "@/lib/haptics";

/**
 * Today's routines, each one tap from done — the same ring the Routine tab
 * uses. A routine whose run is on the line today (the at-risk half of the old
 * Needs attention card) says so on its own row.
 */
export default function TodayRoutineCard({
  rows,
  done,
  total,
  atRiskIds,
  onToggle,
  onOpenRoutine,
}: {
  rows: TodayRoutineRow[];
  done: number;
  total: number;
  /** Routines with a streak that ends tonight unless they're done. */
  atRiskIds?: ReadonlySet<string>;
  onToggle: (ritualId: string, done: boolean) => void;
  /** Opens the Routine tab. */
  onOpenRoutine: () => void;
}) {
  return (
    <section data-testid="overview-today-routine" className={`${CARD} px-4 pb-2 pt-4`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-bold text-neutral-950 dark:text-white">Today&rsquo;s routine</h2>
        {total > 0 && (
          <span className="text-[13px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
            {done}/{total} done
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-5 text-center">
          <IconRepeat size={22} strokeWidth={2} className="mx-auto text-neutral-400" aria-hidden />
          <p className="mt-2 text-[13px] text-neutral-500 dark:text-neutral-400">No routines due today.</p>
          <Button variant="secondary" size="md" onClick={() => { haptic("light"); onOpenRoutine(); }} className="mt-3">
            Open routines
          </Button>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-neutral-100 dark:divide-white/[0.06]">
          {rows.map(({ ritual, cadenceLabel, goalLabel, done: isDone }) => {
            const style = getIconPickerStyle(ritual.icon ?? "");
            const Glyph = iconGlyph(ritual.icon ?? "");
            const atRisk = !isDone && atRiskIds?.has(ritual.id);
            return (
              <li key={ritual.id} className="flex items-center gap-3 py-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    ritual.icon ? style.tint : "bg-neutral-100 dark:bg-white/[0.06]"
                  }`}
                >
                  {ritual.icon ? (
                    <Glyph size={18} strokeWidth={1.9} className={style.text} />
                  ) : (
                    <span className="text-[14px] font-bold text-neutral-600 dark:text-neutral-300">{ritual.title.charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[15px] font-semibold ${
                      isDone ? "text-neutral-400 line-through dark:text-neutral-500" : "text-neutral-950 dark:text-white"
                    }`}
                  >
                    {ritual.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                    {atRisk ? (
                      <span className="font-semibold text-amber-700 dark:text-amber-300">Streak ends tonight</span>
                    ) : (
                      [cadenceLabel, goalLabel].filter(Boolean).join(" · ")
                    )}
                  </span>
                </span>
                <RoutineCompletionControl
                  title={ritual.title}
                  done={isDone}
                  missed={false}
                  onPress={() => onToggle(ritual.id, isDone)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
