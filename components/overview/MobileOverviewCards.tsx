"use client";

/**
 * The phone Overview's cards, in the order the screen reads: what to do now
 * (hero), what slipped (Needs attention), what to log (Check-ins due), where
 * the day goes (Your day), and how the week is going (This week). Desktop
 * keeps its own review layout; these are the thumb-first versions.
 */
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconCalendarCheck,
  IconCheck,
  IconChevronRight,
  IconClockExclamation,
  IconFlag,
  IconFlame,
  IconListCheck,
  IconPlus,
  IconTrendingDown,
  IconX,
} from "@tabler/icons-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import { haptic } from "@/lib/haptics";
import { formatDateShort, todayISO } from "@/lib/dateUtils";
import { bandRangeLabel } from "@/lib/slotReliability";
import {
  formatDaysAgo,
  formatDaysBehind,
  formatDaysOverdue,
  formatReliabilityRate,
  type MissedTask,
  type NeedsAttention,
  type UnreliableSlotTask,
} from "@/lib/needsAttention";
import { milestoneOverdueKey, milestoneRiskKey, ritualAttentionKey, slotRiskKey } from "@/lib/attentionDismissal";
import { checkInStatusLabel, type DueCheckIn } from "@/lib/trackerCadence";
import { formatMinutesBrief, WEEK_VERDICT_LABEL, type NextUp, type WeekStatus } from "@/lib/overview";
import type { DayShape } from "@/lib/dayShape";
import type { ExecutionStreak } from "@/lib/consistency/calculateExecutionStreak";
import type { ProgressTracker } from "@/lib/useScheduleDB";
import { taskDurationMinutes } from "@/lib/intelligence/taskStats";
import { VERDICT_PILL } from "./tone";

/** The phone Overview's card: white on the page tint, no border, generous radius. */
export const MOBILE_CARD = "rounded-[26px] bg-white p-5 dark:bg-neutral-900";

function CountBadge({ count }: { count: number }) {
  return (
    <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-neutral-100 px-2 text-[14px] font-semibold tabular-nums text-neutral-900 dark:bg-white/[0.08] dark:text-white">
      {count}
    </span>
  );
}

