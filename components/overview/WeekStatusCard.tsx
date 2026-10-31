"use client";

import type { ReactNode } from "react";
import { IconFlame } from "@tabler/icons-react";
import { WEEK_VERDICT_LABEL, statusTone, type WeekStatus } from "@/lib/overview";
import { CARD, SOFT_PANEL } from "@/components/ui/surfaces";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { TONE_FILL, VERDICT_PILL } from "./tone";

/**
 * "Am I on track this week?" in one card: the verdict, the seven week bars
 * (DESIGN.md's signature instrument — height = completion, today ringed),
 * and one meta line carrying missed and the streak. The streak lives here
 * rather than in a card of its own: it is part of the week's story, and it
 * no longer competes with the one Display number.
 *
 * `compact` is the mobile glance. The full variant adds the tasks/routines
 * split and a slot (`children`) for the desktop capacity check.
 */
export default function WeekStatusCard({
  status,
  compact = false,
  onOpen,
  children,
}: {
  status: WeekStatus;
  compact?: boolean;
  /** Opens the week (Today on mobile, the planner on desktop). */
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const { days, verdict, verdictPct, tasksDone, tasksTotal, routinesPct, missed, streak, hasData } = status;

  if (!hasData) {
    return (
      <section data-testid="overview-week-status" className={`${CARD} p-4`}>
        <p className="text-[14px] font-bold text-neutral-950 dark:text-white">This week</p>
        <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          Nothing is scheduled this week yet. Add a task or routine and your week shows up here.
        </p>
      </section>
    );
  }

  const meta = [
    `${tasksDone} of ${tasksTotal} tasks`,
    missed > 0 ? `${missed} missed` : null,
  ].filter(Boolean).join(" · ");

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-neutral-950 dark:text-white">This week</p>
          {verdict ? (
            <p className="mt-1.5 flex items-baseline gap-2">
              <span className={`font-extrabold leading-none tracking-[-0.03em] tabular-nums text-neutral-950 dark:text-white ${compact ? "text-[30px]" : "text-[40px]"}`}>
                <AnimatedNumber value={verdictPct} />
                <span className={compact ? "text-[17px]" : "text-[22px]"}>%</span>
              </span>
              <span className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">of what&rsquo;s due so far</span>
            </p>
          ) : (
            <p className="mt-1.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Fresh week. Nothing is due yet.</p>
          )}
        </div>
        {verdict && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${VERDICT_PILL[verdict]}`}>
            {WEEK_VERDICT_LABEL[verdict]}
          </span>
        )}
      </div>

      {/* Week bars. Future days are dimmed: they are the plan, not the record. */}
      <div
        className={`grid grid-cols-7 gap-1.5 ${compact ? "mt-3" : "mt-4"}`}
        role="img"
        aria-label={days.map((d) => `${d.label} ${d.done} of ${d.total}`).join(", ")}
      >
        {days.map((day) => (
          <div key={day.day} className={`flex flex-col items-center gap-1.5 ${day.isFuture ? "opacity-45" : ""}`}>
            <div
              className={`relative w-full max-w-[34px] overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.07] ${compact ? "h-12" : "h-16"} ${
                day.isToday ? "ring-2 ring-[#00A63E] ring-offset-2 ring-offset-white dark:ring-[#2FD46E] dark:ring-offset-neutral-900" : ""
              }`}
            >
              <span
                className={`absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-500 motion-reduce:transition-none ${TONE_FILL[statusTone(day.pct)]}`}
                style={{ height: `${day.total > 0 ? Math.max(day.pct, day.pct > 0 ? 8 : 0) : 0}%` }}
              />
            </div>
            <span className="flex flex-col items-center gap-1">
              <span className={`text-[11px] font-bold leading-none ${day.isToday ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"}`}>
                {day.label}
              </span>
              {/* The date itself, so the week can be read without counting back from today. */}
              <span
                className={`text-[13px] font-bold leading-none tabular-nums ${
                  day.isToday ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-800 dark:text-neutral-200"
                }`}
              >
                {Number(day.dateISO.slice(8, 10))}
              </span>
            </span>
            {!compact && (
              <span className="text-[10.5px] font-semibold leading-none tabular-nums text-neutral-500 dark:text-neutral-400">
                {day.done}/{day.total}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-neutral-200/70 pt-3 dark:border-white/[0.07] ${compact ? "mt-3" : "mt-4"}`}>
        <p className="text-[12.5px] font-medium tabular-nums text-neutral-600 dark:text-neutral-400">{meta}</p>
        {streak.streak > 0 && (
          <p
            className={`inline-flex items-center gap-1 text-[12.5px] font-bold tabular-nums ${
              streak.atRisk ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            <IconFlame size={14} strokeWidth={2.2} aria-hidden />
            {streak.atRisk ? `${streak.streak}-day streak · do one thing today` : `${streak.streak}-day streak`}
          </p>
        )}
      </div>

      {!compact && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className={`${SOFT_PANEL} px-3 py-2.5`}>
            <p className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Tasks, whole week</p>
            <p className="mt-0.5 text-[20px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">{status.tasksPct}%</p>
          </div>
          <div className={`${SOFT_PANEL} px-3 py-2.5`}>
            <p className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Routines so far</p>
            <p className="mt-0.5 text-[20px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">{routinesPct}%</p>
          </div>
        </div>
      )}
    </>
  );

  return (
    <section data-testid="overview-week-status" className={`${CARD} ${compact ? "p-0" : "p-4"}`}>
      {compact && onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full rounded-2xl p-4 text-left active:bg-neutral-50 dark:active:bg-white/[0.03]"
        >
          {body}
        </button>
      ) : (
        <div className={compact ? "p-4" : ""}>{body}</div>
      )}
      {children}
    </section>
  );
}
