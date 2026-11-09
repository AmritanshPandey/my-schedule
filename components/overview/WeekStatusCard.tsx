"use client";

import type { ReactNode } from "react";
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { WEEK_VERDICT_LABEL, type WeekDayStatus, type WeekStatus } from "@/lib/overview";
import { CARD, SOFT_PANEL } from "@/components/ui/surfaces";
import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { VERDICT_PILL } from "./tone";

const W = 300;
const H = 96;
const PAD_Y = 8;

/**
 * The week as a line: each day's completion %, Monday to today, with the area
 * under it filled. Days still ahead are left off the line — they are the plan,
 * not the record — and their labels are dimmed.
 */
function WeekLineChart({ days }: { days: WeekDayStatus[] }) {
  const step = W / (days.length - 1);
  const y = (pct: number) => PAD_Y + (1 - pct / 100) * (H - PAD_Y * 2);
  const recorded = days.filter((day) => !day.isFuture);
  const points = recorded.map((day, i) => `${(i * step).toFixed(1)},${y(day.pct).toFixed(1)}`);
  const lastX = (recorded.length - 1) * step;

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-24 w-full overflow-visible text-emerald-500 dark:text-emerald-400"
        role="img"
        aria-label={days.map((d) => `${d.label} ${d.done} of ${d.total}`).join(", ")}
      >
        {[0, 50, 100].map((pct) => (
          <line key={pct} x1={0} x2={W} y1={y(pct)} y2={y(pct)} className="stroke-neutral-200 dark:stroke-white/[0.08]" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {recorded.length > 1 && (
          <>
            <polygon points={`0,${H - PAD_Y} ${points.join(" ")} ${lastX},${H - PAD_Y}`} fill="currentColor" opacity={0.12} />
            <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <div className="mt-2 grid grid-cols-7">
        {days.map((day) => (
          <span key={day.day} className={`flex flex-col items-center gap-0.5 ${day.isFuture ? "opacity-45" : ""}`}>
            <span className={`text-[11px] font-bold ${day.isToday ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-500 dark:text-neutral-400"}`}>
              {day.label}
            </span>
            <span className="text-[10.5px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
              {day.done}/{day.total}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * "Weekly progress": how much of what's been due this week got done, how that
 * compares with last week, and the week's tasks and routines as counts. The
 * desktop review adds the Mon–Sun line and a slot (`children`) for the
 * capacity check; `compact` (phone) keeps the numbers only.
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
  const { days, verdict, verdictPct, tasksDone, tasksTotal, routinesDone, routinesTotal, vsLastWeekPct, hasData } = status;

  if (!hasData) {
    return (
      <section data-testid="overview-week-status" className={`${CARD} p-4`}>
        <p className="text-[16px] font-bold text-neutral-950 dark:text-white">Weekly progress</p>
        <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          Nothing is scheduled this week yet. Add a task or routine and your week shows up here.
        </p>
      </section>
    );
  }

  const up = vsLastWeekPct >= 0;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[16px] font-bold text-neutral-950 dark:text-white">Weekly progress</p>
        {verdict && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${VERDICT_PILL[verdict]}`}>
            {WEEK_VERDICT_LABEL[verdict]}
          </span>
        )}
      </div>

      {verdict ? (
        <>
          <p className="mt-2 font-extrabold leading-none tracking-[-0.03em] tabular-nums text-neutral-950 dark:text-white">
            <span className="text-[40px]"><AnimatedNumber value={verdictPct} /></span>
            <span className="text-[22px]">%</span>
          </p>
          <p className="mt-1 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">of what&rsquo;s been due this week</p>
          {vsLastWeekPct !== 0 && (
            <p
              className={`mt-2 inline-flex items-center gap-1 text-[13px] font-bold tabular-nums ${
                up ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
              }`}
            >
              {up ? <IconTrendingUp size={16} strokeWidth={2.2} aria-hidden /> : <IconTrendingDown size={16} strokeWidth={2.2} aria-hidden />}
              {Math.abs(vsLastWeekPct)}% vs last week
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Fresh week. Nothing is due yet.</p>
      )}

      {!compact && verdict && <WeekLineChart days={days} />}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={`${SOFT_PANEL} px-3 py-2.5`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400">Tasks done</p>
          <p className="mt-1 text-[20px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">
            {tasksDone}/{tasksTotal}
          </p>
        </div>
        <div className={`${SOFT_PANEL} px-3 py-2.5`}>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400">Routine done</p>
          <p className="mt-1 text-[20px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">
            {routinesDone}/{routinesTotal}
          </p>
        </div>
      </div>
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
