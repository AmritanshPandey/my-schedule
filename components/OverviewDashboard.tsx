"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconArrowRight,
  IconBolt,
  IconBrain,
  IconCalendarEvent,
  IconCheck,
  IconClipboardData,
  IconClipboardList,
  IconMap2,
  IconPlus,
  IconRepeat,
  IconTarget,
  IconTrendingUp,
} from "@tabler/icons-react";
import type { Schedule, DayKey, Task, Plan, ProgressTracker, RitualCompletion, Ritual } from "@/lib/useScheduleDB";
import { isTaskCompleted } from "@/lib/taskCompletion";
import { getPlanCardStats } from "@/lib/planInsights";
import { accentStyles } from "@/lib/colorSystem";
import { localISODate, addDaysToISO } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";

// ── Props ─────────────────────────────────────────────────────────────────────

interface OverviewDashboardProps {
  schedule: Schedule;
  todayKey: DayKey;
  onNavigate: (tab: number) => void;
  onMarkTaskDone: (taskId: string, subtaskIds: string[]) => void;
  completedRitualIds: Set<string>;
  onLogTracker: (tracker: ProgressTracker) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHM(t: string): [number, number] | null {
  const match = t.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return [h, m];
}

function formatTime(t?: string): string {
  if (!t) return "";
  const hm = parseHM(t);
  if (!hm) return t;
  const [h, m] = hm;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${ampm}` : `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

function calcDuration(start?: string, end?: string): string {
  if (!start || !end) return "";
  const shm = parseHM(start);
  const ehm = parseHM(end);
  if (!shm || !ehm) return "";
  const mins = (ehm[0] * 60 + ehm[1]) - (shm[0] * 60 + shm[1]);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m}m`;
}

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
      ritual.repeatDays.includes(["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][dayOfWeek] as DayKey);
    if (scheduled) {
      if (done.has(cursor)) streak++;
      else break;
    }
    cursor = addDaysToISO(cursor, -1);
  }
  return streak;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <div className="h-8 w-full" />;
  const W = 100; const H = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x},${y}`;
  });
  const strokeMap: Record<string, string> = {
    blue: "stroke-blue-500", emerald: "stroke-emerald-500",
    violet: "stroke-violet-500", pink: "stroke-pink-500",
    amber: "stroke-amber-500", cyan: "stroke-cyan-500",
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-8 w-full ${strokeMap[color] ?? strokeMap.cyan} dark:opacity-80`} preserveAspectRatio="none">
      <path d={`M ${pts.join(" L ")}`} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Shared card shell ─────────────────────────────────────────────────────────

const CARD = "rounded-2xl border border-neutral-200/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_2px_8px_rgba(0,0,0,0.04)] dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]";

// ── Stat tile (desktop only) ──────────────────────────────────────────────────

type TileColor = "emerald" | "amber" | "rose" | "neutral";

const TILE_COLOR: Record<TileColor, { val: string; sub: string; dot: string }> = {
  emerald: { val: "text-emerald-600 dark:text-emerald-400", sub: "text-emerald-500/70 dark:text-emerald-400/60", dot: "bg-emerald-500" },
  amber:   { val: "text-amber-600 dark:text-amber-400",   sub: "text-amber-500/70 dark:text-amber-400/60",   dot: "bg-amber-500" },
  rose:    { val: "text-rose-600 dark:text-rose-400",     sub: "text-rose-500/70 dark:text-rose-400/60",     dot: "bg-rose-500" },
  neutral: { val: "text-neutral-900 dark:text-white",     sub: "text-neutral-400 dark:text-neutral-500",     dot: "bg-neutral-400 dark:bg-neutral-600" },
};

function StatTile({ value, label, sub, color, onClick }: {
  value: string | number; label: string; sub: string; color: TileColor; onClick?: () => void;
}) {
  const c = TILE_COLOR[color];
  return (
    <button
      type="button"
      onClick={() => { if (onClick) { haptic("light"); onClick(); } }}
      className={`${CARD} flex flex-col gap-1.5 px-4 py-4 text-left transition-transform active:scale-[0.98]`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} />
        <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-neutral-400 dark:text-neutral-500">{label}</span>
      </div>
      <span className={`text-[30px] font-extrabold leading-none tabular-nums ${c.val}`}>{value}</span>
      <span className={`text-[11.5px] font-medium leading-none ${c.sub}`}>{sub}</span>
    </button>
  );
}

// ── Status config ─────────────────────────────────────────────────────────────

type PlanStatus = "on_track" | "at_risk" | "delayed";
const STATUS_CFG: Record<PlanStatus, { label: string; text: string; dot: string; pulse: boolean }> = {
  on_track: { label: "On Track",    text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", pulse: true },
  at_risk:  { label: "At Risk",     text: "text-amber-600 dark:text-amber-400",     dot: "bg-amber-500",  pulse: false },
  delayed:  { label: "Needs Focus", text: "text-rose-600 dark:text-rose-400",       dot: "bg-rose-500",   pulse: false },
};

// ── Main component ────────────────────────────────────────────────────────────

export default function OverviewDashboard({
  schedule, todayKey, onNavigate,
  onMarkTaskDone, completedRitualIds, onLogTracker,
}: OverviewDashboardProps) {
  // Per-task skip set — persists while on this day
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  useEffect(() => { setSkippedIds(new Set()); }, [todayKey]);
  // Rotate exit only when card is skipped (not marked done)
  const [skipExit, setSkipExit] = useState(false);
  // Inline task list toggle
  const [showAllTasks, setShowAllTasks] = useState(false);
  const todayISO = localISODate(new Date());

  // ── Shared computed data ──────────────────────────────────────────────────

  const { tasksDone, tasksTotal, weeklyPct, longestStreak } = useMemo(() => {
    const todayTasks = schedule.activities[todayKey] ?? [];
    const done = todayTasks.filter((t) => isTaskCompleted(t, t.subtasks?.length ?? 0)).length;
    let weekTotal = 0; let weekDays = 0;
    for (let i = 0; i < 7; i++) {
      const iso = addDaysToISO(todayISO, -i);
      const dk = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][new Date(iso + "T00:00:00").getDay()] as DayKey;
      const dt = schedule.activities[dk] ?? [];
      if (dt.length > 0) {
        weekTotal += Math.round((dt.filter((t) => isTaskCompleted(t, t.subtasks?.length ?? 0)).length / dt.length) * 100);
        weekDays++;
      }
    }
    let longest = 0;
    for (const r of schedule.rituals ?? []) {
      const s = calcRitualStreak(r.id, schedule.ritualCompletions ?? [], r, todayISO);
      if (s > longest) longest = s;
    }
    return { tasksDone: done, tasksTotal: todayTasks.length, weeklyPct: weekDays > 0 ? Math.round(weekTotal / weekDays) : 0, longestStreak: longest };
  }, [schedule, todayKey, todayISO]);

  const todayTasks = useMemo(() => schedule.activities[todayKey] ?? [], [schedule, todayKey]);

  // Incomplete tasks not yet skipped — used by the swipeable stack
  const incompleteTasks = useMemo(() =>
    todayTasks.filter((t) => !isTaskCompleted(t, t.subtasks?.length ?? 0) && !skippedIds.has(t.id)),
    [todayTasks, skippedIds]
  );

  const { todayRituals, ritualsDone } = useMemo(() => {
    const dayIdx = new Date(todayISO + "T00:00:00").getDay();
    const da = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][dayIdx] as DayKey;
    const tr = (schedule.rituals ?? []).filter(
      (r) => !r.repeatDays || r.repeatDays.length === 0 || r.repeatDays.includes(da)
    );
    return { todayRituals: tr, ritualsDone: tr.filter((r) => completedRitualIds.has(r.id)).length };
  }, [schedule, todayISO, completedRitualIds]);

  const planStats = useMemo(() =>
    schedule.plans.map((plan) => {
      const { dayState, consistency } = getPlanCardStats(plan, schedule.activities, todayKey);
      const taskCount = Object.values(schedule.activities).flat().filter((t) => t.planId === plan.id).length;
      const status: PlanStatus = dayState === "complete" || consistency >= 70 ? "on_track" : consistency >= 35 ? "at_risk" : "delayed";
      return { plan, consistency, status, taskCount };
    }),
    [schedule, todayKey]
  );

  const trackerData = useMemo(() =>
    (schedule.progressTrackers ?? []).map((tracker) => {
      const entries = (schedule.metricEntries ?? [])
        .filter((e) => e.trackerId === tracker.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      return {
        tracker,
        latest: entries[0],
        sparkValues: entries.slice(0, 7).reverse().map((e) => e.value),
        plan: schedule.plans.find((p) => p.id === tracker.planId),
      };
    }),
    [schedule]
  );

  const nudges = useMemo(() => {
    const items: { icon: React.ElementType; title: string; desc: string; tab: number }[] = [];
    const hasMilestones = (schedule.milestones ?? []).length > 0;
    const hasCoach = schedule.plans.some((p) => ((p as Plan & { coachMessages?: unknown[] }).coachMessages?.length ?? 0) > 0);
    if (schedule.plans.length === 0)
      items.push({ icon: IconClipboardData, title: "Create your first plan", desc: "Break goals into trackable tasks with milestones and progress.", tab: 1 });
    if (schedule.plans.length > 0 && !hasMilestones)
      items.push({ icon: IconMap2, title: "Map your milestones", desc: "Give plans concrete checkpoints and target dates.", tab: 1 });
    if (schedule.plans.length > 0 && !hasCoach)
      items.push({ icon: IconBrain, title: "Try the AI Coach", desc: "Get task suggestions and weekly coaching — runs locally.", tab: 1 });
    if (schedule.plans.length > 0 && (schedule.progressTrackers ?? []).length === 0)
      items.push({ icon: IconTrendingUp, title: "Track your progress", desc: "Add metrics to plans and log daily values to see trends.", tab: 1 });
    if ((schedule.rituals ?? []).length === 0)
      items.push({ icon: IconRepeat, title: "Build a daily routine", desc: "Add habits to stay consistent day after day.", tab: 2 });
    if ((schedule.progressTrackers ?? []).length > 0 && (schedule.metricEntries ?? []).length < 3)
      items.push({ icon: IconTarget, title: "Log your first metrics", desc: "Open a plan tracker and record today's value.", tab: 1 });
    return items;
  }, [schedule]);


  // ── Mobile — Weekly activity for first plan ────────────────────────────────

  const weeklyActivity = useMemo(() => {
    const plan = schedule.plans[0] ?? null;
    if (!plan) return null;
    const DAYS_ORDER: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const days = DAYS_ORDER.map((dk, i) => {
      const tasks = (schedule.activities[dk] ?? []).filter((t) => t.planId === plan.id);
      const total = tasks.length;
      const done = tasks.filter((t) => isTaskCompleted(t, t.subtasks?.length ?? 0)).length;
      return { label: DAY_LABELS[i], total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
    const totalTasks = days.reduce((s, d) => s + d.total, 0);
    const totalDone = days.reduce((s, d) => s + d.done, 0);
    const tasksPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;
    const habitsPct = todayRituals.length > 0 ? Math.round((ritualsDone / todayRituals.length) * 100) : 0;
    return { plan, days, tasksPct, habitsPct };
  }, [schedule, todayRituals, ritualsDone]);

  // ── Derived colors ────────────────────────────────────────────────────────

  const taskColor: TileColor = tasksTotal === 0 ? "neutral" : tasksDone === tasksTotal ? "emerald" : tasksDone > 0 ? "amber" : "neutral";
  const weekColor: TileColor = weeklyPct >= 70 ? "emerald" : weeklyPct >= 40 ? "amber" : weeklyPct > 0 ? "rose" : "neutral";
  const streakColor: TileColor = longestStreak >= 3 ? "amber" : "neutral";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pb-24 lg:px-6 lg:pt-6 lg:pb-8">

      {/* ═══════════════════════════════════════════════════════════════════════
          MOBILE LAYOUT (< lg) — Reference design
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="lg:hidden">

        {/* ── 1. Task count + swipeable card stack ─────────────────────────── */}
        <div className="px-4 pt-5 mb-5">
          {/* Count row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
              <IconClipboardList size={14} strokeWidth={2} className="shrink-0" />
              <span className="font-bold text-neutral-900 dark:text-white">{tasksDone}/{tasksTotal}</span>
              <span>Tasks Done</span>
            </div>
            <button
              type="button"
              onClick={() => { haptic("light"); setShowAllTasks((v) => !v); }}
              className="text-[14px] font-bold text-neutral-600 dark:text-neutral-300"
            >
              {showAllTasks ? "Hide ↑" : "View All"}
            </button>
          </div>

          {/* ── Swipeable card stack ── */}
          <AnimatePresence mode="wait">
            {incompleteTasks.length > 0 ? (
              <motion.div key={incompleteTasks[0].id}
                initial={{ opacity: 0, y: 8, scale: 0.98, rotate: 0 }}
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                exit={skipExit
                  ? { opacity: 0, y: -60, rotate: 14, scale: 0.88, transition: { duration: 0.28 } }
                  : { opacity: 0, y: -50, scale: 0.95, rotate: 0, transition: { duration: 0.2 } }
                }
                transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                {/*
                  Stack container:
                  paddingTop creates visible space for peeking cards.
                  Shadow cards anchor top=0/top-[18px] and extend to bottom-0,
                  so they fill the container and only their top edges are visible
                  above the front card (which starts after the padding).
                */}
                <div
                  className="relative"
                  style={{
                    paddingTop: incompleteTasks.length >= 3 ? 40 : incompleteTasks.length >= 2 ? 20 : 0,
                  }}
                >
                  {/* Card 3 — deepest */}
                  {incompleteTasks.length >= 3 && (
                    <div
                      className="absolute inset-x-2 top-0 bottom-0 rounded-2xl border border-emerald-200/25 bg-emerald-50/35 dark:border-emerald-500/20 dark:bg-[#1A2B22]"
                      style={{ zIndex: 0 }}
                    />
                  )}
                  {/* Card 2 — middle */}
                  {incompleteTasks.length >= 2 && (
                    <div
                      className="absolute inset-x-1 bottom-0 rounded-2xl border border-emerald-200/45 bg-emerald-50/60 dark:border-emerald-500/25 dark:bg-[#1E3028]"
                      style={{ zIndex: 1, top: incompleteTasks.length >= 3 ? 18 : 0 }}
                    />
                  )}

                  {/* Front card — draggable */}
                  <motion.div
                    className="relative z-10 cursor-grab rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white px-5 py-5 shadow-[0_2px_16px_rgba(16,185,129,0.13)] dark:bg-none dark:bg-[#243D30] dark:border-emerald-500/30 active:cursor-grabbing"
                    drag="y"
                    dragConstraints={{ top: -220, bottom: 20 }}
                    dragElastic={{ top: 0.45, bottom: 0.1 }}
                    dragMomentum={false}
                    onDragEnd={(_, info) => {
                      if (info.offset.y < -55) {
                        haptic("light");
                        setSkipExit(true);
                        setSkippedIds((prev) => new Set([...prev, incompleteTasks[0].id]));
                      }
                    }}
                    style={{ touchAction: "pan-x" }}
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <IconBolt size={13} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />
                        <span className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">Next up</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {incompleteTasks.length > 1 && (
                          <span className="text-[11px] font-semibold text-neutral-400 dark:text-emerald-200/50">
                            {incompleteTasks.length} left
                          </span>
                        )}
                        {calcDuration(incompleteTasks[0].startTime, incompleteTasks[0].endTime) && (
                          <span className="text-[12px] font-semibold text-neutral-400 dark:text-emerald-200/50">
                            {calcDuration(incompleteTasks[0].startTime, incompleteTasks[0].endTime)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Task title */}
                    <p className="text-[21px] font-extrabold leading-tight text-neutral-950 dark:text-white">
                      {incompleteTasks[0].title}
                    </p>

                    {/* Plan name */}
                    {(() => {
                      const p = schedule.plans.find((pl) => pl.id === incompleteTasks[0].planId);
                      return p ? (
                        <p className="mt-0.5 text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {p.emoji} {p.title}
                        </p>
                      ) : null;
                    })()}

                    {/* Time */}
                    {incompleteTasks[0].startTime && (
                      <p className="mt-1 mb-4 text-[13px] text-neutral-500 dark:text-emerald-200/60">
                        {formatTime(incompleteTasks[0].startTime)}
                        {incompleteTasks[0].endTime ? ` — ${formatTime(incompleteTasks[0].endTime)}` : ""}
                      </p>
                    )}
                    {!incompleteTasks[0].startTime && <div className="mb-4" />}

                    {/* Mark Done — no icon */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        haptic("medium");
                        setSkipExit(false);
                        onMarkTaskDone(incompleteTasks[0].id, incompleteTasks[0].subtasks?.map((s) => s.id) ?? []);
                      }}
                      className="rounded-full bg-emerald-600 px-6 py-2.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                    >
                      Mark Done
                    </motion.button>
                  </motion.div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="all-done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-2xl border border-neutral-200/70 bg-white px-5 py-5 dark:border-white/[0.07] dark:bg-neutral-900">
                <p className="text-[15px] font-bold text-neutral-900 dark:text-white">
                  {tasksTotal === 0 ? "No tasks today" : "You're all caught up! ✓"}
                </p>
                <p className="mt-0.5 text-[13px] text-neutral-400 dark:text-neutral-500">
                  {tasksTotal === 0 ? "Head to Today to add tasks." : "Great work — all tasks done."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Inline task list (View All) ── */}
          <AnimatePresence>
            {showAllTasks && todayTasks.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className={`${CARD} mt-3 divide-y divide-neutral-100 dark:divide-white/[0.05]`}>
                  {todayTasks.map((task) => {
                    const done = isTaskCompleted(task, task.subtasks?.length ?? 0);
                    const plan = schedule.plans.find((p) => p.id === task.planId);
                    return (
                      <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px] ${done ? "border-emerald-500 bg-emerald-500" : "border-neutral-300 dark:border-neutral-600"}`}>
                          {done && <IconCheck size={9} strokeWidth={3} className="text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] font-semibold leading-snug ${done ? "text-neutral-400 line-through dark:text-neutral-600" : "text-neutral-900 dark:text-white"}`}>
                            {task.title}
                          </p>
                          {(task.startTime || plan) && (
                            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                              {task.startTime && formatTime(task.startTime)}
                              {task.startTime && plan && " · "}
                              {plan && `${plan.emoji} ${plan.title}`}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── 3. Weekly Activity card ───────────────────────────────────────── */}
        {weeklyActivity && (
          <div className="mx-4 mb-4">
            <div className={`${CARD} px-5 py-4`}>
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <IconCalendarEvent size={14} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500 shrink-0" />
                <p className="text-[13px] font-bold text-neutral-800 dark:text-neutral-200 truncate">
                  {weeklyActivity.plan.emoji} {weeklyActivity.plan.title}
                </p>
              </div>

              {/* 7-day bars */}
              <div className="flex items-end justify-between gap-1 mb-3">
                {weeklyActivity.days.map(({ label, total, done, pct }) => {
                  const barColor =
                    total === 0 ? "bg-neutral-200 dark:bg-white/[0.08]" :
                    pct >= 70 ? "bg-emerald-500" :
                    pct >= 40 ? "bg-amber-400" : "bg-rose-400";
                  return (
                    <div key={label} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500">{label}</span>
                      {/* Bar track */}
                      <div className="w-full rounded-full bg-neutral-100 dark:bg-white/[0.07]" style={{ height: 4 }}>
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: total > 0 ? `${pct}%` : "0%" }}
                        />
                      </div>
                      <span className="text-[9.5px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
                        {done}/{total}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Stats row */}
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl bg-neutral-50 dark:bg-white/[0.04] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-neutral-400 dark:text-neutral-500 mb-1">Tasks Done</p>
                  <p className="text-[22px] font-extrabold leading-none tabular-nums text-neutral-900 dark:text-white">
                    {weeklyActivity.tasksPct}<span className="text-[14px] font-bold">%</span>
                  </p>
                </div>
                <div className="flex-1 rounded-xl bg-neutral-50 dark:bg-white/[0.04] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.07em] text-neutral-400 dark:text-neutral-500 mb-1">Habits Done</p>
                  <p className="text-[22px] font-extrabold leading-none tabular-nums text-neutral-900 dark:text-white">
                    {weeklyActivity.habitsPct}<span className="text-[14px] font-bold">%</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 4. Active Tracking list ───────────────────────────────────────── */}
        <div className="mx-4 mb-4">
          <div className={`${CARD} px-5 py-4`}>
            <div className="flex items-center gap-2 mb-3">
              <IconTarget size={14} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500 shrink-0" />
              <p className="text-[13px] font-bold text-neutral-700 dark:text-neutral-300">Active Tracking</p>
            </div>

            {trackerData.length === 0 ? (
              <div className="flex items-center justify-between py-1">
                <p className="text-[13px] text-neutral-400 dark:text-neutral-500">No trackers yet</p>
                <button
                  type="button"
                  onClick={() => { haptic("light"); onNavigate(1); }}
                  className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  Set up →
                </button>
              </div>
            ) : (
              <div className="space-y-0 divide-y divide-neutral-100 dark:divide-white/[0.05]">
                {trackerData.map(({ tracker, latest, plan }) => {
                  const accent = accentStyles(plan?.color ?? "cyan");
                  return (
                    <div key={tracker.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className={`h-3 w-3 shrink-0 rounded-full ${accent.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold text-neutral-900 dark:text-white leading-tight">{tracker.title}</p>
                        <p className="text-[12px] text-neutral-400 dark:text-neutral-500 leading-tight">
                          {latest ? `${latest.value}${tracker.unit ? ` ${tracker.unit}` : ""}` : "No entries yet"}
                        </p>
                      </div>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.88 }}
                        onClick={() => { haptic("light"); onLogTracker(tracker); }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      >
                        <IconPlus size={16} strokeWidth={2.5} />
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── 5. What's Possible nudges ─────────────────────────────────────── */}
        {nudges.length > 0 && (
          <div className="mx-4 mb-4">
            <div className={`${CARD} px-5 py-4`}>
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500 mb-3">What's Possible</p>
              <div className="space-y-2">
                {nudges.map((nudge) => {
                  const NudgeIcon = nudge.icon;
                  return (
                    <motion.button
                      key={nudge.title}
                      type="button"
                      onClick={() => { haptic("light"); onNavigate(nudge.tab); }}
                      whileTap={{ scale: 0.987 }}
                      className="flex w-full items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50 px-3.5 py-3 text-left dark:border-white/[0.05] dark:bg-white/[0.03]"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-200/60 dark:bg-white/[0.07]">
                        <NudgeIcon size={15} strokeWidth={1.8} className="text-neutral-600 dark:text-neutral-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-bold text-neutral-900 dark:text-white">{nudge.title}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">{nudge.desc}</p>
                      </div>
                      <IconArrowRight size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          DESKTOP BENTO GRID (≥ lg) — unchanged
      ════════════════════════════════════════════════════════════════════════ */}
      <div className="hidden lg:block px-6 pt-6">
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight text-neutral-950 dark:text-white">Overview</h1>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatTile
            value={tasksTotal === 0 ? "—" : `${tasksDone}/${tasksTotal}`}
            label="Tasks Today"
            sub={tasksDone === tasksTotal && tasksTotal > 0 ? "All done ✓" : tasksTotal > 0 ? `${tasksTotal - tasksDone} remaining` : "No tasks today"}
            color={taskColor} onClick={() => onNavigate(0)}
          />
          <StatTile
            value={`${weeklyPct}%`} label="Weekly Pace"
            sub={weeklyPct >= 70 ? "Strong week" : weeklyPct >= 40 ? "Keep going" : weeklyPct > 0 ? "Room to improve" : "No data yet"}
            color={weekColor} onClick={() => onNavigate(3)}
          />
          <StatTile
            value={longestStreak === 0 ? "—" : `${longestStreak}d`} label="Best Streak"
            sub={longestStreak >= 7 ? "On fire 🔥" : longestStreak >= 3 ? "Keep it going" : longestStreak === 0 ? "No streaks yet" : "Building up"}
            color={streakColor} onClick={() => onNavigate(2)}
          />

          {/* Row 1–2, col 4: Plan Health (row-span-2) */}
          <div className="row-span-2">
            <PlanHealthCard planStats={planStats} onNavigate={onNavigate} tall />
          </div>

          {/* Row 2, cols 1–3: Today's execution */}
          <div className="col-span-3">
            <TodayCard
              todayTasks={todayTasks} todayRituals={todayRituals}
              completedTodayIds={completedRitualIds} todayISO={todayISO}
              schedule={schedule} onNavigate={onNavigate}
            />
          </div>

          {/* Row 3, col-span-4: Trackers + Discovery */}
          <div className="col-span-4">
            <BottomCard trackerData={trackerData} nudges={nudges} onNavigate={onNavigate} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Desktop sub-components (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function TodayCard({
  todayTasks, todayRituals, completedTodayIds, todayISO, schedule, onNavigate,
}: {
  todayTasks: Task[];
  todayRituals: Ritual[];
  completedTodayIds: Set<string>;
  todayISO: string;
  schedule: Schedule;
  onNavigate: (tab: number) => void;
}) {
  const ritualsDone = todayRituals.filter((r) => completedTodayIds.has(r.id)).length;
  return (
    <div className={`${CARD} px-5 py-5 h-full`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Today</p>
        <button type="button" onClick={() => { haptic("light"); onNavigate(0); }}
          className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
          Open <IconArrowRight size={11} strokeWidth={2.5} />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">
              Tasks
              {todayTasks.length > 0 && (
                <span className="ml-1.5 text-neutral-400 dark:text-neutral-500 font-normal">
                  {todayTasks.filter((t) => isTaskCompleted(t, t.subtasks?.length ?? 0)).length}/{todayTasks.length}
                </span>
              )}
            </p>
          </div>
          {todayTasks.length === 0 ? (
            <div className="flex items-center gap-2 py-2">
              <IconCalendarEvent size={14} strokeWidth={1.5} className="text-neutral-300 dark:text-neutral-600 shrink-0" />
              <p className="text-[12px] text-neutral-400 dark:text-neutral-500">No tasks scheduled</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {todayTasks.slice(0, 5).map((task) => {
                const done = isTaskCompleted(task, task.subtasks?.length ?? 0);
                return (
                  <div key={task.id} className="flex items-center gap-2.5">
                    <div className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${done ? "border-emerald-500 bg-emerald-500" : "border-neutral-300 dark:border-neutral-600"}`}>
                      {done && <IconCheck size={9} strokeWidth={3} className="text-white" />}
                    </div>
                    <p className={`truncate text-[13px] font-semibold ${done ? "text-neutral-400 line-through dark:text-neutral-600" : "text-neutral-900 dark:text-white"}`}>
                      {task.title}
                    </p>
                  </div>
                );
              })}
              {todayTasks.length > 5 && (
                <button type="button" onClick={() => { haptic("light"); onNavigate(0); }}
                  className="text-[11.5px] font-semibold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                  +{todayTasks.length - 5} more
                </button>
              )}
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[12px] font-semibold text-neutral-600 dark:text-neutral-300">
              Rituals
              {todayRituals.length > 0 && (
                <span className="ml-1.5 text-neutral-400 dark:text-neutral-500 font-normal">{ritualsDone}/{todayRituals.length}</span>
              )}
            </p>
          </div>
          {todayRituals.length === 0 ? (
            <div className="flex items-center gap-2 py-2">
              <IconRepeat size={14} strokeWidth={1.5} className="text-neutral-300 dark:text-neutral-600 shrink-0" />
              <p className="text-[12px] text-neutral-400 dark:text-neutral-500">No rituals today</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {todayRituals.slice(0, 5).map((ritual) => {
                const done = completedTodayIds.has(ritual.id);
                const accent = accentStyles(ritual.color ?? "cyan");
                return (
                  <div key={ritual.id} className="flex items-center gap-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${done ? "bg-emerald-500" : accent.dot}`} />
                    <p className={`min-w-0 flex-1 truncate text-[13px] font-medium ${done ? "line-through text-neutral-400 dark:text-neutral-600" : "text-neutral-800 dark:text-neutral-200"}`}>
                      {ritual.title}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanHealthCard({
  planStats, onNavigate, tall,
}: {
  planStats: { plan: Plan; consistency: number; status: PlanStatus; taskCount: number }[];
  onNavigate: (tab: number) => void;
  tall?: boolean;
}) {
  return (
    <div className={`${CARD} px-5 py-5 ${tall ? "h-full flex flex-col" : ""}`}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
          Plans {planStats.length > 0 && <span className="font-normal normal-case">({planStats.length})</span>}
        </p>
        <button type="button" onClick={() => { haptic("light"); onNavigate(1); }}
          className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
          Open <IconArrowRight size={11} strokeWidth={2.5} />
        </button>
      </div>
      {planStats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-center gap-3 flex-1">
          <IconClipboardData size={28} strokeWidth={1.3} className="text-neutral-200 dark:text-neutral-700" />
          <div>
            <p className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">No plans yet</p>
            <p className="text-[11.5px] text-neutral-400 dark:text-neutral-500 mt-0.5">Create a plan to start tracking</p>
          </div>
          <button type="button" onClick={() => { haptic("light"); onNavigate(1); }}
            className="rounded-xl bg-neutral-900 px-4 py-1.5 text-[12px] font-semibold text-white dark:bg-white dark:text-neutral-900">
            + New Plan
          </button>
        </div>
      ) : (
        <div className={`space-y-3 ${tall ? "flex-1 overflow-y-auto" : ""}`}>
          {planStats.map(({ plan, consistency, status, taskCount }) => {
            const accent = accentStyles(plan.color ?? "cyan");
            const cfg = STATUS_CFG[status];
            return (
              <motion.button key={plan.id} type="button" onClick={() => { haptic("light"); onNavigate(1); }} whileTap={{ scale: 0.987 }}
                className={`w-full rounded-xl border-l-[3px] ${accent.leftBorder} bg-neutral-50 px-3.5 py-3 text-left dark:bg-white/[0.03]`}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[14px] leading-none shrink-0">{plan.emoji}</span>
                    <p className="truncate text-[13px] font-bold text-neutral-900 dark:text-white">{plan.title}</p>
                  </div>
                  <div className={`flex shrink-0 items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.05em] ${cfg.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot} ${cfg.pulse ? "animate-pulse" : ""}`} />
                    {cfg.label}
                  </div>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/[0.08]">
                  <motion.div className={`h-full rounded-full ${accent.dot}`}
                    initial={{ width: 0 }} animate={{ width: `${consistency}%` }}
                    transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }} />
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                    <IconClipboardList size={10} strokeWidth={2.2} />
                    {taskCount} task{taskCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">{consistency}%</span>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BottomCard({
  trackerData, nudges, onNavigate,
}: {
  trackerData: { tracker: ProgressTracker; latest: Schedule["metricEntries"][0] | undefined; sparkValues: number[]; plan: Plan | undefined }[];
  nudges: { icon: React.ElementType; title: string; desc: string; tab: number }[];
  onNavigate: (tab: number) => void;
}) {
  const hasTrackers = trackerData.length > 0;
  const hasNudges = nudges.length > 0;
  return (
    <div className={`${CARD} px-5 py-5`}>
      {hasTrackers && (
        <div className={hasNudges ? "mb-5" : ""}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Tracker Pulse</p>
            <button type="button" onClick={() => { haptic("light"); onNavigate(1); }}
              className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors">
              View all <IconArrowRight size={11} strokeWidth={2.5} />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            {trackerData.map(({ tracker, latest, sparkValues, plan }) => {
              const accent = accentStyles(plan?.color ?? "cyan");
              return (
                <button key={tracker.id} type="button" onClick={() => { haptic("light"); onNavigate(1); }}
                  className="flex w-[148px] shrink-0 flex-col rounded-xl border border-neutral-100 bg-neutral-50 px-3.5 py-3 text-left active:scale-[0.98] transition-transform dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
                    <p className="truncate text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{tracker.title}</p>
                  </div>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-[22px] font-extrabold leading-none tabular-nums text-neutral-900 dark:text-white">{latest ? latest.value : "—"}</span>
                    {tracker.unit && <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{tracker.unit}</span>}
                  </div>
                  {sparkValues.length >= 2 ? <Sparkline values={sparkValues} color={plan?.color ?? "cyan"} /> : <p className="text-[10px] text-neutral-300 dark:text-neutral-600 mt-1">Not enough data</p>}
                  <p className="mt-1 truncate text-[10px] text-neutral-400 dark:text-neutral-500">{plan?.emoji} {plan?.title}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {hasNudges && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500 mb-3">
            {hasTrackers ? "What's Possible" : "Get Started"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {nudges.map((nudge) => {
              const NudgeIcon = nudge.icon;
              return (
                <motion.button key={nudge.title} type="button" onClick={() => { haptic("light"); onNavigate(nudge.tab); }} whileTap={{ scale: 0.987 }}
                  className="flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3 text-left dark:border-white/[0.05] dark:bg-white/[0.03]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-200/60 dark:bg-white/[0.07]">
                    <NudgeIcon size={15} strokeWidth={1.8} className="text-neutral-600 dark:text-neutral-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold text-neutral-900 dark:text-white">{nudge.title}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">{nudge.desc}</p>
                  </div>
                  <IconArrowRight size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-neutral-300 dark:text-neutral-600" />
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
      {!hasTrackers && !hasNudges && (
        <div className="flex items-center gap-3 py-2">
          <span className="text-[24px]">🎉</span>
          <div>
            <p className="text-[14px] font-bold text-neutral-900 dark:text-white">You're all set</p>
            <p className="text-[12px] text-neutral-400 dark:text-neutral-500">Using every feature PlanR has to offer.</p>
          </div>
        </div>
      )}
    </div>
  );
}