function CardTitle({ icon: Icon, title, trailing, id }: { icon?: typeof IconFlag; title: string; trailing?: React.ReactNode; id: string }) {
  return (
    <div className="flex items-center gap-3">
      {Icon && <Icon size={22} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-neutral-900 dark:text-white" />}
      <h2 id={id} className="min-w-0 flex-1 truncate text-[17px] font-semibold text-neutral-950 dark:text-white">{title}</h2>
      {trailing}
    </div>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

function StreakBadge({ streak }: { streak: ExecutionStreak }) {
  if (streak.streak <= 0) return null;
  return (
    <span
      data-testid="overview-streak"
      title={streak.atRisk ? "Do one thing today to keep it" : undefined}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-3.5 py-1.5 text-[14px] font-semibold text-white"
    >
      <IconFlame size={18} strokeWidth={2} aria-hidden="true" />
      {streak.streak}-day streak
    </span>
  );
}

/**
 * Today at a glance and the one thing to do now: the date and streak, the
 * day's progress, and the next open task with Mark done right under it.
 */
export function OverviewHero({
  next,
  subtasks,
  streak,
  onMarkDone,
  onToggleSlot,
  onOpenTask,
  onOpenToday,
  onAddTask,
}: {
  next: NextUp;
  /** The next task's checklist progress, or null when it has none. */
  subtasks: { done: number; total: number } | null;
  streak: ExecutionStreak;
  onMarkDone: (taskId: string, checkableIds: string[]) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onOpenTask: (taskId: string) => void;
  onOpenToday: () => void;
  onAddTask: () => void;
}) {
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const done = next.kind === "empty" ? 0 : next.done;
  const total = next.kind === "empty" ? 0 : next.total;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <section aria-labelledby="overview-hero-date" className={MOBILE_CARD}>
      <div className="flex items-center justify-between gap-3">
        <p id="overview-hero-date" className="text-[16px] font-medium text-neutral-900 dark:text-white">{dateLabel}</p>
        <StreakBadge streak={streak} />
      </div>

      {total > 0 && (
        <div className="mt-5 flex items-center gap-3">
          <div
            role="progressbar"
            aria-label="Today's progress"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.08]"
          >
            <div className="h-full rounded-full bg-amber-600 transition-[width] duration-500 motion-reduce:transition-none dark:bg-amber-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[12px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
            {done} of {total} done
          </span>
        </div>
      )}

      {next.kind === "task" ? (
        <>
          <div className="mt-5 flex items-center justify-between gap-3 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            <span>Next up{next.timeLabel ? ` · ${next.timeLabel}` : ""}</span>
            {taskDurationMinutes(next.task) > 0 && <span>Duration: {formatMinutesBrief(taskDurationMinutes(next.task))}</span>}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <h3 className="min-w-0 text-[28px] font-bold leading-tight tracking-[-0.02em] text-neutral-950 dark:text-white">{next.task.title}</h3>
            {subtasks && (
              <button
                type="button"
                onClick={() => { haptic("light"); onOpenTask(next.task.id); }}
                aria-label={`Open ${next.task.title}`}
                className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-4 text-[14px] font-semibold tabular-nums text-neutral-600 active:scale-[0.97] dark:bg-white/[0.08] dark:text-neutral-300"
              >
                <IconListCheck size={18} strokeWidth={1.9} aria-hidden="true" />
                {subtasks.done}/{subtasks.total}
                <IconArrowUpRight size={18} strokeWidth={1.9} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="mt-4 flex gap-3 border-t border-neutral-100 pt-4 dark:border-white/[0.07]">
            <Button
              variant="primary"
              size="lg"
              className="flex-[1.7]"
              icon={<IconCheck size={20} strokeWidth={2.4} aria-hidden="true" />}
              onClick={() => {
                haptic("medium");
                if (next.slotIndex !== undefined) onToggleSlot(next.task.id, next.slotIndex);
                else onMarkDone(next.task.id, next.checkableIds);
              }}
            >
              Mark done
            </Button>
            <Button variant="secondary" size="lg" className="flex-1" trailingIcon={<IconChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />} onClick={() => { haptic("light"); onOpenToday(); }}>
              Today
            </Button>
          </div>
        </>
      ) : next.kind === "day-done" ? (
        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[24px] font-bold leading-tight text-neutral-950 dark:text-white">Day done</h3>
            <p className="mt-0.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Everything on today&apos;s list is finished.</p>
          </div>
          <Button variant="secondary" size="md" trailingIcon={<IconChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />} onClick={() => { haptic("light"); onOpenToday(); }}>
            Today
          </Button>
        </div>
      ) : (
        <>
          <h3 className="mt-5 text-[24px] font-bold leading-tight text-neutral-950 dark:text-white">Plan your day</h3>
          <p className="mt-0.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Nothing is scheduled for today yet.</p>
          <Button variant="primary" size="lg" fullWidth className="mt-4" icon={<IconPlus size={20} strokeWidth={2.2} aria-hidden="true" />} onClick={() => { haptic("light"); onAddTask(); }}>
            Add a task
          </Button>
        </>
      )}
    </section>
  );
}

// ── Needs attention ─────────────────────────────────────────────────────────

const ATTENTION_ROWS = 2;

/**
 * What slipped, worst-recoverable first (a routine run still savable today
 * leads; a past miss is history). Each row opens its fix; × dismisses it for
 * today, and Clear all dismisses every row it can. A missed task has its own
 * recovery sheet, so it has no ×.
 */
export function AttentionCard({
  data,
  onNavigate,
  onHandleMissed,
  onAdaptMilestone,
  onReviewUnreliableSlot,
  onClearAll,
  onDismissOne,
}: {
  data: NeedsAttention;
  onNavigate: (tab: number) => void;
  onHandleMissed: (missed: MissedTask) => void;
  onAdaptMilestone: (milestoneId: string) => void;
  onReviewUnreliableSlot: (row: UnreliableSlotTask) => void;
  onClearAll: () => void;
  onDismissOne: (key: string) => void;
}) {
  if (data.total === 0) return null;
  const today = todayISO();

  const rows = [
    ...data.atRiskRituals.map((row) => ({
      key: `r:${row.ritual.id}`,
      icon: IconFlame,
      title: row.ritual.title,
      status: "Not done",
      detail: `${row.streak}-day run ends tonight`,
      onOpen: () => onNavigate(2),
      dismissKey: ritualAttentionKey(row.ritual.id, today) as string | null,
    })),
    ...data.unreliableSlotTasks.map((row) => ({
      key: `slot:${row.task.id}`,
      icon: IconClockExclamation,
      title: row.task.title,
      status: formatReliabilityRate(row.from.rate),
      detail: `${bandRangeLabel(row.from.band)} rarely finishes`,
      onOpen: () => onReviewUnreliableSlot(row),
      dismissKey: slotRiskKey(row.task.id, today) as string | null,
    })),
    ...data.atRiskMilestones.map((row) => ({
      key: `am:${row.milestone.id}`,
      icon: IconTrendingDown,
      title: row.milestone.title,
      status: row.daysBehind ? formatDaysBehind(row.daysBehind) : "Off pace",
      detail: row.forecastDate ? `Projects ${formatDateShort(row.forecastDate)}` : row.plan?.title ?? "Milestone",
      onOpen: () => onAdaptMilestone(row.milestone.id),
      dismissKey: milestoneRiskKey(row.milestone.id, row.milestone.plannedEndDate) as string | null,
    })),
    ...data.overdueMilestones.map((row) => ({
      key: `m:${row.milestone.id}`,
      icon: IconFlag,
      title: row.milestone.title,
      status: formatDaysOverdue(row.daysOverdue),
      detail: row.plan?.title ?? "Milestone",
      onOpen: () => onAdaptMilestone(row.milestone.id),
      dismissKey: milestoneOverdueKey(row.milestone.id, row.milestone.plannedEndDate) as string | null,
    })),
    ...data.missedTasks.map((row) => ({
      key: `t:${row.task.id}:${row.dateISO}`,
      icon: IconX,
      title: row.task.title,
      status: "Not done",
      detail: `Missed ${formatDaysAgo(row.daysAgo)}`,
      onOpen: () => onHandleMissed(row),
      dismissKey: null as string | null,
    })),
  ];
  const visible = rows.slice(0, ATTENTION_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <section data-testid="overview-needs-attention" aria-labelledby="overview-attention-title" className={MOBILE_CARD}>
      <CardTitle
        id="overview-attention-title"
        icon={IconAlertTriangle}
        title="Needs attention"
        trailing={
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => { haptic("light"); onClearAll(); }}>
              Clear all
            </Button>
            <CountBadge count={rows.length} />
          </div>
        }
      />
      <ul className="mt-3 divide-y divide-neutral-100 dark:divide-white/[0.07]">
        {visible.map(({ key, icon: Icon, title, status, detail, onOpen, dismissKey }) => (
          <li key={key} className="flex items-center gap-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
              <Icon size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <button
              type="button"
              onClick={() => { haptic("light"); onOpen(); }}
              className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
              aria-label={`${title}: ${status}, ${detail}`}
            >
              <span className="min-w-0 flex-1 truncate text-[16px] font-medium text-neutral-950 dark:text-white">{title}</span>
              <span className="shrink-0 text-[14px] font-semibold text-amber-700 dark:text-amber-400">{status}</span>
              <IconArrowUpRight size={20} strokeWidth={1.9} aria-hidden="true" className="shrink-0 text-neutral-700 dark:text-neutral-300" />
            </button>
            {dismissKey ? (
              <IconButton label={`Dismiss ${title}`} variant="ghost" size="md" onClick={() => { haptic("light"); onDismissOne(dismissKey); }}>
                <IconX size={19} strokeWidth={2} />
              </IconButton>
            ) : (
              <span className="w-10 shrink-0" aria-hidden="true" />
            )}
          </li>
        ))}
      </ul>
      {hidden > 0 && <p className="mt-1 text-[15px] font-medium text-neutral-500 dark:text-neutral-400">+{hidden} more</p>}
    </section>
  );
}

// ── Check-ins due ───────────────────────────────────────────────────────────

/** Trackers waiting on an entry this period, each with its own + Log. */
export function CheckInsCard({
  rows,
  limit = 3,
  onLog,
  onOpenTracking,
}: {
  rows: DueCheckIn[];
  limit?: number;
  onLog: (tracker: ProgressTracker) => void;
  onOpenTracking: () => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section data-testid="overview-check-ins" aria-labelledby="overview-checkins-title" className={MOBILE_CARD}>
      <CardTitle id="overview-checkins-title" icon={IconCalendarCheck} title="Check-ins due" trailing={<CountBadge count={rows.length} />} />
      <ul className="mt-2 divide-y divide-neutral-100 dark:divide-white/[0.07]">
        {rows.slice(0, limit).map(({ tracker, state }) => (
          <li key={tracker.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-medium text-neutral-950 dark:text-white">{tracker.title}</p>
              <p className={`mt-0.5 truncate text-[14px] font-semibold ${state.overdue ? "text-rose-700 dark:text-rose-400" : "text-amber-700 dark:text-amber-400"}`}>
                {checkInStatusLabel(state)}
              </p>
            </div>
            <Button
              variant="secondary"
              size="md"
              aria-label={`Log ${tracker.title}`}
              icon={<IconPlus size={18} strokeWidth={2.2} aria-hidden="true" />}
              onClick={() => { haptic("light"); onLog(tracker); }}
            >
              Log
            </Button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => { haptic("light"); onOpenTracking(); }}
        className="mt-1 flex min-h-[44px] items-center gap-1 text-[15px] font-medium text-neutral-500 dark:text-neutral-400"
      >
        Open Tracking
        <IconChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </button>
    </section>
  );
}

// ── Your day ────────────────────────────────────────────────────────────────

function clockLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

const NEUTRAL_BLOCK = "#A3A3A3";

/**
 * Today's blocks on one bar, with a line at now, and the biggest kinds of
 * time under it. Planned vs free is counted inside the bar's window.
 */
export function YourDayCard({ shape, nowMinutes }: { shape: DayShape; nowMinutes: number }) {
  if (shape.blocks.length === 0) return null;
  const span = shape.windowEnd - shape.windowStart;
  const at = (m: number) => `${(((m - shape.windowStart) / span) * 100).toFixed(2)}%`;
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => shape.windowStart + Math.round((span * f) / 60) * 60);
  const legend = shape.legend.slice(0, 3);
  const more = shape.legend.length - legend.length;
  const nowInside = nowMinutes > shape.windowStart && nowMinutes < shape.windowEnd;

  return (
    <section data-testid="overview-your-day" aria-labelledby="overview-day-title" className={MOBILE_CARD}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="overview-day-title" className="text-[17px] font-semibold text-neutral-950 dark:text-white">Your day</h2>
        <p className="truncate text-[14px] font-medium text-neutral-500 dark:text-neutral-400">
          {formatMinutesBrief(shape.plannedMinutes)} planned · {formatMinutesBrief(shape.freeMinutes)} free
        </p>
      </div>
      <div
        role="img"
        aria-label={shape.blocks.map((b) => `${b.title} ${clockLabel(b.start)}`).join(", ")}
        className="relative mt-4 h-12 rounded-2xl bg-neutral-100 dark:bg-white/[0.06]"
      >
        {shape.blocks.map((block) => (
          <span
            key={block.id}
            className="absolute inset-y-1 rounded-xl"
            style={{
              left: at(Math.max(block.start, shape.windowStart)),
              width: `calc(${(((Math.min(block.end, shape.windowEnd) - Math.max(block.start, shape.windowStart)) / span) * 100).toFixed(2)}% - 2px)`,
              background: block.color ?? NEUTRAL_BLOCK,
            }}
          />
        ))}
        {nowInside && <span aria-hidden="true" className="absolute -inset-y-1 w-[3px] rounded-full bg-neutral-950 dark:bg-white" style={{ left: at(nowMinutes) }} />}
      </div>
      <div className="mt-2 flex justify-between text-[13px] font-medium text-neutral-600 dark:text-neutral-400">
        {ticks.map((t) => <span key={t}>{clockLabel(t)}</span>)}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {legend.map((row) => (
          <li key={row.id} className="flex items-center gap-2 text-[14px]">
            <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full" style={{ background: row.color ?? NEUTRAL_BLOCK }} />
            <span className="font-medium text-neutral-950 dark:text-white">{row.label}</span>
            <span className="text-neutral-500 dark:text-neutral-400">{formatMinutesBrief(row.minutes)}</span>
          </li>
        ))}
        {more > 0 && <li className="text-[14px] font-medium text-neutral-500 dark:text-neutral-400">+{more} more</li>}
      </ul>
    </section>
  );
}

// ── This week ───────────────────────────────────────────────────────────────

/**
 * The week so far as one figure (how much of what was due got done) and a
 * capsule per day, filled to that day's completion: green when it all got
 * done, amber for part, rose when it was all missed; days ahead stay empty
 * and today is ringed.
 */
export function WeekBarsCard({ status, onOpenDay }: { status: WeekStatus; onOpenDay: (dateISO: string) => void }) {
  if (!status.hasData) return null;
  return (
    <section data-testid="overview-week" aria-labelledby="overview-week-title" className={MOBILE_CARD}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="overview-week-title" className="text-[17px] font-semibold text-neutral-950 dark:text-white">This week</h2>
        {status.verdict && (
          <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${VERDICT_PILL[status.verdict]}`}>{WEEK_VERDICT_LABEL[status.verdict]}</span>
        )}
      </div>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums text-neutral-950 dark:text-white">
          {status.verdictPct}<span className="text-[30px]">%</span>
        </span>
        <span className="text-[15px] font-medium text-neutral-700 dark:text-neutral-300">of what&apos;s due so far</span>
      </p>
      <div className="mt-5 grid grid-cols-7 gap-2">
        {status.days.map((day) => {
          const fill = day.isFuture || day.total === 0 ? 0 : Math.max(day.pct, day.missed > 0 && day.done === 0 ? 100 : 0);
          const color =
            day.done === 0 && day.missed > 0 ? "bg-rose-500"
            : day.pct >= 100 ? "bg-emerald-600"
            : "bg-amber-500";
          return (
            <button
              key={day.day}
              type="button"
              onClick={() => { haptic("light"); onOpenDay(day.dateISO); }}
              aria-label={`${day.label}: ${day.done} of ${day.total} done${day.missed ? `, ${day.missed} missed` : ""}`}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`relative flex h-16 w-full items-end overflow-hidden rounded-full border ${
                  day.isToday ? "border-emerald-600 ring-2 ring-emerald-600/20 dark:border-emerald-400" : "border-neutral-200 dark:border-white/[0.12]"
                }`}
              >
                {fill > 0 && <span className={`w-full rounded-full ${color}`} style={{ height: `${Math.max(fill, 18)}%` }} />}
              </span>
              <span className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{day.label}</span>
              <span className="-mt-1 text-[15px] font-semibold tabular-nums text-neutral-950 dark:text-white">{Number(day.dateISO.slice(8, 10))}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 border-t border-neutral-100 pt-3 text-[14px] font-medium text-neutral-500 dark:border-white/[0.07] dark:text-neutral-400">
        {status.tasksDone} of {status.tasksTotal} tasks
      </p>
    </section>
  );
}
