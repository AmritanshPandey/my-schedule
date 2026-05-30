"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  IconArrowRight,
  IconBolt,
  IconBrain,
  IconCalendarEvent,
  IconChartBar,
  IconCheck,
  IconClipboardData,
  IconClipboardList,
  IconFlame,
  IconMap2,
  IconRepeat,
  IconSparkles,
  IconTarget,
  IconTrendingUp,
} from "@tabler/icons-react";
import type { Schedule, DayKey, Plan, RitualCompletion, Ritual } from "@/lib/useScheduleDB";
import { isTaskCompleted } from "@/lib/taskCompletion";
import { calculateConsistency, getPlanCardStats } from "@/lib/planInsights";
import { accentStyles } from "@/lib/colorSystem";
import { localISODate, addDaysToISO } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewDashboardProps {
  schedule: Schedule;
  todayKey: DayKey;
  onNavigate: (tab: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(t?: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Walk backward from yesterday counting consecutive ritual completions
function calcRitualStreak(
  ritualId: string,
  completions: RitualCompletion[],
  ritual: Ritual,
  todayISO: string
): number {
  const done = new Set(
    completions.filter((c) => c.ritualId === ritualId).map((c) => c.date)
  );
  let streak = 0;
  let cursor = addDaysToISO(todayISO, -1);
  for (let i = 0; i < 90; i++) {
    const dayOfWeek = new Date(cursor + "T00:00:00").getDay();
    const scheduled =
      !ritual.repeatDays ||
      ritual.repeatDays.length === 0 ||
      ritual.repeatDays.includes(["sun","mon","tue","wed","thu","fri","sat"][dayOfWeek] as DayKey);
    if (scheduled) {
      if (done.has(cursor)) streak++;
      else break;
    }
    cursor = addDaysToISO(cursor, -1);
  }
  return streak;
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <div className="h-10 w-full" />;
  }
  const W = 100;
  const H = 40;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return `${x},${y}`;
  });
  const pathD = `M ${pts.join(" L ")}`;

  const strokeMap: Record<string, string> = {
    blue:    "stroke-blue-500 dark:stroke-blue-400",
    emerald: "stroke-emerald-500 dark:stroke-emerald-400",
    violet:  "stroke-violet-500 dark:stroke-violet-400",
    pink:    "stroke-pink-500 dark:stroke-pink-400",
    amber:   "stroke-amber-500 dark:stroke-amber-400",
    cyan:    "stroke-cyan-500 dark:stroke-cyan-400",
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-10 w-full ${strokeMap[color] ?? strokeMap.cyan}`} preserveAspectRatio="none">
      <path d={pathD} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
      {label}
    </p>
  );
}

// ── Hero stat tile ────────────────────────────────────────────────────────────

interface StatTileProps {
  value: string | number;
  label: string;
  sub?: string;
  color: "emerald" | "amber" | "rose" | "neutral" | "blue";
  onClick?: () => void;
}

const TILE_COLOR: Record<StatTileProps["color"], { val: string; sub: string; dot: string }> = {
  emerald: { val: "text-emerald-600 dark:text-emerald-400", sub: "text-emerald-500/70 dark:text-emerald-400/60", dot: "bg-emerald-500" },
  amber:   { val: "text-amber-600 dark:text-amber-400",   sub: "text-amber-500/70 dark:text-amber-400/60",   dot: "bg-amber-500" },
  rose:    { val: "text-rose-600 dark:text-rose-400",     sub: "text-rose-500/70 dark:text-rose-400/60",     dot: "bg-rose-500" },
  blue:    { val: "text-blue-600 dark:text-blue-400",     sub: "text-blue-500/70 dark:text-blue-400/60",     dot: "bg-blue-500" },
  neutral: { val: "text-neutral-900 dark:text-white",     sub: "text-neutral-400 dark:text-neutral-500",     dot: "bg-neutral-400" },
};

function StatTile({ value, label, sub, color, onClick }: StatTileProps) {
  const c = TILE_COLOR[color];
  return (
    <button
      type="button"
      onClick={() => { if (onClick) { haptic("light"); onClick(); } }}
      className={`flex flex-col gap-1 rounded-2xl border border-neutral-200/70 bg-white px-4 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] ${onClick ? "active:scale-[0.98] transition-transform" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-neutral-400 dark:text-neutral-500">{label}</span>
      </div>
      <span className={`text-[28px] font-extrabold leading-none tabular-nums ${c.val}`}>{value}</span>
      {sub && <span className={`text-[11.5px] font-medium leading-none ${c.sub}`}>{sub}</span>}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OverviewDashboard({
  schedule,
  todayKey,
  onNavigate,
}: OverviewDashboardProps) {
  const todayISO = localISODate(new Date());

  // ── Hero stats ──────────────────────────────────────────────────────────────

  const { tasksDone, tasksTotal, weeklyPct, longestStreak } = useMemo(() => {
    const todayTasks = schedule.activities[todayKey] ?? [];
    let done = 0;
    for (const t of todayTasks) {
      if (isTaskCompleted(t, t.subtasks?.length ?? 0)) done++;
    }

    // Weekly consistency: average completion % over last 7 days
    let weekTotal = 0;
    let weekDays = 0;
    for (let i = 0; i < 7; i++) {
      const iso = addDaysToISO(todayISO, -i);
      const dayKey = ["sun","mon","tue","wed","thu","fri","sat"][new Date(iso + "T00:00:00").getDay()] as DayKey;
      const dayTasks = schedule.activities[dayKey] ?? [];
      if (dayTasks.length > 0) {
        const dayDone = dayTasks.filter((t) => isTaskCompleted(t, t.subtasks?.length ?? 0)).length;
        weekTotal += Math.round((dayDone / dayTasks.length) * 100);
        weekDays++;
      }
    }
    const weeklyPct = weekDays > 0 ? Math.round(weekTotal / weekDays) : 0;

    // Longest ritual streak across all rituals
    let longestStreak = 0;
    for (const ritual of schedule.rituals ?? []) {
      const s = calcRitualStreak(ritual.id, schedule.ritualCompletions ?? [], ritual, todayISO);
      if (s > longestStreak) longestStreak = s;
    }

    return { tasksDone: done, tasksTotal: todayTasks.length, weeklyPct, longestStreak };
  }, [schedule, todayKey, todayISO]);

  // ── Today's tasks (compact list, max 5) ────────────────────────────────────

  const todayTasks = useMemo(() => schedule.activities[todayKey] ?? [], [schedule, todayKey]);

  // ── Rituals for today ───────────────────────────────────────────────────────

  const { todayRituals, ritualsDone } = useMemo(() => {
    const dayIdx = new Date(todayISO + "T00:00:00").getDay();
    const dayAbbr = ["sun","mon","tue","wed","thu","fri","sat"][dayIdx] as DayKey;
    const todayRituals = (schedule.rituals ?? []).filter(
      (r) => !r.repeatDays || r.repeatDays.length === 0 || r.repeatDays.includes(dayAbbr)
    );
    const completedToday = new Set(
      (schedule.ritualCompletions ?? []).filter((c) => c.date === todayISO).map((c) => c.ritualId)
    );
    const ritualsDone = todayRituals.filter((r) => completedToday.has(r.id)).length;
    return { todayRituals, ritualsDone, completedToday };
  }, [schedule, todayISO]);

  // ── Plan health ─────────────────────────────────────────────────────────────

  const planStats = useMemo(() =>
    schedule.plans.map((plan) => {
      const { dayState, consistency } = getPlanCardStats(plan, schedule.activities, todayKey);
      const taskCount = Object.values(schedule.activities).flat().filter((t) => t.planId === plan.id).length;
      const trackerCount = (schedule.progressTrackers ?? []).filter((t) => t.planId === plan.id).length;
      const status: "on_track" | "at_risk" | "delayed" =
        dayState === "complete" || consistency >= 70 ? "on_track" :
        consistency >= 35 ? "at_risk" : "delayed";
      return { plan, consistency, status, taskCount, trackerCount };
    }),
    [schedule, todayKey]
  );

  // ── Tracker pulse ───────────────────────────────────────────────────────────

  const trackerData = useMemo(() =>
    (schedule.progressTrackers ?? []).map((tracker) => {
      const entries = (schedule.metricEntries ?? [])
        .filter((e) => e.trackerId === tracker.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const latest = entries[0];
      const sparkValues = entries.slice(0, 7).reverse().map((e) => e.value);
      const plan = schedule.plans.find((p) => p.id === tracker.planId);
      return { tracker, latest, sparkValues, plan };
    }),
    [schedule]
  );

  // ── Discovery nudges ────────────────────────────────────────────────────────

  const nudges = useMemo(() => {
    const items: { icon: React.ElementType; title: string; desc: string; tab: number }[] = [];
    const hasMilestones = (schedule.milestones ?? []).length > 0;
    const hasCoachMessages = schedule.plans.some(
      (p) => Array.isArray((p as Plan & { coachMessages?: unknown[] }).coachMessages) &&
             ((p as Plan & { coachMessages?: unknown[] }).coachMessages?.length ?? 0) > 0
    );
    if (schedule.plans.length === 0) {
      items.push({ icon: IconClipboardData, title: "Create your first plan", desc: "Break goals into trackable tasks with milestones and progress.", tab: 1 });
    }
    if (schedule.plans.length > 0 && !hasMilestones) {
      items.push({ icon: IconMap2, title: "Map your milestones", desc: "Give your plans concrete checkpoints and target dates.", tab: 1 });
    }
    if (schedule.plans.length > 0 && !hasCoachMessages) {
      items.push({ icon: IconBrain, title: "Try the AI Coach", desc: "Get task suggestions, milestone breakdowns and weekly coaching — all local.", tab: 1 });
    }
    if (schedule.plans.length > 0 && (schedule.progressTrackers ?? []).length === 0) {
      items.push({ icon: IconTrendingUp, title: "Track your progress", desc: "Add metrics to a plan and log daily values to see trends.", tab: 1 });
    }
    if ((schedule.rituals ?? []).length === 0) {
      items.push({ icon: IconRepeat, title: "Build a daily routine", desc: "Add habits and rituals to stay consistent day after day.", tab: 2 });
    }
    if ((schedule.progressTrackers ?? []).length > 0 && (schedule.metricEntries ?? []).length < 3) {
      items.push({ icon: IconTarget, title: "Log your first metrics", desc: "Open a plan's tracker and record today's value.", tab: 1 });
    }
    return items;
  }, [schedule]);

  // ── Stat tile colors ────────────────────────────────────────────────────────

  const taskColor: StatTileProps["color"] =
    tasksTotal === 0 ? "neutral" : tasksDone === tasksTotal ? "emerald" : tasksDone > 0 ? "amber" : "neutral";
  const weekColor: StatTileProps["color"] =
    weeklyPct >= 70 ? "emerald" : weeklyPct >= 40 ? "amber" : weeklyPct > 0 ? "rose" : "neutral";
  const streakColor: StatTileProps["color"] = longestStreak >= 3 ? "amber" : "neutral";

  // ── Status config ───────────────────────────────────────────────────────────

  type PlanStatus = "on_track" | "at_risk" | "delayed";
  const STATUS_CFG: Record<PlanStatus, { label: string; text: string; dot: string; pulse: boolean }> = {
    on_track: { label: "On Track",    text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", pulse: true },
    at_risk:  { label: "At Risk",     text: "text-amber-600 dark:text-amber-400",     dot: "bg-amber-500",  pulse: false },
    delayed:  { label: "Needs Focus", text: "text-rose-600 dark:text-rose-400",       dot: "bg-rose-500",   pulse: false },
  } as const;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 pt-5 pb-24 lg:px-8 lg:pt-8 lg:pb-10">

      {/* ── Page title ─────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="mt-0.5 text-[28px] font-extrabold leading-tight text-neutral-950 dark:text-white">
          Overview
        </h1>
      </div>

      {/* ── Section 1: Hero Stats ──────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          value={tasksTotal === 0 ? "—" : `${tasksDone}/${tasksTotal}`}
          label="Tasks Today"
          sub={tasksDone === tasksTotal && tasksTotal > 0 ? "All done ✓" : tasksTotal > 0 ? `${tasksTotal - tasksDone} remaining` : "No tasks today"}
          color={taskColor}
          onClick={() => onNavigate(0)}
        />
        <StatTile
          value={`${weeklyPct}%`}
          label="Weekly Pace"
          sub={weeklyPct >= 70 ? "Strong week" : weeklyPct >= 40 ? "Keep going" : "Room to improve"}
          color={weekColor}
          onClick={() => onNavigate(3)}
        />
        <StatTile
          value={schedule.plans.length}
          label="Active Plans"
          sub={schedule.plans.length === 1 ? "1 plan running" : `${schedule.plans.length} plans running`}
          color="neutral"
          onClick={() => onNavigate(1)}
        />
        <StatTile
          value={longestStreak === 0 ? "—" : `${longestStreak}d`}
          label="Best Streak"
          sub={longestStreak === 0 ? "No streaks yet" : longestStreak >= 7 ? "On fire 🔥" : "Keep it going"}
          color={streakColor}
          onClick={() => onNavigate(2)}
        />
      </div>

      {/* ── Section 2: Today's Execution ─────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel label="Today" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_240px]">

          {/* Task list */}
          <div className="rounded-2xl border border-neutral-200/70 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
            {todayTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <IconCalendarEvent size={24} strokeWidth={1.5} className="mb-2 text-neutral-300 dark:text-neutral-600" />
                <p className="text-[13px] text-neutral-400 dark:text-neutral-500">No tasks scheduled for today</p>
                <button
                  type="button"
                  onClick={() => { haptic("light"); onNavigate(0); }}
                  className="mt-3 text-[12px] font-semibold text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                >
                  Go to Today →
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {todayTasks.slice(0, 5).map((task) => {
                    const done = isTaskCompleted(task, task.subtasks?.length ?? 0);
                    return (
                      <div key={task.id} className="flex items-center gap-3">
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${done ? "border-emerald-500 bg-emerald-500" : "border-neutral-300 dark:border-neutral-600"}`}>
                          {done && <IconCheck size={10} strokeWidth={3} className="text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[13px] font-semibold leading-none ${done ? "text-neutral-400 line-through dark:text-neutral-600" : "text-neutral-900 dark:text-white"}`}>
                            {task.title}
                          </p>
                          {(task.startTime || task.endTime) && (
                            <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                              {formatTime(task.startTime)}{task.endTime ? ` – ${formatTime(task.endTime)}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {todayTasks.length > 5 && (
                  <button
                    type="button"
                    onClick={() => { haptic("light"); onNavigate(0); }}
                    className="mt-3 text-[12px] font-semibold text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  >
                    +{todayTasks.length - 5} more · Open Today →
                  </button>
                )}
              </>
            )}
          </div>

          {/* Ritual ring */}
          <div className="rounded-2xl border border-neutral-200/70 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-300">Rituals</p>
              {todayRituals.length > 0 && (
                <span className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
                  {ritualsDone}/{todayRituals.length}
                </span>
              )}
            </div>
            {todayRituals.length === 0 ? (
              <p className="text-[12px] text-neutral-400 dark:text-neutral-500">No rituals today</p>
            ) : (
              <div className="space-y-2">
                {todayRituals.map((ritual, i) => {
                  const completedToday = new Set(
                    (schedule.ritualCompletions ?? []).filter((c) => c.date === todayISO).map((c) => c.ritualId)
                  );
                  const done = completedToday.has(ritual.id);
                  const accent = accentStyles(ritual.color ?? "cyan");
                  return (
                    <div key={ritual.id} className="flex items-center gap-2.5">
                      <div className={`h-2 w-2 shrink-0 rounded-full ${done ? "bg-emerald-500" : accent.dot}`} />
                      <p className={`min-w-0 flex-1 truncate text-[12px] font-medium ${done ? "text-neutral-400 line-through dark:text-neutral-600" : "text-neutral-700 dark:text-neutral-300"}`}>
                        {ritual.title}
                      </p>
                      {ritual.time && (
                        <span className="shrink-0 text-[11px] text-neutral-400 dark:text-neutral-500">
                          {formatTime(ritual.time)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Plan Health ────────────────────────────────────────── */}
      {schedule.plans.length > 0 && (
        <div className="mb-6">
          <SectionLabel label="Plan Health" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {planStats.map(({ plan, consistency, status, taskCount, trackerCount }) => {
              const accent = accentStyles(plan.color ?? "cyan");
              const cfg = STATUS_CFG[status];
              return (
                <motion.button
                  key={plan.id}
                  type="button"
                  onClick={() => { haptic("light"); onNavigate(1); }}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.987 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className={`w-full rounded-2xl border border-neutral-200/70 bg-white px-5 py-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)] border-l-[3px] ${accent.leftBorder}`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[16px] leading-none shrink-0">{plan.emoji}</span>
                      <p className="truncate text-[14px] font-bold text-neutral-900 dark:text-white">
                        {plan.title}
                      </p>
                    </div>
                    <div className={`flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] ${cfg.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot} ${cfg.pulse ? "animate-pulse" : ""}`} />
                      {cfg.label}
                    </div>
                  </div>

                  {/* Consistency bar */}
                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">Consistency</span>
                      <span className="text-[11px] font-bold tabular-nums text-neutral-700 dark:text-neutral-300">{consistency}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.07]">
                      <motion.div
                        className={`h-full rounded-full ${accent.dot}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${consistency}%` }}
                        transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                    <IconClipboardList size={11} strokeWidth={2.2} className="shrink-0" />
                    {taskCount} task{taskCount !== 1 ? "s" : ""}
                    {trackerCount > 0 && <span> · {trackerCount} tracked</span>}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Section 4: Tracker Pulse ──────────────────────────────────────── */}
      <div className="mb-6">
        <SectionLabel label="Tracker Pulse" />
        {trackerData.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200/70 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
                <IconChartBar size={18} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">No trackers yet</p>
                <p className="text-[12px] text-neutral-400 dark:text-neutral-500">Add metrics to a plan to track numbers over time.</p>
              </div>
              <button
                type="button"
                onClick={() => { haptic("light"); onNavigate(1); }}
                className="shrink-0 flex items-center gap-1 rounded-xl bg-neutral-900 px-3 py-1.5 text-[12px] font-semibold text-white dark:bg-white dark:text-neutral-900"
              >
                Set up <IconArrowRight size={11} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {trackerData.map(({ tracker, latest, sparkValues, plan }) => {
              const accent = accentStyles(plan?.color ?? "cyan");
              return (
                <button
                  key={tracker.id}
                  type="button"
                  onClick={() => { haptic("light"); onNavigate(1); }}
                  className="flex w-[160px] shrink-0 flex-col rounded-2xl border border-neutral-200/70 bg-white px-4 py-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
                    <p className="truncate text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                      {tracker.title}
                    </p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-[24px] font-extrabold leading-none tabular-nums text-neutral-900 dark:text-white">
                      {latest ? latest.value : "—"}
                    </span>
                    {tracker.unit && (
                      <span className="text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                        {tracker.unit}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex-1">
                    {sparkValues.length >= 2 ? (
                      <Sparkline values={sparkValues} color={plan?.color ?? "cyan"} />
                    ) : (
                      <p className="text-[10px] text-neutral-300 dark:text-neutral-600">Not enough data</p>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[10px] text-neutral-400 dark:text-neutral-500">
                    {plan?.emoji} {plan?.title}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 5: What's Possible ────────────────────────────────────── */}
      <div className="mb-2">
        <SectionLabel label="What's Possible" />
        {nudges.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200/70 bg-white px-5 py-5 shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3">
              <span className="text-[22px]">🎉</span>
              <div>
                <p className="text-[14px] font-bold text-neutral-900 dark:text-white">You're all set</p>
                <p className="text-[12px] text-neutral-400 dark:text-neutral-500">You're using every feature PlanR has to offer. Keep building.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nudges.map((nudge) => {
              const NudgeIcon = nudge.icon;
              return (
                <motion.button
                  key={nudge.title}
                  type="button"
                  onClick={() => { haptic("light"); onNavigate(nudge.tab); }}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.987 }}
                  transition={{ type: "spring", stiffness: 420, damping: 30 }}
                  className="flex items-start gap-3 rounded-2xl border border-neutral-200/70 bg-white px-5 py-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
                    <NudgeIcon size={17} strokeWidth={1.8} className="text-neutral-600 dark:text-neutral-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-neutral-900 dark:text-white">{nudge.title}</p>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-neutral-400 dark:text-neutral-500">{nudge.desc}</p>
                  </div>
                  <IconArrowRight size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
