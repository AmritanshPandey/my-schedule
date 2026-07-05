"use client";

import { useCallback, useMemo, useState, type ComponentType } from "react";
import {
  IconArrowRight,
  IconArrowUpRight,
  IconCalendarEvent,
  IconChartLine,
  IconCheck,
  IconChecklist,
  IconClipboardList,
  IconListCheck,
  IconFlame,
  IconMinus,
  IconPlus,
  IconRepeat,
  IconSparkles,
  IconTarget,
  IconTrendingDown,
  IconTrendingUp,
  IconX,
} from "@tabler/icons-react";
import type { DayKey, Plan, ProgressTracker, Schedule, Task } from "@/lib/useScheduleDB";
import { getTaskCheckableItems, getTaskSubtaskSummary, isTaskCompleted, isTaskResolved } from "@/lib/taskCompletion";
import { getPlanCardStats } from "@/lib/planInsights";
import { accentStyles } from "@/lib/colorSystem";
import ExecutionTrendCard from "@/components/ExecutionTrendCard";
import { getTrendDirection, getTrendState, type TrendDirection, type TrendState } from "@/lib/trendUtils";
import { addDaysToISO, localISODate } from "@/lib/dateUtils";
import { parseTimeToMinutes, toScheduleDayMinutes } from "@/lib/timeUtils";
import { calculateExecutionStreak, type ExecutionStreak } from "@/lib/consistency/calculateExecutionStreak";
import { isTaskScheduledOn } from "@/lib/taskOccurrence";
import { haptic } from "@/lib/haptics";

interface OverviewDashboardProps {
  schedule: Schedule;
  todayKey: DayKey;
  onNavigate: (tab: number) => void;
  onMarkTaskDone: (taskId: string, subtaskIds: string[]) => void;
  onMissedTask: (taskId: string, subtaskIds: string[]) => void;
  onOpenSubtasks?: (taskId: string) => void;
  completedRitualIds: Set<string>;
  onLogTracker: (tracker: ProgressTracker) => void;
}

const DAYS_ORDER: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const JS_DAY_KEYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const CARD = "rounded-2xl border border-neutral-200/70 bg-white dark:border-white/[0.08] dark:bg-[#171717]";
const SOFT_PANEL = "rounded-xl border border-neutral-200/70 bg-neutral-50 dark:border-white/[0.07] dark:bg-white/[0.04]";

type TaskSummary = ReturnType<typeof getTaskSubtaskSummary>;
type TrackerRow = {
  tracker: ProgressTracker;
  latest?: { value: number };
  trend: { direction: TrendDirection; state: TrendState } | null;
  plan?: Plan;
};

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ratioPct(done: number, total: number): number {
  return total > 0 ? clampPct((done / total) * 100) : 0;
}

function progressFillClass(pct: number): string {
  if (pct >= 70) return "bg-emerald-500";
  if (pct >= 35) return "bg-amber-400";
  if (pct > 0) return "bg-rose-400";
  return "bg-neutral-300 dark:bg-white/15";
}

