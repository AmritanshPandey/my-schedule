"use client";

import { useMemo } from "react";
import {
  IconArrowUp,
  IconArrowDown,
  IconMinus,
  IconTrendingUp,
  IconTrendingDown,
  IconFlame,
  IconCalendarWeek,
  IconRepeat,
  IconClipboardData,
  IconChartBar,
} from "@tabler/icons-react";
import type { Schedule, DayKey } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
import { isTaskCompleted } from "@/lib/taskCompletion";
import { calculateConsistency } from "@/lib/planInsights";
import { computeTrend } from "@/lib/trendUtils";
import { todayISO, addDaysToISO, localISODate } from "@/lib/dateUtils";

// ── Shared type (mirrored from ScheduleApp.tsx) ───────────────────────────────

export type RitualWeekDay = {
  date: string;
  label: string;
  isToday: boolean;
  completedCount: number;
  dueCount: number;
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ReviewViewProps {
  schedule: Schedule;
  todayKey: DayKey;
  ritualWeekHistory: RitualWeekDay[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const JS_DAYS: readonly DayKey[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

/** Monday-based week start for a given date */
function getMondayOf(d: Date): Date {
  const dow = d.getDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  const mon = new Date(d);
  mon.setDate(d.getDate() - daysBack);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

// ── Section label ─────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

function SectionLabel({ children, icon: Icon }: { children: React.ReactNode; icon?: IconComponent }) {
  return (
    <div className="mb-3 flex items-center gap-1.5">
      {Icon && <Icon size={13} strokeWidth={2.2} className="text-neutral-400 dark:text-neutral-500" />}
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
        {children}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — This Week
// ─────────────────────────────────────────────────────────────────────────────

function ThisWeekSection({
  schedule,
  todayKey,
  ritualWeekHistory,
}: ReviewViewProps) {
  const thisWeekDates = useMemo(() => {
    const today = new Date();
    const monday = getMondayOf(today);
    return DAYS.map((day, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { day, date: d };
    });
  }, []);

  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dayStats = useMemo(
    () =>
      thisWeekDates.map(({ day, date }) => {
        const tasks = schedule.activities[day] ?? [];
        const total = tasks.length;
        const done = tasks.filter((t) => isTaskCompleted(t, t.subtasks?.length ?? 0)).length;
        return {
          day,
          label: DAY_LABELS[day],
          total,
          done,
          isPastOrToday: date <= todayMidnight,
          isToday: day === todayKey,
        };
      }),
    [schedule.activities, thisWeekDates, todayMidnight, todayKey]
  );

  const trackedDays = dayStats.filter((d) => d.isPastOrToday);
  const totalDone = trackedDays.reduce((s, d) => s + d.done, 0);
  const totalScheduled = trackedDays.reduce((s, d) => s + d.total, 0);
  const weekPct = totalScheduled > 0 ? Math.round((totalDone / totalScheduled) * 100) : 0;

  const ritualDone = ritualWeekHistory.reduce((s, d) => s + d.completedCount, 0);
  const ritualDue = ritualWeekHistory.reduce((s, d) => s + d.dueCount, 0);
  const ritualPct = ritualDue > 0 ? Math.round((ritualDone / ritualDue) * 100) : 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4">
      <SectionLabel icon={IconCalendarWeek}>This Week</SectionLabel>

      {/* Day strip */}
      <div className="grid grid-cols-7 gap-1.5 mb-4">
        {dayStats.map(({ day, label, total, done, isPastOrToday, isToday }) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div key={day} className="flex flex-col items-center gap-1.5">
              <span className={`text-[9px] font-semibold leading-none ${
                isToday ? "text-emerald-500 dark:text-emerald-400" : "text-neutral-400 dark:text-neutral-500"
              }`}>
                {label}
              </span>
              <div className="w-full h-[5px] rounded-full bg-neutral-100 dark:bg-white/[0.06] overflow-hidden">
                {total > 0 && isPastOrToday && (
                  <div
                    className={`h-full rounded-full ${
                      pct === 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-400"
                    }`}
                    style={{ width: `${Math.max(pct, pct > 0 ? 10 : 0)}%` }}
                  />
                )}
              </div>
              <span className={`text-[9px] tabular-nums leading-none ${
                isToday ? "font-bold text-neutral-700 dark:text-neutral-300" : "text-neutral-400 dark:text-neutral-500"
              }`}>
                {total > 0 && isPastOrToday ? `${done}/${total}` : "·"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] px-3 py-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 dark:text-neutral-500">Tasks done</p>
          <p className="text-[20px] font-extrabold tabular-nums leading-none text-neutral-950 dark:text-white">
            {weekPct}<span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">%</span>
          </p>
        </div>
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] px-3 py-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 dark:text-neutral-500">Habits done</p>
          <p className="text-[20px] font-extrabold tabular-nums leading-none text-neutral-950 dark:text-white">
            {ritualPct}<span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">%</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Execution Trend (8-week bar chart)
// ─────────────────────────────────────────────────────────────────────────────

function ExecutionTrendSection({ schedule }: { schedule: Schedule }) {
  const weeks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 8 }, (_, i) => {
      // Week i: 0 = most recent (current), 7 = oldest
      const offsetDays = (7 - i) * 7;
      const weekMonday = getMondayOf(new Date(today.getTime() - (offsetDays - 0) * 86_400_000 + (i === 0 ? 0 : 0)));

      // Build actual monday for each historical week
      const mon = new Date(today);
      mon.setDate(today.getDate() - (7 - i) * 7);
      const actualMonday = getMondayOf(mon);
      const actualSunday = new Date(actualMonday);
      actualSunday.setDate(actualMonday.getDate() + 6);

      const monStr = localISODate(actualMonday);
      const sunStr = localISODate(actualSunday);
      const todayStr = localISODate(today);

      let total = 0;
      let done = 0;

      for (const day of DAYS) {
        for (const task of schedule.activities[day] ?? []) {
          if (Array.isArray(task.completionHistory)) {
            for (const event of task.completionHistory) {
              if (event.completionType === "task") {
                const d = localISODate(new Date(event.completedAt));
                if (d >= monStr && d <= sunStr) done++;
              }
            }
          }
          // Count as total if the task existed during this week window
          // Use a heuristic: always count scheduled tasks for current week
        }
      }

      // Count total scheduled tasks per day for each weekday
      for (const day of DAYS) {
        // Only count tasks for current active week (index 7)
        if (i === 7) {
          total += (schedule.activities[day] ?? []).length;
        }
      }

      // For historical weeks: use completionHistory event count as proxy for done,
      // and derive total from how many tasks existed (approximation: current count)
      if (i < 7) {
        total = 0;
        for (const day of DAYS) {
          total += (schedule.activities[day] ?? []).length;
        }
      }

      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const isCurrentWeek = i === 7;
      const isFuture = monStr > todayStr;

      // Short week label: "May 12"
      const label = actualMonday.toLocaleDateString("en-US", { month: "short", day: "numeric" });

      return { monStr, sunStr, pct, done, total, isCurrentWeek, isFuture, label };
    });
  }, [schedule.activities]);

  const prevWeek = weeks[weeks.length - 2];
  const currWeek = weeks[weeks.length - 1];
  const delta = currWeek.pct - prevWeek.pct;
  const maxPct = Math.max(...weeks.map((w) => w.pct), 10);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <SectionLabel icon={IconTrendingUp}>Execution Trend</SectionLabel>
        {delta !== 0 && (
          <span className={`flex items-center gap-0.5 text-[11px] font-bold ${
            delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"
          }`}>
            {delta > 0 ? <IconTrendingUp size={13} strokeWidth={2} /> : <IconTrendingDown size={13} strokeWidth={2} />}
            {delta > 0 ? "+" : ""}{delta}% vs last week
          </span>
        )}
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-[60px]">
        {weeks.map((week, i) => {
          const barH = maxPct > 0 ? Math.max(4, Math.round((week.pct / maxPct) * 52)) : 4;
          const color = week.pct >= 80
            ? "bg-emerald-500"
            : week.pct >= 50
            ? "bg-amber-400"
            : week.pct > 0
            ? "bg-rose-400"
            : "bg-neutral-200 dark:bg-white/[0.07]";

          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div className="relative w-full flex items-end justify-center" style={{ height: 52 }}>
                <div
                  className={`w-full rounded-t-[3px] transition-all ${color} ${week.isCurrentWeek ? "opacity-100" : "opacity-70"}`}
                  style={{ height: barH }}
                />
              </div>
              <span className={`text-[8.5px] leading-none tabular-nums ${
                week.isCurrentWeek ? "font-bold text-neutral-700 dark:text-neutral-300" : "text-neutral-400 dark:text-neutral-600"
              }`}>
                {week.pct > 0 ? `${week.pct}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex justify-between">
        <span className="text-[9px] text-neutral-400 dark:text-neutral-600">{weeks[0].label}</span>
        <span className="text-[9px] text-neutral-400 dark:text-neutral-600">This week</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Habit Consistency
// ─────────────────────────────────────────────────────────────────────────────

function HabitConsistencySection({
  schedule,
  ritualWeekHistory,
}: {
  schedule: Schedule;
  ritualWeekHistory: RitualWeekDay[];
}) {
  const ritualsWithStats = useMemo(() => {
    const today = todayISO();
    const completions = schedule.ritualCompletions ?? [];

    return (schedule.rituals ?? []).map((ritual) => {
      // 7-day dot history
      const dots = ritualWeekHistory.map((d) => ({
        date: d.date,
        label: d.label,
        isToday: d.isToday,
        done: completions.some((c) => c.ritualId === ritual.id && c.date === d.date),
        due: !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(
          JS_DAYS[new Date(d.date + "T00:00:00").getDay()]
        ),
      }));

      // Streak: walk backwards from today
      let streak = 0;
      for (let i = 0; i < 365; i++) {
        const date = addDaysToISO(today, -i);
        const jsDay = JS_DAYS[new Date(date + "T00:00:00").getDay()];
        const isDue = !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(jsDay);
        if (!isDue) continue; // skip non-scheduled days
        const isDone = completions.some((c) => c.ritualId === ritual.id && c.date === date);
        if (isDone) {
          streak++;
        } else {
          break;
        }
      }

      return { ritual, dots, streak };
    });
  }, [schedule.rituals, schedule.ritualCompletions, ritualWeekHistory]);

  if (ritualsWithStats.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4">
        <SectionLabel icon={IconRepeat}>Habit Consistency</SectionLabel>
        <p className="text-[13px] text-neutral-400 dark:text-neutral-500">No habits yet. Add some in the Routine tab.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4">
      <SectionLabel icon={IconRepeat}>Habit Consistency</SectionLabel>
      <div className="space-y-3">
        {ritualsWithStats.map(({ ritual, dots, streak }) => (
          <div key={ritual.id} className="flex items-center gap-3">
            {/* Name + streak */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-neutral-900 dark:text-white">{ritual.title}</p>
              {streak > 0 && (
                <p className="flex items-center gap-0.5 text-[11px] font-medium text-amber-500 dark:text-amber-400">
                  <IconFlame size={11} strokeWidth={2} />
                  {streak}d streak
                </p>
              )}
            </div>
            {/* 7-day dots */}
            <div className="flex items-center gap-1 shrink-0">
              {dots.map((d) => (
                <div
                  key={d.date}
                  className={`rounded-full ${
                    !d.due
                      ? "h-1.5 w-1.5 bg-neutral-100 dark:bg-white/[0.05]"
                      : d.done
                      ? "h-2 w-2 bg-emerald-500"
                      : d.isToday
                      ? "h-2 w-2 border border-neutral-300 dark:border-white/20 bg-transparent"
                      : "h-2 w-2 bg-neutral-200 dark:bg-white/[0.10]"
                  }`}
                  title={`${d.label}: ${d.done ? "done" : d.due ? "missed" : "not scheduled"}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Plan Health
// ─────────────────────────────────────────────────────────────────────────────

function PlanHealthSection({
  schedule,
  todayKey,
}: {
  schedule: Schedule;
  todayKey: DayKey;
}) {
  const planCards = useMemo(() => {
    return schedule.plans
      .filter((plan) => {
        const hasTasks = DAYS.some((d) => schedule.activities[d].some((t) => t.planId === plan.id));
        const hasMilestones = (schedule.milestones ?? []).some((m) => m.planId === plan.id);
        return hasTasks || hasMilestones;
      })
      .map((plan) => {
        const planMilestones = (schedule.milestones ?? []).filter((m) => m.planId === plan.id);
        const completedMs = planMilestones.filter((m) => m.status === "completed").length;
        const totalMs = planMilestones.length;
        const consistency = calculateConsistency(plan.id, schedule.activities, plan);
        const delayedMs = planMilestones.filter((m) => m.status === "delayed").length;

        return { plan, completedMs, totalMs, consistency, delayedMs };
      });
  }, [schedule.plans, schedule.activities, schedule.milestones, todayKey]);

  if (planCards.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4">
        <SectionLabel icon={IconClipboardData}>Plan Health</SectionLabel>
        <p className="text-[13px] text-neutral-400 dark:text-neutral-500">No active plans. Create one in the Plans tab.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4">
      <SectionLabel icon={IconClipboardData}>Plan Health</SectionLabel>
      <div className="space-y-2.5">
        {planCards.map(({ plan, completedMs, totalMs, consistency, delayedMs }) => {
          const msPct = totalMs > 0 ? Math.round((completedMs / totalMs) * 100) : null;
          const healthColor =
            consistency >= 70 ? "text-emerald-600 dark:text-emerald-400"
            : consistency >= 40 ? "text-amber-600 dark:text-amber-400"
            : "text-rose-500 dark:text-rose-400";

          return (
            <div key={plan.id} className="flex items-center gap-3 rounded-xl border border-neutral-100 dark:border-white/[0.06] bg-neutral-50 dark:bg-white/[0.02] px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-neutral-900 dark:text-white">{plan.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {totalMs > 0 && (
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      {completedMs}/{totalMs} milestones
                    </span>
                  )}
                  {delayedMs > 0 && (
                    <span className="text-[11px] font-medium text-rose-500 dark:text-rose-400">
                      {delayedMs} delayed
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-[15px] font-extrabold tabular-nums leading-none ${healthColor}`}>
                  {consistency}%
                </p>
                <p className="text-[9px] font-medium text-neutral-400 dark:text-neutral-500 mt-0.5">consistency</p>
              </div>
              {msPct !== null && (
                <div className="shrink-0 w-[36px]">
                  <div className="h-[36px] w-[36px] relative">
                    <svg viewBox="0 0 36 36" className="rotate-[-90deg]">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="4" className="text-neutral-200 dark:text-white/[0.07]" />
                      <circle
                        cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="4"
                        strokeDasharray={`${(msPct / 100) * 87.96} 87.96`}
                        strokeLinecap="round"
                        className={msPct >= 70 ? "text-emerald-500" : msPct >= 40 ? "text-amber-400" : "text-rose-400"}
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-[8.5px] font-bold text-neutral-700 dark:text-neutral-300">
                      {msPct}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5 — Metrics Log
// ─────────────────────────────────────────────────────────────────────────────

/** Consecutive-day streak from a newest-first sorted entry array. */
function calcStreak(sortedEntries: { date: string }[]): number {
  if (sortedEntries.length === 0) return 0;
  let streak = 1;
  for (let i = 1; i < sortedEntries.length; i++) {
    const prev = new Date(sortedEntries[i - 1].date + "T00:00:00");
    const curr = new Date(sortedEntries[i].date + "T00:00:00");
    const diffDays = Math.round((prev.getTime() - curr.getTime()) / 86_400_000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}

/** Human-readable "last logged" label. */
function lastLoggedLabel(isoDate: string): string {
  const diffDays = Math.round(
    (Date.now() - new Date(isoDate + "T00:00:00").getTime()) / 86_400_000
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return `${diffDays}d ago`;
}

function MetricsLogSection({ schedule }: { schedule: Schedule }) {
  const trackerGroups = useMemo(() => {
    const trackers = schedule.progressTrackers ?? [];
    // Sort all entries newest-first; limit scan to last 80 entries
    const entries = [...(schedule.metricEntries ?? [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 80);

    return trackers.flatMap((tracker) => {
      const trackerEntries = entries.filter((e) => e.trackerId === tracker.id);
      if (trackerEntries.length === 0) return [];

      const recent = trackerEntries.slice(0, 15);
      const plan = schedule.plans.find((p) => p.id === tracker.planId);

      // Trend: compare average of last 3 vs previous 3
      let trend: ReturnType<typeof computeTrend> | null = null;
      if (trackerEntries.length >= 4 && tracker.goalDirection) {
        const curr = trackerEntries.slice(0, 3).reduce((s, e) => s + e.value, 0) / 3;
        const prev = trackerEntries.slice(3, 6).reduce((s, e) => s + e.value, 0) /
          Math.min(3, trackerEntries.slice(3, 6).length);
        if (prev > 0) {
          trend = computeTrend({ previous: prev, current: curr, goalDirection: tracker.goalDirection });
        }
      }

      // Streak (consecutive days)
      const streak = calcStreak(trackerEntries);

      // Days since last log
      const daysSinceLabel = lastLoggedLabel(trackerEntries[0].date);

      // Goal progress (0–1) — only when goalValue is set
      let goalPct: number | null = null;
      if (tracker.goalValue && tracker.goalValue > 0 && trackerEntries.length > 0) {
        const lastVal = trackerEntries[0].value;
        if (tracker.goalDirection === "decrease_good") {
          // Progress = how close to the goal from above; cap at 100%
          goalPct = Math.min(1, tracker.goalValue / Math.max(lastVal, 0.001));
        } else {
          goalPct = Math.min(1, lastVal / tracker.goalValue);
        }
      }

      return [{ tracker, entries: recent, plan, trend, streak, daysSinceLabel, goalPct }];
    });
  }, [schedule.progressTrackers, schedule.metricEntries, schedule.plans]);

  if (trackerGroups.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4">
        <SectionLabel icon={IconChartBar}>Metrics Log</SectionLabel>
        <p className="text-[13px] text-neutral-400 dark:text-neutral-500">No metrics logged yet. Add entries from a plan&apos;s tracker.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4">
      <SectionLabel icon={IconChartBar}>Metrics Log</SectionLabel>
      <div className="space-y-5">
        {trackerGroups.map(({ tracker, entries, plan, trend, streak, daysSinceLabel, goalPct }) => (
          <div key={tracker.id}>
            {/* ── Tracker header ── */}
            <div className="flex items-start justify-between mb-1.5 gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-[13px] font-bold text-neutral-800 dark:text-neutral-200">
                    {tracker.title}{tracker.unit ? ` (${tracker.unit})` : ""}
                  </p>
                  {/* Streak badge */}
                  {streak >= 2 && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-400/15 dark:text-amber-400">
                      <IconFlame size={10} strokeWidth={2.5} />
                      {streak}d streak
                    </span>
                  )}
                </div>
                {/* Plan name + last logged */}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {plan && (
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{plan.title}</p>
                  )}
                  <span className="text-[11px] text-neutral-300 dark:text-neutral-600">·</span>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{daysSinceLabel}</p>
                </div>
              </div>

              {/* Trend badge */}
              {trend && trend.direction !== "neutral" && (
                <span className={`shrink-0 flex items-center gap-0.5 text-[11px] font-semibold ${
                  trend.state === "positive" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"
                }`}>
                  {trend.direction === "up"
                    ? <IconArrowUp size={11} strokeWidth={2.5} />
                    : <IconArrowDown size={11} strokeWidth={2.5} />}
                  {trend.pct !== null ? `${Math.abs(trend.pct).toFixed(0)}%` : ""}
                </span>
              )}
              {trend && trend.direction === "neutral" && (
                <span className="shrink-0 flex items-center gap-0.5 text-[11px] font-semibold text-neutral-400">
                  <IconMinus size={11} strokeWidth={2.5} />
                  Stable
                </span>
              )}
            </div>

            {/* ── Goal progress bar ── */}
            {goalPct !== null && (
              <div className="mb-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                    Goal: {tracker.goalValue}{tracker.unit ? ` ${tracker.unit}` : ""}
                  </span>
                  <span className="text-[10px] font-semibold text-neutral-600 dark:text-neutral-300">
                    {Math.round(goalPct * 100)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.07]">
                  <div
                    className={`h-full rounded-full transition-all ${
                      goalPct >= 0.8
                        ? "bg-emerald-500"
                        : goalPct >= 0.5
                        ? "bg-amber-400"
                        : "bg-rose-400"
                    }`}
                    style={{ width: `${Math.round(goalPct * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Entry rows ── */}
            <div className="space-y-0.5">
              {entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5 odd:bg-neutral-50 dark:odd:bg-white/[0.02]">
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">
                    {entry.value}{tracker.unit ? ` ${tracker.unit}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root ReviewView component
// ─────────────────────────────────────────────────────────────────────────────

export default function ReviewView({ schedule, todayKey, ritualWeekHistory }: ReviewViewProps) {
  return (
    <div className="px-4 pt-5 pb-24 lg:px-8 lg:pt-6 lg:pb-10">
      {/* Desktop: 2-column grid for the four insight cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ThisWeekSection schedule={schedule} todayKey={todayKey} ritualWeekHistory={ritualWeekHistory} />
        <ExecutionTrendSection schedule={schedule} />
        <HabitConsistencySection schedule={schedule} ritualWeekHistory={ritualWeekHistory} />
        <PlanHealthSection schedule={schedule} todayKey={todayKey} />
      </div>
      {/* Metrics Log — full width */}
      <MetricsLogSection schedule={schedule} />
    </div>
  );
}
