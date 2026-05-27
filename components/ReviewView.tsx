"use client";

import { useMemo, useState, useCallback, useRef } from "react";
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
  IconSparkles,
  IconRefresh,
  IconCalendarPlus,
} from "@tabler/icons-react";
import type { Schedule, DayKey } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
import { isTaskCompleted } from "@/lib/taskCompletion";
import { calculateConsistency } from "@/lib/planInsights";
import { computeTrend } from "@/lib/trendUtils";
import { todayISO, addDaysToISO, localISODate } from "@/lib/dateUtils";
import { streamWeeklyInsight } from "@/lib/aiActions";
import {
  OLLAMA_URL_KEY,
  OLLAMA_MODEL_KEY,
  DEFAULT_OLLAMA_URL,
  DEFAULT_OLLAMA_MODEL,
} from "@/lib/ai";
import MilestoneTimeline from "@/components/MilestoneTimeline";

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
  onOpenWeeklyPlan?: () => void;
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
// Weekly AI Insight — context builder + card
// ─────────────────────────────────────────────────────────────────────────────

/** Build a compact, token-efficient stats summary for the Ollama prompt. */
function buildWeeklyContext(
  schedule: Schedule,
  todayKey: DayKey,
  ritualWeekHistory: RitualWeekDay[],
): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = getMondayOf(today);

  const dayStats = DAYS.map((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const tasks = schedule.activities[day] ?? [];
    const total = tasks.length;
    const done = tasks.filter((t) => isTaskCompleted(t, t.subtasks?.length ?? 0)).length;
    return { day, label: DAY_LABELS[day], total, done, isPastOrToday: d <= today };
  });

  const tracked = dayStats.filter((d) => d.isPastOrToday);
  const totalDone = tracked.reduce((s, d) => s + d.done, 0);
  const totalScheduled = tracked.reduce((s, d) => s + d.total, 0);
  const weekPct = totalScheduled > 0 ? Math.round((totalDone / totalScheduled) * 100) : 0;

  const ritualDone = ritualWeekHistory.reduce((s, d) => s + d.completedCount, 0);
  const ritualDue = ritualWeekHistory.reduce((s, d) => s + d.dueCount, 0);
  const ritualPct = ritualDue > 0 ? Math.round((ritualDone / ritualDue) * 100) : 0;

  const dayBreakdown = tracked
    .filter((d) => d.total > 0)
    .map((d) => `${d.label}: ${d.done}/${d.total}`)
    .join(", ");

  const planLines = schedule.plans
    .filter((plan) => DAYS.some((d) => (schedule.activities[d] ?? []).some((t) => t.planId === plan.id)))
    .map((plan) => {
      const consistency = calculateConsistency(plan.id, schedule.activities, plan);
      const milestones = (schedule.milestones ?? []).filter((m) => m.planId === plan.id);
      const completedMs = milestones.filter((m) => m.status === "completed").length;
      const delayedMs = milestones.filter((m) => m.status === "delayed").length;
      return `"${plan.title}" consistency:${consistency}%${
        milestones.length > 0 ? ` milestones:${completedMs}/${milestones.length}` : ""
      }${delayedMs > 0 ? ` (${delayedMs} delayed)` : ""}`;
    })
    .join("; ");

  const sortedEntries = [...(schedule.metricEntries ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const metricLines = (schedule.progressTrackers ?? [])
    .map((tracker) => {
      const recent = sortedEntries.filter((e) => e.trackerId === tracker.id).slice(0, 3);
      if (recent.length === 0) return null;
      const latest = recent[0].value;
      const goal = tracker.goalValue ? ` goal:${tracker.goalValue}${tracker.unit ?? ""}` : "";
      const dir = tracker.goalDirection === "decrease_good" ? "↓" : "↑";
      return `${tracker.title}: ${latest}${tracker.unit ?? ""} (${dir} target${goal})`;
    })
    .filter((s): s is string => s !== null)
    .join("; ");

  return [
    `Week tasks: ${totalDone}/${totalScheduled} (${weekPct}%)${dayBreakdown ? ` — ${dayBreakdown}` : ""}`,
    `Habits: ${ritualDone}/${ritualDue} (${ritualPct}%)`,
    planLines ? `Plans: ${planLines}` : null,
    metricLines ? `Metrics: ${metricLines}` : null,
  ]
    .filter((s): s is string => s !== null)
    .join(". ");
}

function WeeklyAIInsightCard({
  schedule,
  todayKey,
  ritualWeekHistory,
}: ReviewViewProps) {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const baseUrl =
      typeof window !== "undefined"
        ? (localStorage.getItem(OLLAMA_URL_KEY) ?? DEFAULT_OLLAMA_URL)
        : DEFAULT_OLLAMA_URL;
    const model =
      typeof window !== "undefined"
        ? (localStorage.getItem(OLLAMA_MODEL_KEY) ?? DEFAULT_OLLAMA_MODEL)
        : DEFAULT_OLLAMA_MODEL;

    setText("");
    setError(null);
    setIsLoading(true);
    setHasGenerated(true);

    try {
      const context = buildWeeklyContext(schedule, todayKey, ritualWeekHistory);
      const stream = streamWeeklyInsight(baseUrl, model, context, ctrl.signal);
      for await (const chunk of stream) {
        if (ctrl.signal.aborted) break;
        setText((prev) => prev + chunk);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Could not reach Ollama");
    } finally {
      setIsLoading(false);
    }
  }, [schedule, todayKey, ritualWeekHistory]);

  return (
    <div className="mb-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white px-4 py-4 dark:border-violet-500/20 dark:from-violet-500/[0.07] dark:to-transparent">
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <IconSparkles size={13} strokeWidth={2.2} className="text-violet-500 dark:text-violet-400" />
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-violet-500 dark:text-violet-400">
            AI Insight
          </p>
        </div>
        {hasGenerated && !isLoading && (
          <button
            type="button"
            onClick={generate}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-neutral-400 transition-colors hover:text-violet-500 dark:text-neutral-500 dark:hover:text-violet-400"
          >
            <IconRefresh size={11} strokeWidth={2} />
            Refresh
          </button>
        )}
      </div>

      {/* Pre-generate prompt */}
      {!hasGenerated && (
        <div className="flex items-center gap-3">
          <p className="flex-1 text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">
            Get a personalized coaching summary — your strengths, blind spots, and one action to improve this week.
          </p>
          <button
            type="button"
            onClick={generate}
            className="shrink-0 rounded-xl bg-violet-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          >
            Generate
          </button>
        </div>
      )}

      {/* Streaming / loading */}
      {isLoading && (
        <div>
          {text ? (
            <p className="text-[14px] leading-relaxed text-neutral-800 dark:text-neutral-200">
              {text}
              <span className="animate-pulse opacity-60">▋</span>
            </p>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
              <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400" />
            </div>
          )}
        </div>
      )}

      {/* Final text */}
      {!isLoading && text && !error && (
        <p className="text-[14px] leading-relaxed text-neutral-800 dark:text-neutral-200">{text}</p>
      )}

      {/* Error */}
      {!isLoading && error && (
        <p className="text-[13px] text-rose-500 dark:text-rose-400">
          {error.includes("not reachable") || error.includes("fetch")
            ? "Ollama is offline. Start it with: ollama serve"
            : error}
        </p>
      )}
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
// Section 5 — Metrics Log  (sparkline + collapsible entries)
// ─────────────────────────────────────────────────────────────────────────────

// ── SVG sparkline ──────────────────────────────────────────────────────────

interface SparklineEntry {
  date: string;
  value: number;
}

function TrackerSparkline({
  entries,
  goalValue,
  goalDirection,
  unit,
  trendState,
}: {
  entries: SparklineEntry[];          // newest-first from caller; reversed inside
  goalValue?: number | null;
  goalDirection?: "increase_good" | "decrease_good" | null;
  unit?: string;
  trendState?: "positive" | "negative" | "neutral" | null;
}) {
  // Need ≥ 2 points to draw a line
  if (entries.length < 2) return null;

  // Display oldest → newest (left → right)
  const pts = [...entries].reverse();
  const values = pts.map((e) => e.value);

  const W = 300;
  const H = 80;
  const PX = 6;  // horizontal padding
  const PY = 12; // vertical padding

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const rangeV = maxV === minV ? 1 : maxV - minV;

  const toX = (i: number) =>
    PX + (i / (values.length - 1)) * (W - 2 * PX);
  const toY = (v: number) =>
    H - PY - ((v - minV) / rangeV) * (H - 2 * PY);

  // Line color based on trend
  const lineColor =
    trendState === "positive"
      ? "#10b981"   // emerald-500
      : trendState === "negative"
      ? "#f43f5e"   // rose-500
      : "#8b5cf6";  // violet-500 (neutral / no trend)

  // Build polyline point string
  const linePoints = values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");

  // Area polygon: baseline → line → back to baseline
  const areaPoints =
    `${toX(0)},${H - PY} ` +
    linePoints +
    ` ${toX(values.length - 1)},${H - PY}`;

  // Goal line
  const goalInRange =
    goalValue !== undefined &&
    goalValue !== null &&
    goalValue >= minV - rangeV * 0.1 &&
    goalValue <= maxV + rangeV * 0.1;
  const goalY = goalInRange ? toY(goalValue as number) : null;

  // Latest dot position + value
  const latestX = toX(values.length - 1);
  const latestY = toY(values[values.length - 1]);
  const latestVal = values[values.length - 1];

  // Date range labels
  const fmtDate = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  const firstLabel = fmtDate(pts[0].date);
  const lastLabel = fmtDate(pts[pts.length - 1].date);

  // Clamp label anchor so it doesn't overflow
  const labelAnchor = latestX > W - 36 ? "end" : "start";
  const labelX = labelAnchor === "end" ? latestX - 5 : latestX + 5;
  const labelY = Math.max(latestY - 5, 8);

  return (
    <div className="mt-2 overflow-hidden rounded-xl bg-neutral-50 px-2 pt-1 pb-0 dark:bg-white/[0.025]">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 80, display: "block" }}
        aria-hidden
      >
        {/* Area fill */}
        <polygon points={areaPoints} fill={lineColor} opacity="0.07" />

        {/* Goal line */}
        {goalY !== null && (
          <line
            x1={PX} y1={goalY}
            x2={W - PX} y2={goalY}
            stroke="#8b5cf6"
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity="0.45"
          />
        )}

        {/* Main line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Latest dot */}
        <circle cx={latestX} cy={latestY} r="3.5" fill={lineColor} />
        <circle cx={latestX} cy={latestY} r="5.5" fill={lineColor} opacity="0.18" />

        {/* Latest value label */}
        <text
          x={labelX}
          y={labelY}
          fontSize="8.5"
          fontWeight="700"
          fill={lineColor}
          textAnchor={labelAnchor}
        >
          {latestVal}
          {unit ? ` ${unit}` : ""}
        </text>

        {/* Goal value label */}
        {goalY !== null && goalValue !== null && (
          <text
            x={W - PX - 2}
            y={Math.max((goalY as number) - 3, 8)}
            fontSize="7"
            fill="#8b5cf6"
            textAnchor="end"
            opacity="0.65"
          >
            goal {goalValue}
            {unit ? ` ${unit}` : ""}
          </text>
        )}
      </svg>

      {/* Date range footer */}
      <div className="flex justify-between px-0.5 pb-1.5">
        <span className="text-[9px] text-neutral-400 dark:text-neutral-600">{firstLabel}</span>
        <span className="text-[9px] text-neutral-400 dark:text-neutral-600">{lastLabel}</span>
      </div>
    </div>
  );
}