function formatTime(t?: string): string {
  if (!t) return "";
  const mins = parseTimeToMinutes(t);
  if (mins === null) return t;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function TrendArrow({ direction, state }: { direction: TrendDirection; state: TrendState }) {
  const Icon = direction === "up" ? IconTrendingUp : direction === "down" ? IconTrendingDown : IconMinus;
  const color =
    state === "positive" ? "text-emerald-500" :
    state === "negative" ? "text-rose-500" :
    "text-neutral-400 dark:text-neutral-500";
  return <Icon size={16} strokeWidth={2.4} className={`shrink-0 ${color}`} />;
}

function SectionHeader({
  icon: Icon,
  title,
  meta,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  meta?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={15} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
        <p className="truncate text-[13px] font-bold text-neutral-800 dark:text-neutral-200">{title}</p>
      </div>
      {meta && (
        <span className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-[11px] font-bold tabular-nums text-neutral-500 dark:border-white/[0.09] dark:bg-white/[0.04] dark:text-neutral-400">
          {meta}
        </span>
      )}
    </div>
  );
}

function ProgressTrack({
  pct,
  height = 6,
  fillClassName,
}: {
  pct: number;
  height?: number;
  fillClassName?: string;
}) {
  const width = pct <= 0 ? 0 : Math.max(6, clampPct(pct));
  return (
    <span className="block w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/[0.10]" style={{ height }}>
      <span
        className={`block h-full rounded-full ${fillClassName ?? progressFillClass(pct)}`}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

function DashboardMetricCard({
  label,
  value,
  detail,
  pct,
  primary = false,
  icon: Icon,
  iconClass,
}: {
  label: string;
  value: string;
  detail: string;
  pct?: number;
  primary?: boolean;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  iconClass?: string;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${
        primary
          ? "border-[#0B6B3A] bg-[#0B6B3A] text-white dark:border-emerald-400/25 dark:bg-[#143A27]"
          : "border-neutral-200/70 bg-white text-neutral-950 dark:border-white/[0.08] dark:bg-[#171717] dark:text-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            primary
              ? "bg-white/15 text-white"
              : iconClass ?? "bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400"
          }`}
        >
          <Icon size={18} strokeWidth={2} />
        </span>
        <IconArrowUpRight size={16} strokeWidth={2.2} className={primary ? "text-white/80" : "text-neutral-300 dark:text-neutral-600"} />
      </div>
      <p className={`mt-3 text-[12px] font-bold uppercase tracking-[0.08em] ${primary ? "text-white/70" : "text-neutral-400 dark:text-neutral-500"}`}>
        {label}
      </p>
      <p className="mt-1 text-[34px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{value}</p>
      <p className={`mt-2 text-[12px] font-medium ${primary ? "text-white/75" : "text-neutral-500 dark:text-neutral-400"}`}>{detail}</p>
      {pct !== undefined && (
        <ProgressTrack
          pct={pct}
          height={5}
          fillClassName={primary ? "bg-white" : undefined}
        />
      )}
    </div>
  );
}

function streakDetail(streak: ExecutionStreak): string {
  if (streak.atRisk) return "At risk — act today";
  if (streak.milestone) return "New milestone reached";
  if (streak.streak === 0) return "Start your run today";
  if (streak.streak === 1) return "1 day — keep going";
  return `${streak.streak} days strong`;
}

function StatGrid({
  tasksDone,
  tasksTotal,
  weekPct,
  plans,
  trackers,
  streak,
}: {
  tasksDone: number;
  tasksTotal: number;
  weekPct: number;
  plans: number;
  trackers: number;
  streak: ExecutionStreak;
}) {
  const taskPct = ratioPct(tasksDone, tasksTotal);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <DashboardMetricCard
        primary
        icon={IconChecklist}
        label="Tasks Today"
        value={`${tasksDone}/${tasksTotal}`}
        detail={`${taskPct}% complete`}
        pct={taskPct}
      />
      <DashboardMetricCard
        icon={IconCalendarEvent}
        label="This Week"
        value={`${weekPct}%`}
        detail="tasks completed"
        pct={weekPct}
      />
      <DashboardMetricCard
        icon={IconFlame}
        iconClass={
          streak.atRisk
            ? "bg-amber-500/12 text-amber-500 dark:bg-amber-400/12 dark:text-amber-400"
            : "bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/12 dark:text-emerald-400"
        }
        label="Streak"
        value={String(streak.streak)}
        detail={streakDetail(streak)}
      />
      <DashboardMetricCard
        icon={IconClipboardList}
        label="Plans"
        value={String(plans)}
        detail={plans === 1 ? "active plan" : "active plans"}
      />
      <DashboardMetricCard
        icon={IconTarget}
        label="Trackers"
        value={String(trackers)}
        detail={trackers === 1 ? "metric tracked" : "metrics tracked"}
      />
    </div>
  );
}

function ThisWeekCard({
  activity,
}: {
  activity: {
    days: { label: string; total: number; done: number; isToday: boolean; pct: number }[];
    tasksPct: number;
    habitsPct: number;
  } | null;
}) {
  if (!activity) return null;
  return (
    <section data-testid="overview-week-card" className={`${CARD} px-4 py-4`}>
      <SectionHeader icon={IconCalendarEvent} title="This Week" meta={`${activity.tasksPct}% tasks`} />
      <div className="grid grid-cols-7 gap-2">
        {activity.days.map(({ label, total, done, pct, isToday }) => (
          <div key={label} className={`rounded-xl border px-2 py-2 ${isToday ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/[0.08]" : "border-neutral-200/70 bg-neutral-50 dark:border-white/[0.07] dark:bg-white/[0.04]"}`}>
            <p className={`text-center text-[10px] font-bold ${isToday ? "text-emerald-700 dark:text-emerald-300" : "text-neutral-400 dark:text-neutral-500"}`}>{label}</p>
            <div className="mt-2">
              <ProgressTrack pct={pct} height={4} />
            </div>
            <p className="mt-1.5 text-center text-[10px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
              {done}/{total}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className={SOFT_PANEL + " px-3 py-3"}>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Tasks Done</p>
          <p className="mt-1 text-[24px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">
            {activity.tasksPct}<span className="text-[14px]">%</span>
          </p>
        </div>
        <div className={SOFT_PANEL + " px-3 py-3"}>
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Habits Done</p>
          <p className="mt-1 text-[24px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">
            {activity.habitsPct}<span className="text-[14px]">%</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function ActiveTrackingCard({
  rows,
  onNavigate,
  onLogTracker,
}: {
  rows: TrackerRow[];
  onNavigate: (tab: number) => void;
  onLogTracker: (tracker: ProgressTracker) => void;
}) {
  return (
    <section data-testid="overview-tracking-card" className={`${CARD} px-4 py-4`}>
      <SectionHeader icon={IconTarget} title="Active Tracking" meta={rows.length > 0 ? `${rows.length}` : undefined} />
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-5 text-center dark:border-white/[0.09]">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
            <IconChartLine size={21} strokeWidth={2} />
          </span>
          <p className="mt-3 text-[14px] font-bold text-neutral-900 dark:text-white">No trackers yet</p>
          <p className="mx-auto mt-1 max-w-[250px] text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
            Track metrics like pages, distance, or revenue to make progress visible here.
          </p>
          <button
            type="button"
            onClick={() => { haptic("light"); onNavigate(1); }}
            className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-full border border-neutral-200 px-4 text-[13px] font-bold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-300 dark:hover:bg-white/[0.05]"
          >
            Set up tracking
            <IconArrowRight size={14} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
          {rows.map(({ tracker, latest, trend, plan }) => {
            const accent = accentStyles(plan?.color ?? "cyan");
            return (
              <div key={tracker.id} className="flex items-center gap-3 py-3">
                <span className={`h-3 w-3 shrink-0 rounded-full ${accent.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[15px] font-bold leading-tight text-neutral-950 dark:text-white">{tracker.title}</p>
                    {trend && <TrendArrow direction={trend.direction} state={trend.state} />}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                    {latest ? `${latest.value}${tracker.unit ?? ""}` : "No entries yet"}
                    {plan ? ` - ${plan.title}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Log ${tracker.title}`}
                  onClick={() => { haptic("light"); onLogTracker(tracker); }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-neutral-950 text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
                >
                  <IconPlus size={18} strokeWidth={2.5} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function RoutineConsistencyCard({
  rows,
}: {
  rows: { ritual: { id: string; title: string; time: string }; streak: number; dots: boolean[] }[];
}) {
  if (rows.length === 0) return null;
  return (
    <section data-testid="overview-routine-card" className={`${CARD} px-4 py-4`}>
      <SectionHeader icon={IconRepeat} title="Routine Consistency" meta={`${rows.length}`} />
      <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
        {rows.map(({ ritual, streak, dots }) => (
          <div key={ritual.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-neutral-950 dark:text-white">
                {ritual.title}
                {ritual.time && <span className="ml-1.5 font-semibold text-neutral-400 dark:text-neutral-500">{ritual.time}</span>}
              </p>
              {streak > 0 && (
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 dark:text-rose-400">
                  <IconFlame size={12} strokeWidth={2} />
                  {streak}d streak
                </span>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              {dots.map((on, i) => (
                <span key={i} className={`h-2.5 w-2.5 rounded-full ${on ? "bg-emerald-500" : "bg-neutral-200 dark:bg-white/[0.10]"}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlanConsistencyCard({
  rows,
  onNavigate,
}: {
  rows: { plan: Plan; consistency: number; milestonesTotal: number; milestonesDone: number }[];
  onNavigate: (tab: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section data-testid="overview-plan-card" className={`${CARD} px-4 py-4 lg:min-h-[520px]`}>
      <SectionHeader icon={IconClipboardList} title="Plan Consistency" meta={`${rows.length} plans`} />
      <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
        {rows.map(({ plan, consistency, milestonesTotal, milestonesDone }) => {
          const accent = accentStyles(plan.color);
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => { haptic("light"); onNavigate(1); }}
              className="grid w-full grid-cols-[minmax(0,1fr)_90px] items-center gap-4 py-3.5 text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent.dot}`} />
                  <p className="truncate text-[15px] font-bold text-neutral-950 dark:text-white">{plan.title}</p>
                </div>
                <p className="mt-1 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
                  {milestonesTotal > 0 ? `${milestonesDone}/${milestonesTotal} milestones` : "No milestones"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Array.from({ length: Math.max(1, Math.min(milestonesTotal || 6, 10)) }, (_, i) => (
                    <span
                      key={i}
                      className={`h-2 w-2 rounded-full ${
                        milestonesTotal > 0 && i < milestonesDone ? "bg-emerald-500" : "bg-neutral-200 dark:bg-white/[0.10]"
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <div className="mb-2 flex justify-end">
                  <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[12px] font-extrabold tabular-nums text-neutral-900 dark:border-white/[0.10] dark:bg-white/[0.05] dark:text-white">
                    {consistency}%
                  </span>
                </div>
                <ProgressTrack pct={consistency} height={6} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function TaskStatusButton({
  done,
  missed,
  onClick,
}: {
  done: boolean;
  missed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={done ? "Mark not done" : "Mark done"}
      aria-pressed={done}
      onClick={onClick}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 transition-colors ${
        done ? "border-emerald-500 bg-emerald-500"
        : missed ? "border-rose-500 bg-rose-500"
        : "border-emerald-600/70 bg-transparent hover:border-emerald-600 dark:border-emerald-500/55"
      }`}
    >
      {done && <IconCheck size={17} strokeWidth={3} className="text-white" />}
      {missed && <IconX size={17} strokeWidth={3} className="text-white" />}
    </button>
  );
}

function TodayTaskListCard({
  tasks,
  done,
  total,
  plans,
  taskSummary,
  taskCheckableIds,
  onMarkDone,
  onOpenSubtasks,
}: {
  tasks: Task[];
  done: number;
  total: number;
  plans: Plan[];
  taskSummary: (task: Task) => TaskSummary;
  taskCheckableIds: (task: Task) => string[];
  onMarkDone: (taskId: string, subtaskIds: string[]) => void;
  onOpenSubtasks?: (taskId: string) => void;
}) {
  return (
    <section data-testid="overview-today-card" className={`${CARD} px-4 py-4`}>
      <SectionHeader icon={IconChecklist} title="Today's Task" meta={`${done}/${total}`} />
      {tasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center dark:border-white/[0.09]">
          <p className="text-[15px] font-bold text-neutral-950 dark:text-white">No tasks scheduled today</p>
          <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">Head to Today to add the next block.</p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
          {tasks.map((task) => {
            const { completedCount: subDone, totalCount: subTotal } = taskSummary(task);
            const isDone = isTaskCompleted(task, subTotal);
            const isMissed = !isDone && !!task.missed;
            const plan = plans.find((p) => p.id === task.planId);
            return (
              <div key={task.id} className="flex items-center gap-3 py-3.5">
                <TaskStatusButton
                  done={isDone}
                  missed={isMissed}
                  onClick={() => { haptic("light"); onMarkDone(task.id, taskCheckableIds(task)); }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-[15px] font-bold leading-tight ${
                      isDone ? "text-neutral-400 line-through dark:text-neutral-600"
                      : isMissed ? "text-neutral-400 line-through decoration-rose-400 dark:text-neutral-600"
                      : "text-neutral-950 dark:text-white"
                    }`}
                  >
                    {task.title}
                  </p>
                  {(task.startTime || plan) && (
                    <p className="mt-1 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                      {task.startTime && formatTime(task.startTime)}
                      {task.startTime && plan && " - "}
                      {plan && plan.title}
                    </p>
                  )}
                </div>
                {subTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => { haptic("light"); onOpenSubtasks?.(task.id); }}
                    aria-label={`Open subtasks (${subDone} of ${subTotal} done)`}
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:bg-white/[0.05]"
                  >
                    <IconListCheck size={14} strokeWidth={2} className="shrink-0" />
                    <span className="text-[12px] font-bold tabular-nums">{subDone}/{subTotal}</span>
                    <IconArrowUpRight size={13} strokeWidth={2.2} className="shrink-0" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface SetupDone {
  plan: boolean;
  task: boolean;
  ritual: boolean;
}

function GettingStarted({
  onNavigate,
  done,
  onDismiss,
}: {
  onNavigate: (tab: number) => void;
  done: SetupDone;
  onDismiss: () => void;
}) {
  const steps = [
    {
      n: 1,
      icon: IconClipboardList,
      title: "Create your first plan",
      desc: "Group related tasks, milestones, and trackers.",
      tab: 1,
      done: done.plan,
    },
    {
      n: 2,
      icon: IconCalendarEvent,
      title: "Schedule today's tasks",
      desc: "Put the next blocks on your timeline.",
      tab: 0,
      done: done.task,
    },
    {
      n: 3,
      icon: IconRepeat,
      title: "Build a daily routine",
      desc: "Track small repeated actions.",
      tab: 2,
      done: done.ritual,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done) ?? steps[0];
  const ctaLabel = nextStep.n === 1 ? "Create plan" : nextStep.n === 2 ? "Schedule tasks" : "Add a routine";

  return (
    <section className="mx-auto grid w-full max-w-[980px] gap-4 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="rounded-2xl border border-emerald-700 bg-[#00A63E] px-6 py-6 text-neutral-950 dark:border-emerald-400/30 dark:bg-[#2FD46E]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-extrabold uppercase tracking-[0.10em] text-neutral-950/70">Getting started</p>
            <h2 className="mt-3 max-w-[360px] text-[32px] font-extrabold leading-[0.98] tracking-[-0.04em]">
              Make your day trackable
            </h2>
            <p className="mt-3 max-w-[360px] text-[14px] font-semibold text-neutral-950/70">
              {doneCount === 0
                ? "Finish a few steps to turn goals into a working dashboard."
                : `${doneCount} of ${steps.length} done — keep going.`}
            </p>
          </div>
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-neutral-950 text-white">
            <IconSparkles size={24} strokeWidth={1.8} />
          </span>
        </div>
        <div className="mt-8 h-2 overflow-hidden rounded-full bg-neutral-950/15">
          <div
            className="h-full rounded-full bg-neutral-950 transition-[width] duration-500"
            style={{ width: `${Math.max(6, (doneCount / steps.length) * 100)}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => { haptic("light"); onNavigate(nextStep.tab); }}
          className="mt-8 inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-neutral-950 px-5 text-[15px] font-extrabold text-white transition-colors hover:bg-neutral-800"
        >
          {ctaLabel}
        </button>
        <button
          type="button"
          onClick={() => { haptic("light"); onDismiss(); }}
          className="mt-3 inline-flex min-h-[36px] w-full items-center justify-center rounded-xl px-5 text-[12px] font-bold text-neutral-950/60 transition-colors hover:text-neutral-950"
        >
          Skip setup — take me to the dashboard
        </button>
      </div>
      <div className={`${CARD} px-4 py-4`}>
        <SectionHeader icon={IconSparkles} title="Setup checklist" />
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
          {steps.map(({ n, icon: Icon, title, desc, tab, done: stepDone }) => (
            <button
              key={n}
              type="button"
              onClick={() => { haptic("light"); onNavigate(tab); }}
              className="flex w-full items-center gap-3 py-4 text-left"
            >
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                  stepDone
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400"
                }`}
              >
                <Icon size={20} strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-extrabold tabular-nums ${
                      stepDone
                        ? "bg-emerald-500 text-white"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {stepDone ? <IconCheck size={11} strokeWidth={3.2} /> : n}
                  </span>
                  <p
                    className={`truncate text-[15px] font-bold ${
                      stepDone
                        ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-500 dark:decoration-neutral-600"
                        : "text-neutral-950 dark:text-white"
                    }`}
                  >
                    {title}
                  </p>
                </div>
                <p className="mt-1 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">{desc}</p>
              </div>
              <IconArrowRight size={17} strokeWidth={2.4} className="shrink-0 text-neutral-300 dark:text-neutral-600" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function OverviewDashboard({
  schedule,
  todayKey,
  onNavigate,
  onMarkTaskDone,
  onOpenSubtasks,
  onLogTracker,
}: OverviewDashboardProps) {
  const todayISO = localISODate(new Date());
  const plansById = useMemo(() => new Map(schedule.plans.map((plan) => [plan.id, plan])), [schedule.plans]);
  const linkedPlanFor = useCallback(
    (task: Task) => (task.planId ? plansById.get(task.planId) ?? null : null),
    [plansById]
  );
  const taskSummary = useCallback(
    (task: Task) => getTaskSubtaskSummary(task, linkedPlanFor(task)),
    [linkedPlanFor]
  );
  const taskCheckableIds = useCallback(
    (task: Task) => getTaskCheckableItems(task, linkedPlanFor(task)).map((item) => item.id),
    [linkedPlanFor]
  );

  const todayTasks = useMemo(() => {
    const startKey = (task: Task) => {
      const mins = parseTimeToMinutes(task.startTime ?? "");
      return mins === null ? Infinity : toScheduleDayMinutes(mins);
    };
    return [...(schedule.activities[todayKey] ?? [])]
      .filter((task) => isTaskScheduledOn(task, todayISO, true))
      .sort((a, b) => startKey(a) - startKey(b));
  }, [schedule.activities, todayISO, todayKey]);

  const { tasksDone, tasksTotal } = useMemo(() => {
    const done = todayTasks.filter((task) => isTaskCompleted(task, taskSummary(task).totalCount)).length;
    const missed = todayTasks.filter((task) => !isTaskCompleted(task, taskSummary(task).totalCount) && !!task.missed).length;
    const unresolved = todayTasks.filter((task) => !isTaskResolved(task, taskSummary(task).totalCount)).length;
    return { tasksDone: done, tasksTotal: todayTasks.length, missedCount: missed, unresolvedCount: unresolved };
  }, [taskSummary, todayTasks]);

  const weeklyActivity = useMemo(() => {
    const todayIdx = new Date(todayISO + "T00:00:00").getDay();
    const monday = addDaysToISO(todayISO, -((todayIdx + 6) % 7));
    const days = DAYS_ORDER.map((day, i) => {
      const tasks = schedule.activities[day] ?? [];
      const total = tasks.length;
      const date = addDaysToISO(monday, i);
      const isToday = date === todayISO;
      const done = tasks.filter((task) =>
        isToday
          ? isTaskCompleted(task, taskSummary(task).totalCount)
          : (task.completionHistory ?? []).some(
              (event) => event.completionType === "task" && localISODate(new Date(event.completedAt)) === date
            )
      ).length;
      return { label: DAY_LABELS[i], total, done, isToday, pct: ratioPct(done, total) };
    });

    const totalTasks = days.reduce((sum, day) => sum + day.total, 0);
    const totalDone = days.reduce((sum, day) => sum + day.done, 0);
    const tasksPct = ratioPct(totalDone, totalTasks);
    const doneSet = new Set((schedule.ritualCompletions ?? []).map((completion) => `${completion.ritualId}|${completion.date}`));
    let habitTotal = 0;
    let habitDone = 0;

    DAYS_ORDER.forEach((day, i) => {
      const date = addDaysToISO(monday, i);
      if (date > todayISO) return;
      const scheduled = (schedule.rituals ?? []).filter(
        (ritual) => !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(day)
      );
      habitTotal += scheduled.length;
      habitDone += scheduled.filter((ritual) => doneSet.has(`${ritual.id}|${date}`)).length;
    });

    if (totalTasks === 0 && habitTotal === 0) return null;
    return { days, tasksPct, habitsPct: ratioPct(habitDone, habitTotal) };
  }, [schedule.activities, schedule.ritualCompletions, schedule.rituals, taskSummary, todayISO]);

  const hasScheduledTasks = useMemo(
    () => Object.values(schedule.activities).some((activities) => (activities?.length ?? 0) > 0),
    [schedule.activities]
  );

  // Getting-started stays up until the user has real momentum (2 of 3 setup
  // steps) or explicitly skips it; the flag is per-device.
  const [setupDismissed, setSetupDismissed] = useState(() => {
    try {
      return localStorage.getItem("planr-getting-started-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const dismissGettingStarted = useCallback(() => {
    setSetupDismissed(true);
    try {
      localStorage.setItem("planr-getting-started-dismissed", "1");
    } catch {
      // storage unavailable — dismissal just won't persist
    }
  }, []);

  const setupDone: SetupDone = {
    plan: schedule.plans.length > 0,
    task: hasScheduledTasks,
    ritual: (schedule.rituals?.length ?? 0) > 0,
  };
  const setupDoneCount = Number(setupDone.plan) + Number(setupDone.task) + Number(setupDone.ritual);
  const showGettingStarted = !setupDismissed && setupDoneCount < 2;

  const ritualConsistency = useMemo(() => {
    const completions = schedule.ritualCompletions ?? [];
    const doneSet = new Set(completions.map((completion) => `${completion.ritualId}|${completion.date}`));
    const last7 = Array.from({ length: 7 }, (_, i) => addDaysToISO(todayISO, -(6 - i)));
    const todayDay = JS_DAY_KEYS[new Date(todayISO + "T00:00:00").getDay()];
    return (schedule.rituals ?? [])
      .filter((ritual) => !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(todayDay))
      .map((ritual) => {
        let streak = 0;
        let cursor = addDaysToISO(todayISO, -1);
        for (let i = 0; i < 90; i++) {
          const day = JS_DAY_KEYS[new Date(cursor + "T00:00:00").getDay()];
          const scheduled = !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(day);
          if (scheduled) {
            if (doneSet.has(`${ritual.id}|${cursor}`)) streak++;
            else break;
          }
          cursor = addDaysToISO(cursor, -1);
        }
        return { ritual, streak, dots: last7.map((date) => doneSet.has(`${ritual.id}|${date}`)) };
      });
  }, [schedule.ritualCompletions, schedule.rituals, todayISO]);

  const planConsistency = useMemo(() =>
    schedule.plans.map((plan) => {
      const { consistency } = getPlanCardStats(plan, schedule.activities, todayKey);
      const milestones = (schedule.milestones ?? []).filter((milestone) => milestone.planId === plan.id);
      const milestonesDone = milestones.filter((milestone) => milestone.status === "completed").length;
      return { plan, consistency, milestonesTotal: milestones.length, milestonesDone };
    }),
    [schedule.activities, schedule.milestones, schedule.plans, todayKey]
  );

  const trackerData = useMemo<TrackerRow[]>(() =>
    (schedule.progressTrackers ?? []).map((tracker) => {
      const entries = (schedule.metricEntries ?? [])
        .filter((entry) => entry.trackerId === tracker.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const latest = entries[0];
      const previous = entries[1];
      const trend =
        latest && previous
          ? {
              direction: getTrendDirection(previous.value, latest.value),
              state: tracker.goalDirection
                ? getTrendState({ previous: previous.value, current: latest.value, goalDirection: tracker.goalDirection })
                : "neutral",
            }
          : null;
      return {
        tracker,
        latest,
        trend,
        plan: schedule.plans.find((plan) => plan.id === tracker.planId),
      };
    }),
    [schedule.metricEntries, schedule.plans, schedule.progressTrackers]
  );

  const executionStreak = useMemo(
    () => calculateExecutionStreak(schedule, todayISO),
    [schedule, todayISO]
  );

  return (
    <div data-testid="overview-dashboard" className="pb-24 lg:pb-8">
      <div className="mx-auto w-full max-w-[1480px] pt-5 lg:pt-4">
        <div className="mb-4 hidden items-end justify-between gap-4 lg:flex">
          <div>
            <p className="text-[13px] font-semibold text-neutral-400 dark:text-neutral-500">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <h1 className="mt-0.5 text-[30px] font-extrabold leading-tight tracking-[-0.04em] text-neutral-950 dark:text-white">
              Overview
            </h1>
          </div>
        </div>

        {showGettingStarted ? (
          <GettingStarted onNavigate={onNavigate} done={setupDone} onDismiss={dismissGettingStarted} />
        ) : (
          <div className="space-y-4">
            <StatGrid
              tasksDone={tasksDone}
              tasksTotal={tasksTotal}
              weekPct={weeklyActivity?.tasksPct ?? 0}
              plans={schedule.plans.length}
              trackers={trackerData.length}
              streak={executionStreak}
            />

            <div className="grid gap-4 lg:grid-cols-[minmax(330px,0.92fr)_minmax(360px,1fr)] xl:grid-cols-[minmax(360px,0.9fr)_minmax(410px,1fr)_minmax(360px,0.92fr)]">
              <div className="space-y-4">
                <TodayTaskListCard
                  tasks={todayTasks}
                  done={tasksDone}
                  total={tasksTotal}
                  plans={schedule.plans}
                  taskSummary={taskSummary}
                  taskCheckableIds={taskCheckableIds}
                  onMarkDone={onMarkTaskDone}
                  onOpenSubtasks={onOpenSubtasks}
                />
                <RoutineConsistencyCard rows={ritualConsistency} />
              </div>

              <div className="space-y-4">
                <ThisWeekCard activity={weeklyActivity} />
                {hasScheduledTasks && (
                  <div data-testid="overview-progress-card">
                    <ExecutionTrendCard schedule={schedule} />
                  </div>
                )}
                <ActiveTrackingCard rows={trackerData} onNavigate={onNavigate} onLogTracker={onLogTracker} />
              </div>

              <div className="space-y-4 lg:col-span-2 xl:col-span-1">
                <PlanConsistencyCard rows={planConsistency} onNavigate={onNavigate} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
