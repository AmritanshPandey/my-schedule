"use client";

import { IconCheck, IconChevronRight, IconCircleCheck, IconCalendarPlus } from "@tabler/icons-react";
import { formatMinutesBrief, type NextUp } from "@/lib/overview";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";

/**
 * "What do I do next?" — the first answer on every Overview. One open task
 * with its time and plan, and the screen's single affirmative action: mark it
 * done right here. The rest of the row opens Today.
 *
 * `card` is the mobile hero; `strip` sits in the desktop header, where the
 * page below is the weekly review and Today owns the full list.
 */
export default function NextUpCard({
  next,
  variant = "card",
  onMarkDone,
  onToggleSlot,
  onOpenToday,
}: {
  next: NextUp;
  variant?: "card" | "strip";
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onOpenToday: () => void;
}) {
  const strip = variant === "strip";
  const shell = strip
    ? `${CARD} flex min-w-0 items-center gap-1 p-1.5 lg:w-[420px]`
    : `${CARD} flex items-center gap-1 p-2`;

  const open = (
    title: string,
    meta: string,
    label: string,
  ) => (
    <button
      type="button"
      onClick={() => { haptic("light"); onOpenToday(); }}
      className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors active:bg-neutral-50 lg:hover:bg-neutral-50 dark:active:bg-white/[0.04] dark:lg:hover:bg-white/[0.04]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</span>
        <span className={`mt-0.5 block truncate font-bold text-neutral-950 dark:text-white ${strip ? "text-[15px]" : "text-[17px]"}`}>
          {title}
        </span>
        {meta && <span className="mt-0.5 block truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{meta}</span>}
      </span>
      <IconChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
    </button>
  );

  if (next.kind === "empty") {
    return (
      <section data-testid="overview-next-task" className={shell}>
        <span className="ml-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
          <IconCalendarPlus size={20} strokeWidth={2} aria-hidden />
        </span>
        {open("Plan your day", "Nothing is scheduled for today yet", "Next up")}
      </section>
    );
  }

  if (next.kind === "day-done") {
    return (
      <section data-testid="overview-next-task" className={shell}>
        <span className="ml-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/12 dark:text-emerald-400">
          <IconCircleCheck size={22} strokeWidth={2} aria-hidden />
        </span>
        {open("Day complete", `${next.done} of ${next.total} done${next.total > next.done ? " · the rest are logged as missed" : ""}`, "Today")}
      </section>
    );
  }

  const { task, plan, timeLabel, slotIndex, checkableIds, openCount, remainingMinutes } = next;
  const meta = [
    plan?.title,
    openCount > 1 ? `${openCount} left · ${formatMinutesBrief(remainingMinutes)}` : remainingMinutes > 0 ? formatMinutesBrief(remainingMinutes) : "",
  ].filter(Boolean).join(" · ");

  return (
    <section data-testid="overview-next-task" className={shell}>
      <button
        type="button"
        aria-label={`Mark ${task.title} done`}
        onClick={() => {
          haptic("medium");
          if (slotIndex !== undefined) onToggleSlot(task.id, slotIndex);
          else onMarkDone(task.id, checkableIds);
        }}
        // The one affirmative on the screen: a ring that fills Momentum Green
        // on press, the same gesture as checking the row on Today.
        className="group ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-neutral-300 text-neutral-300 transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.94] active:border-[#00A63E] active:bg-[#00A63E] active:text-white motion-reduce:transition-none lg:hover:border-[#00A63E] lg:hover:text-[#00A63E] dark:border-white/25 dark:text-white/30 dark:active:border-[#2FD46E] dark:active:bg-[#2FD46E] dark:active:text-neutral-950 dark:lg:hover:border-[#2FD46E] dark:lg:hover:text-[#2FD46E]"
      >
        <IconCheck size={20} strokeWidth={3} aria-hidden />
      </button>
      {open(task.title, meta, timeLabel ? `Next up · ${timeLabel}` : "Next up")}
    </section>
  );
}