// ── Pace-to-goal prediction ───────────────────────────────────────────────────

interface PaceResult {
  status: "reached" | "on_track" | "off_track" | "no_data";
  etaDays: number | null;
  label: string;
  colorClass: string;
}

/**
 * Linear-regression estimate of when a tracker will reach its goalValue.
 * Uses the most recent ≤14 entries (newest-first from caller).
 */
function calcPaceToGoal(
  entries: { date: string; value: number }[],
  goalValue: number,
  goalDirection: "increase_good" | "decrease_good",
): PaceResult {
  const NO_DATA: PaceResult = {
    status: "no_data",
    etaDays: null,
    label: "Add more entries to see pace",
    colorClass: "text-neutral-400 dark:text-neutral-500",
  };

  if (entries.length < 3) return NO_DATA;

  const current = entries[0].value;

  // Already reached?
  const reached =
    goalDirection === "decrease_good" ? current <= goalValue : current >= goalValue;
  if (reached)
    return {
      status: "reached",
      etaDays: 0,
      label: "🎉 Goal reached!",
      colorClass: "text-emerald-600 dark:text-emerald-400",
    };

  // Oldest → newest for regression
  const pts = entries.slice(0, 14).reverse();
  const t0 = new Date(pts[0].date + "T00:00:00").getTime();
  const xs = pts.map((e) =>
    Math.round((new Date(e.date + "T00:00:00").getTime() - t0) / 86_400_000)
  );
  const ys = pts.map((e) => e.value);
  const n = pts.length;

  if (xs[xs.length - 1] === 0) return NO_DATA;

  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0);
  const den = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  const slope = den === 0 ? 0 : num / den; // units per day

  if (Math.abs(slope) < 0.0005) return NO_DATA;

  const daysToGoal = (goalValue - current) / slope;

  if (daysToGoal < 0)
    return {
      status: "off_track",
      etaDays: null,
      label: "Trending away from goal",
      colorClass: "text-rose-500 dark:text-rose-400",
    };

  // Human-readable ETA
  const d = Math.ceil(daysToGoal);
  const etaLabel =
    d <= 1
      ? "~1 day"
      : d <= 13
      ? `~${d} days`
      : d <= 59
      ? `~${Math.ceil(d / 7)} week${Math.ceil(d / 7) !== 1 ? "s" : ""}`
      : d <= 364
      ? `~${Math.ceil(d / 30)} month${Math.ceil(d / 30) !== 1 ? "s" : ""}`
      : "over a year away";

  const colorClass =
    d <= 30
      ? "text-emerald-600 dark:text-emerald-400"
      : d <= 90
      ? "text-amber-600 dark:text-amber-400"
      : "text-neutral-500 dark:text-neutral-400";

  return {
    status: "on_track",
    etaDays: d,
    label: `At this pace → ${etaLabel} to goal`,
    colorClass,
  };
}

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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const trackerGroups = useMemo(() => {
    const trackers = schedule.progressTrackers ?? [];
    const entries = [...(schedule.metricEntries ?? [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 80);

    return trackers.flatMap((tracker) => {
      const trackerEntries = entries.filter((e) => e.trackerId === tracker.id);
      if (trackerEntries.length === 0) return [];

      const recent = trackerEntries.slice(0, 15);
      const plan = schedule.plans.find((p) => p.id === tracker.planId);

      let trend: ReturnType<typeof computeTrend> | null = null;
      if (trackerEntries.length >= 4 && tracker.goalDirection) {
        const curr = trackerEntries.slice(0, 3).reduce((s, e) => s + e.value, 0) / 3;
        const prev = trackerEntries.slice(3, 6).reduce((s, e) => s + e.value, 0) /
          Math.min(3, trackerEntries.slice(3, 6).length);
        if (prev > 0) {
          trend = computeTrend({ previous: prev, current: curr, goalDirection: tracker.goalDirection });
        }
      }

      const streak = calcStreak(trackerEntries);
      const daysSinceLabel = lastLoggedLabel(trackerEntries[0].date);

      let goalPct: number | null = null;
      if (tracker.goalValue && tracker.goalValue > 0 && trackerEntries.length > 0) {
        const lastVal = trackerEntries[0].value;
        goalPct = tracker.goalDirection === "decrease_good"
          ? Math.min(1, tracker.goalValue / Math.max(lastVal, 0.001))
          : Math.min(1, lastVal / tracker.goalValue);
      }

      const pace =
        tracker.goalValue && tracker.goalValue > 0 && tracker.goalDirection
          ? calcPaceToGoal(trackerEntries, tracker.goalValue, tracker.goalDirection)
          : null;

      return [{ tracker, entries: recent, plan, trend, streak, daysSinceLabel, goalPct, pace }];
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
    <div>
      {/* Section header */}
      <div className="mb-3 flex items-center gap-1.5">
        <IconChartBar size={13} strokeWidth={2.2} className="text-neutral-400 dark:text-neutral-500" />
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
          Metrics Log
        </p>
      </div>

      {/* One card per tracker in a responsive grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {trackerGroups.map(({ tracker, entries, plan, trend, streak, daysSinceLabel, goalPct, pace }) => {
          const currentVal = entries[0]?.value;
          const trendColorClass =
            trend?.state === "positive"
              ? "text-emerald-600 dark:text-emerald-400"
              : trend?.state === "negative"
              ? "text-rose-500 dark:text-rose-400"
              : "text-neutral-400 dark:text-neutral-500";

          return (
            <div
              key={tracker.id}
              className="flex flex-col rounded-2xl border border-neutral-200 bg-white px-4 py-4 dark:border-white/[0.08] dark:bg-neutral-900"
            >
              {/* ── Card header: name + trend ── */}
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[13px] font-bold text-neutral-800 dark:text-neutral-200">
                      {tracker.title}
                    </p>
                    {streak >= 2 && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:bg-amber-400/15 dark:text-amber-400">
                        <IconFlame size={10} strokeWidth={2.5} />
                        {streak}d
                      </span>
                    )}
                  </div>
                  {plan && (
                    <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">{plan.title}</p>
                  )}
                </div>
                {/* Trend direction badge */}
                {trend && trend.direction !== "neutral" && (
                  <span className={`flex shrink-0 items-center gap-0.5 text-[11px] font-semibold ${trendColorClass}`}>
                    {trend.direction === "up"
                      ? <IconArrowUp size={11} strokeWidth={2.5} />
                      : <IconArrowDown size={11} strokeWidth={2.5} />}
                    {trend.pct !== null ? `${Math.abs(trend.pct).toFixed(0)}%` : ""}
                  </span>
                )}
                {trend?.direction === "neutral" && (
                  <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-neutral-400">
                    <IconMinus size={11} strokeWidth={2.5} />
                    Stable
                  </span>
                )}
              </div>

              {/* ── Current value (hero number) ── */}
              <div className="mb-1 flex items-end gap-1.5">
                <span className="text-[30px] font-extrabold tabular-nums leading-none text-neutral-950 dark:text-white">
                  {currentVal ?? "—"}
                </span>
                {tracker.unit && (
                  <span className="mb-0.5 text-[14px] font-semibold text-neutral-400 dark:text-neutral-500">
                    {tracker.unit}
                  </span>
                )}
                <span className="mb-0.5 ml-auto text-[11px] text-neutral-400 dark:text-neutral-500">
                  {daysSinceLabel}
                </span>
              </div>

              {/* ── Sparkline — the main visual ── */}
              <TrackerSparkline
                entries={entries}
                goalValue={tracker.goalValue}
                goalDirection={tracker.goalDirection}
                unit={tracker.unit}
                trendState={trend?.state ?? null}
              />

              {/* ── Goal progress bar ── */}
              {goalPct !== null && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between">
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
                        goalPct >= 0.8 ? "bg-emerald-500" : goalPct >= 0.5 ? "bg-amber-400" : "bg-rose-400"
                      }`}
                      style={{ width: `${Math.round(goalPct * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* ── Pace prediction ── */}
              {pace && pace.status !== "no_data" && (
                <p className={`mt-1.5 text-[11px] font-medium ${pace.colorClass}`}>
                  {pace.label}
                </p>
              )}

              {/* ── Collapsible raw entries ── */}
              <button
                type="button"
                onClick={() => toggleExpand(tracker.id)}
                className="mt-2.5 flex items-center gap-1 text-[10.5px] font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
              >
                {expandedIds.has(tracker.id)
                  ? "Hide entries ↑"
                  : `Show ${entries.length} entries ↓`}
              </button>
              {expandedIds.has(tracker.id) && (
                <div className="mt-1 space-y-0.5">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg px-2.5 py-1.5 odd:bg-neutral-50 dark:odd:bg-white/[0.02]"
                    >
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {new Date(entry.date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="text-[12px] font-semibold tabular-nums text-neutral-800 dark:text-neutral-200">
                        {entry.value}
                        {tracker.unit ? ` ${tracker.unit}` : ""}
                      </span>
                    </div>
                  ))}
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
// Root ReviewView component
// ─────────────────────────────────────────────────────────────────────────────

export default function ReviewView({ schedule, todayKey, ritualWeekHistory, onOpenWeeklyPlan }: ReviewViewProps) {
  return (
    <div className="px-4 pt-5 pb-24 lg:px-8 lg:pt-6 lg:pb-10">
      {/* AI Insight — full width, above the grid */}
      <WeeklyAIInsightCard
        schedule={schedule}
        todayKey={todayKey}
        ritualWeekHistory={ritualWeekHistory}
      />
      {/* Plan Next Week trigger */}
      {onOpenWeeklyPlan && (
        <button
          type="button"
          onClick={onOpenWeeklyPlan}
          className="mb-4 flex w-full items-center justify-between rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 transition-colors hover:bg-violet-100 dark:border-violet-500/20 dark:bg-violet-500/[0.07] dark:hover:bg-violet-500/[0.12]"
        >
          <div className="flex items-center gap-2">
            <IconCalendarPlus size={15} strokeWidth={2} className="text-violet-500 dark:text-violet-400" />
            <span className="text-[13px] font-semibold text-violet-700 dark:text-violet-300">
              Plan Next Week
            </span>
            <span className="text-[12px] text-violet-500/70 dark:text-violet-400/70">
              · AI task suggestions based on this week
            </span>
          </div>
          <span className="text-[13px] text-violet-400 dark:text-violet-500">→</span>
        </button>
      )}
      {/* Desktop: 2-column grid for the four insight cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ThisWeekSection schedule={schedule} todayKey={todayKey} ritualWeekHistory={ritualWeekHistory} />
        <ExecutionTrendSection schedule={schedule} />
        <HabitConsistencySection schedule={schedule} ritualWeekHistory={ritualWeekHistory} />
        <PlanHealthSection schedule={schedule} todayKey={todayKey} />
      </div>
      {/* Milestone Roadmap — full width */}
      <div className="mb-4">
        <MilestoneTimeline schedule={schedule} />
      </div>
      {/* Metrics Log — full width */}
      <MetricsLogSection schedule={schedule} />
    </div>
  );
}
