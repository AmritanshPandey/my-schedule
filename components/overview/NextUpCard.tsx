"use client";

import { IconCheck, IconChevronRight, IconCircleCheck, IconCalendarPlus, IconFlame } from "@tabler/icons-react";
import type { ExecutionStreak } from "@/lib/consistency/calculateExecutionStreak";
import { formatMinutesBrief, type NextUp } from "@/lib/overview";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";
import Button from "@/components/ui/Button";

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
  streak,
  onMarkDone,
  onToggleSlot,
  onOpenToday,
  onAddTask,
}: {
  next: NextUp;
  variant?: "card" | "strip";
  /** Shown in the phone hero beside the date, so the reward sits with the next action. */
  streak?: ExecutionStreak;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onOpenToday: () => void;
  /** The empty day's "Add a task" opens the new-task sheet here instead of sending you to Today. */
  onAddTask?: () => void;
}) {
  const strip = variant === "strip";
  if (!strip) return <NextUpHero next={next} streak={streak} onMarkDone={onMarkDone} onToggleSlot={onToggleSlot} onOpenToday={onOpenToday} onAddTask={onAddTask} />;
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

/**
 * The phone Overview's focal point: today's date and streak, today's
 * progress, the next task as the headline, and Mark done as a real button.
 * A raised white card (the one hero shadow on the screen, DESIGN.md) so the
 * eye lands here first; green is spent only on the progress fill, a live
 * streak, and the affirmative action (One Signal Rule).
 */
function NextUpHero({
  next,
  streak,
  onMarkDone,
  onToggleSlot,
  onOpenToday,
  onAddTask,
}: {
  next: NextUp;
  streak?: ExecutionStreak;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onOpenToday: () => void;
  onAddTask?: () => void;
}) {
  const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const done = next.kind === "empty" ? 0 : next.done;
  const total = next.kind === "empty" ? 0 : next.total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  let label: string;
  let title: string;
  let meta: string;
  if (next.kind === "task") {
    const { task, plan, timeLabel, openCount, remainingMinutes } = next;
    label = timeLabel ? `Next up · ${timeLabel}` : "Next up";
    title = task.title;
    meta = [
      plan?.title,
      openCount > 1 ? `${openCount} left · ${formatMinutesBrief(remainingMinutes)}` : remainingMinutes > 0 ? formatMinutesBrief(remainingMinutes) : "",
    ].filter(Boolean).join(" · ");
  } else if (next.kind === "day-done") {
    label = "Today";
    title = "Day complete";
    meta = next.total > next.done ? "The rest are logged as missed." : "Everything on today's list is done.";
  } else {
    label = "Next up";
    title = "Plan your day";
    meta = "Nothing is scheduled for today yet.";
  }

  return (
    <section
      data-testid="overview-next-task"
      data-glass
      className="rounded-[24px] bg-white p-5 shadow-hero ring-1 ring-neutral-200/70 dark:bg-neutral-900 dark:ring-white/[0.08]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">{dateLabel}</p>
        {streak && streak.streak > 0 && (
          <p
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums ${
              streak.atRisk
                ? "bg-amber-500/12 text-amber-800 dark:bg-amber-400/12 dark:text-amber-300"
                : "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400"
            }`}
            title={streak.atRisk ? "Do one thing today to keep it" : undefined}
          >
            <IconFlame size={14} strokeWidth={2.2} aria-hidden />
            {streak.streak}-day streak
          </p>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</p>
          <h2 className="mt-1 line-clamp-2 text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] text-neutral-950 [text-wrap:balance] dark:text-white">{title}</h2>
          {meta && <p className="mt-1.5 truncate text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{meta}</p>}
        </div>
        {next.kind === "day-done" && (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/12 dark:text-emerald-400">
            <IconCircleCheck size={24} strokeWidth={2} aria-hidden />
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <div
            className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10"
            role="progressbar"
            aria-label="Today's progress"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-[#00A63E] transition-[width] duration-500 ease-out motion-reduce:transition-none dark:bg-[#2FD46E]" style={{ width: `${pct}%` }} />
          </div>
          <p className="shrink-0 text-[12px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
            {done} of {total} done
          </p>
        </div>
      )}

      <div className="mt-5 flex items-center gap-2">
        {next.kind === "task" ? (
          <>
            <Button
              variant="cta"
              onClick={() => {
                haptic("medium");
                if (next.slotIndex !== undefined) onToggleSlot(next.task.id, next.slotIndex);
                else onMarkDone(next.task.id, next.checkableIds);
              }}
              icon={<IconCheck size={18} strokeWidth={3} aria-hidden />}
              className="min-w-0 flex-1"
            >
              Mark done
            </Button>
            <Button
              variant="secondary"
              onClick={() => { haptic("light"); onOpenToday(); }}
              trailingIcon={<IconChevronRight size={18} strokeWidth={2.4} aria-hidden />}
            >
              Today
            </Button>
          </>
        ) : next.kind === "empty" ? (
          <Button
            variant="primary"
            onClick={() => { haptic("light"); (onAddTask ?? onOpenToday)(); }}
            icon={<IconCalendarPlus size={18} strokeWidth={2.4} aria-hidden />}
            className="min-w-0 flex-1"
          >
            Add a task
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => { haptic("light"); onOpenToday(); }}
            trailingIcon={<IconChevronRight size={18} strokeWidth={2.4} aria-hidden />}
          >
            Open Today
          </Button>
        )}
      </div>
    </section>
  );
}
