"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { m, AnimatePresence, useMotionValue, useTransform, animate as motionAnimate, type MotionValue } from "framer-motion";
import {
  IconArrowUpRight,
  IconBolt,
  IconListCheck,
  IconCalendarEvent,
  IconCheck,
  IconX,
  IconChevronRight,
  IconChecklist,
  IconClipboardList,
  IconFlame,
  IconPlus,
  IconRepeat,
  IconTarget,
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconActivity,
  IconSparkles,
  IconChartLine,
  IconArrowRight,
} from "@tabler/icons-react";
import type { Schedule, DayKey, Task, Plan, ProgressTracker } from "@/lib/useScheduleDB";
import { isTaskCompleted, isTaskResolved } from "@/lib/taskCompletion";
import { getPlanCardStats } from "@/lib/planInsights";
import { accentStyles } from "@/lib/colorSystem";
import ExecutionTrendCard from "@/components/ExecutionTrendCard";
import { getTrendDirection, getTrendState, type TrendDirection, type TrendState } from "@/lib/trendUtils";
import { localISODate, addDaysToISO } from "@/lib/dateUtils";
import { parseTimeToMinutes, toScheduleDayMinutes } from "@/lib/timeUtils";
import { calculateExecutionStreak } from "@/lib/consistency/calculateExecutionStreak";
import { isTaskScheduledOn } from "@/lib/taskOccurrence";
import ExecutionStreakBanner from "@/components/ExecutionStreakBanner";
import { haptic } from "@/lib/haptics";

// ── Props ─────────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHM(t: string): [number, number] | null {
  // Use the canonical parser so 12-hour display times ("8:00 PM") keep their
  // AM/PM — a bare `HH:MM` regex would drop the suffix and render PM as AM.
  const mins = parseTimeToMinutes(t);
  if (mins === null) return null;
  return [Math.floor(mins / 60), mins % 60];
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


// ── Trend arrow ───────────────────────────────────────────────────────────────
// Direction = which way the metric moved; state = good/bad relative to the goal.

function TrendArrow({ direction, state }: { direction: TrendDirection; state: TrendState }) {
  const Icon = direction === "up" ? IconTrendingUp : direction === "down" ? IconTrendingDown : IconMinus;
  const color =
    state === "positive" ? "text-emerald-500" :
    state === "negative" ? "text-rose-500" :
    "text-neutral-400 dark:text-neutral-500";
  return <Icon size={17} strokeWidth={2.5} className={`shrink-0 ${color}`} />;
}

// ── Swipeable card stack ──────────────────────────────────────────────────────
// One shared motion value (`y`) drives the front card AND the cards behind it,
// so the whole stack recalculates depth in realtime as you drag — the back
// cards rise and scale forward to "anticipate" becoming the active card.

type StackTask = { id: string; title: string; planId?: string; startTime?: string; endTime?: string; subtasks?: { id: string }[]; completedSubtaskIds?: string[] };

// Full-precision time — "07:00 AM" — matching the reference card.
function formatTimeFull(t?: string): string {
  if (!t) return "";
  const hm = parseHM(t);
  if (!hm) return t;
  const [h, m] = hm;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Duration spelled out — "2 hr 30 m".
function formatDur(start?: string, end?: string): string {
  if (!start || !end) return "";
  const shm = parseHM(start);
  const ehm = parseHM(end);
  if (!shm || !ehm) return "";
  const mins = (ehm[0] * 60 + ehm[1]) - (shm[0] * 60 + shm[1]);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} m`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} m`;
}

// Resting geometry for the cards behind the front one (depth 0 = next, 1 = after).
// restY magnitude is matched to the container's paddingTop so the deepest card
// sits flush at the top and the stack reads as a single tight pile.
const PEEK = [
  { restY: -16, restScale: 0.955, activeY: -6, activeScale: 0.985, opacity: [0.85, 1] as const },
  { restY: -32, restScale: 0.912, activeY: -20, activeScale: 0.95, opacity: [0.6, 0.9] as const },
];
const PAD_TOP = [0, 0, 16, 32]; // by clamped task count (1, 2, 3+)

function BackgroundCard({ progress, depth, top }: { progress: MotionValue<number>; depth: 0 | 1; top: number }) {
  const cfg = PEEK[depth];
  const y = useTransform(progress, [0, 1], [cfg.restY, cfg.activeY]);
  const scale = useTransform(progress, [0, 1], [cfg.restScale, cfg.activeScale]);
  const opacity = useTransform(progress, [0, 1], [cfg.opacity[0], cfg.opacity[1]]);
  // Anchored to the FRONT card's box (top: padTop) — not the padded container —
  // so the visible peek equals exactly |restY| with no extra height bleed.
  return (
    <m.div
      aria-hidden
      className="absolute left-0 right-0 bottom-0 rounded-3xl border border-emerald-200/50 bg-neutral-50 dark:border-emerald-500/[0.12] dark:bg-neutral-900"
      style={{ top, y, scale, opacity, transformOrigin: "top center", zIndex: depth === 0 ? 2 : 1, willChange: "transform" }}
    />
  );
}

function SwipeableCardStack({
  tasks,
  plans,
  onMarkDone,
  onSkip,
  onOpenSubtasks,
}: {
  tasks: StackTask[];
  plans: Plan[];
  onMarkDone: (task: StackTask) => void;
  onSkip: (task: StackTask) => void;      // defer — send to back of the queue
  onOpenSubtasks?: (taskId: string) => void;
}) {
  const y = useMotionValue(0);
  const [busy, setBusy] = useState(false);
  // Synchronous lock — `busy` state updates async, so rapid taps in the same
  // tick all see busy=false and fire multiple times (toggling a task back to
  // incomplete). A ref flips immediately and gates every entry.
  const lockRef = useRef(false);
  // The card we've already committed to dismissing this gesture, so a stray
  // re-fire can't act on whatever task slid into the front slot.
  const committedIdRef = useRef<string | null>(null);

  // Drag commitment: 0 at rest → 1 once dragged a full card-height up.
  const progress = useTransform(y, [-120, 0], [1, 0]);
  // Front card physics — tilts and fades as it lifts off the stack.
  const rotate = useTransform(y, [-220, -60, 0, 20], [9, 4, 0, -2]);
  const frontOpacity = useTransform(y, [-200, -70, 0], [0, 0.65, 1]);

  const front = tasks[0];
  const count = tasks.length;
  const duration = formatDur(front.startTime, front.endTime);
  const chip = plans.find((p) => p.id === front.planId)?.title;
  const padTop = PAD_TOP[Math.min(count, 3)];
  const subTotal = front.subtasks?.length ?? 0;
  const subDone = subTotal > 0
    ? (front.completedSubtaskIds ?? []).filter((id) => front.subtasks!.some((s) => s.id === id)).length
    : 0;

  async function dismiss(type: "skip" | "done") {
    if (lockRef.current) return;
    lockRef.current = true;
    const target = front;
    committedIdRef.current = target.id;
    setBusy(true);
    haptic(type === "done" ? "medium" : "light");
    await motionAnimate(y, -460, { duration: 0.32, ease: [0.36, 0, 0.66, -0.1] });
    if (type === "done") onMarkDone(target);
    else onSkip(target);
    // Skipping the only card re-queues it to itself — glide it back down rather
    // than snapping, so the rotation reads as "it came back around".
    if (type === "skip" && count === 1) {
      await motionAnimate(y, 0, { type: "spring", stiffness: 320, damping: 32 });
    } else {
      y.set(0);
    }
    committedIdRef.current = null;
    lockRef.current = false;
    setBusy(false);
  }

  return (
    <div className="relative pt-3">
  

      {/* Front card — draggable */}
      <m.div
        className="relative z-10 cursor-grab touch-pan-x rounded-3xl border border-emerald-200/70 bg-white px-5 py-5 dark:border-emerald-500/[0.18] dark:bg-neutral-900 active:cursor-grabbing"
        style={{ y, rotate, opacity: frontOpacity, willChange: "transform" }}
        drag={busy ? false : "y"}
        dragConstraints={{ top: -460, bottom: 18 }}
        dragElastic={{ top: 0.55, bottom: 0.08 }}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.y < -55 || info.velocity.y < -420) {
            void dismiss("skip");
          } else {
            void motionAnimate(y, 0, { type: "spring", stiffness: 440, damping: 34 });
          }
        }}
      >
        {/* Content keyed per task so the next card fades/scales forward on swap */}
        <AnimatePresence mode="popLayout" initial={false}>
          <m.div
            key={front.id}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.26, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <IconBolt size={16} strokeWidth={2} className="text-emerald-600 dark:text-emerald-400" />
                <span className="text-[14px] font-bold text-emerald-600 dark:text-emerald-400">Current Task</span>
              </div>
              {subTotal > 0 && onOpenSubtasks && (
                <button
                  type="button"
                  onPointerDownCapture={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); haptic("light"); onOpenSubtasks(front.id); }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-white/70 px-2.5 py-1 text-[12px] font-bold tabular-nums text-emerald-700 dark:border-emerald-500/30 dark:bg-white/[0.06] dark:text-emerald-300"
                >
                  <IconListCheck size={16} strokeWidth={2} />
                  {subDone}/{subTotal}
                  <IconArrowUpRight size={16} strokeWidth={2} />
                </button>
              )}
            </div>

            {/* Task title */}
            <p className="text-[22px] font-extrabold leading-tight text-neutral-950 dark:text-white">
              {front.title}
            </p>

            {/* Plan kicker */}
            {chip && (
              <p className="mt-1 text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">
                {chip}
              </p>
            )}

            {/* Time · duration */}
            <div className="mt-1.5 mb-5 flex items-center gap-3">
              {front.startTime && (
                <span className="text-[14px] font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatTimeFull(front.startTime)}
                  {front.endTime ? ` - ${formatTimeFull(front.endTime)}` : ""}
                </span>
              )}
              {duration && (
                <span className="text-[14px] font-medium text-neutral-400 dark:text-neutral-500">
                  {duration}
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2.5">
              <m.button
                type="button"
                whileTap={{ scale: 0.96 }}
                disabled={busy}
                onClick={() => void dismiss("done")}
                className="flex min-h-[44px] items-center gap-1 rounded-full bg-[#00A63E] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#008236] disabled:opacity-70 dark:bg-[#2FD46E] dark:text-neutral-950"
              >
                <IconCheck size={16} strokeWidth={1.5} />
                Mark Done
              </m.button>
              {/* <m.button
                type="button"
                whileTap={{ scale: 0.96 }}
                disabled={busy}
                onClick={() => void dismiss("skip")}
                className="flex items-center gap-2 rounded-full border-2 border-rose-500 px-6 py-3 text-[15px] font-bold text-rose-500 disabled:opacity-70 dark:border-rose-500/80 dark:text-rose-400"
              >
                <IconX size={18} strokeWidth={3} />
                Missed it
              </m.button> */}
            </div>
          </m.div>
        </AnimatePresence>
      </m.div>
    </div>
  );
}

// ── Shared card shell ─────────────────────────────────────────────────────────

const CARD = "rounded-2xl border border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900";

// ── Main component ────────────────────────────────────────────────────────────

export default function OverviewDashboard({
  schedule, todayKey, onNavigate,
  onMarkTaskDone, onMissedTask, onOpenSubtasks, onLogTracker,
}: OverviewDashboardProps) {
  // Rotation order for the Next-up stack. "Missed it"/swipe sends a task to the
  // back of the queue instead of removing it, so cards keep cycling until they're
  // marked done. Resets when the day changes.
  const [rotation, setRotation] = useState<string[]>([]);
  useEffect(() => { setRotation([]); }, [todayKey]);
  // Inline task list toggle
  const [showAllTasks, setShowAllTasks] = useState(false);
  const todayISO = localISODate(new Date());

  // ── Shared computed data ──────────────────────────────────────────────────

  const { tasksDone, tasksTotal, missedCount } = useMemo(() => {
    const todayDateISO = localISODate(new Date());
    const today = (schedule.activities[todayKey] ?? []).filter((t) => isTaskScheduledOn(t, todayDateISO, true));
    const done = today.filter((t) => isTaskCompleted(t, t.subtasks?.length ?? 0)).length;
    const missed = today.filter((t) => !isTaskCompleted(t, t.subtasks?.length ?? 0) && !!t.missed).length;
    return { tasksDone: done, tasksTotal: today.length, missedCount: missed };
  }, [schedule, todayKey]);

  // Chronological order (matching the timeline's 4 AM schedule-day model) so the
  // full list reads top-to-bottom by time and the "what's next" card surfaces the
  // earliest unresolved task. Raw storage order is insertion order, not by time.
  const todayTasks = useMemo(() => {
    const todayDateISO = localISODate(new Date());
    const startKey = (t: { startTime?: string }) => {
      const mins = parseTimeToMinutes(t.startTime ?? "");
      return mins === null ? Infinity : toScheduleDayMinutes(mins);
    };
    return [...(schedule.activities[todayKey] ?? [])]
      .filter((t) => isTaskScheduledOn(t, todayDateISO, true))
      .sort((a, b) => startKey(a) - startKey(b));
  }, [schedule, todayKey]);

  // Incomplete tasks for the swipeable stack, ordered by the rotation queue so
  // missed/swiped cards come back around after the others.
  const incompleteTasks = useMemo(() => {
    const incomplete = todayTasks.filter((t) => !isTaskResolved(t, t.subtasks?.length ?? 0));
    const byId = new Map(incomplete.map((t) => [t.id, t] as const));
    const ordered: typeof incomplete = [];
    const seen = new Set<string>();
    // Rotated tasks keep their queued position…
    for (const id of rotation) {
      const t = byId.get(id);
      if (t && !seen.has(id)) { ordered.push(t); seen.add(id); }
    }
    // …new/untouched tasks follow in their natural order.
    for (const t of incomplete) {
      if (!seen.has(t.id)) { ordered.push(t); seen.add(t.id); }
    }
    return ordered;
  }, [todayTasks, rotation]);

  const trackerData = useMemo(() =>
    (schedule.progressTrackers ?? []).map((tracker) => {
      const entries = (schedule.metricEntries ?? [])
        .filter((e) => e.trackerId === tracker.id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const latest = entries[0];
      const previous = entries[1];
      // Trend vs the prior entry; state colored against the tracker's goal.
      const trend: { direction: TrendDirection; state: TrendState } | null =
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
        sparkValues: entries.slice(0, 7).reverse().map((e) => e.value),
        plan: schedule.plans.find((p) => p.id === tracker.planId),
      };
    }),
    [schedule]
  );

  // ── Mobile — Whole-week activity across every plan ─────────────────────────

  const weeklyActivity = useMemo(() => {
    const DAYS_ORDER: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    // Monday of the current week → real dates for each weekday.
    const todayIdx = new Date(todayISO + "T00:00:00").getDay(); // 0=Sun..6=Sat
    const monday = addDaysToISO(todayISO, -((todayIdx + 6) % 7));

    // Tasks per day come from the dated completion history (not the live
    // template flag, which only reflects today after the daily reset). Today
    // also counts the live flag so checking a task updates the bar instantly.
    const days = DAYS_ORDER.map((dk, i) => {
      const tasks = schedule.activities[dk] ?? [];
      const total = tasks.length;
      const date = addDaysToISO(monday, i);
      const isToday = date === todayISO;
      const done = tasks.filter((t) =>
        isToday
          ? isTaskCompleted(t, t.subtasks?.length ?? 0)
          : (t.completionHistory ?? []).some(
              (e) => e.completionType === "task" && localISODate(new Date(e.completedAt)) === date
            )
      ).length;
      return { label: DAY_LABELS[i], total, done, isToday, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
    });
    const totalTasks = days.reduce((s, d) => s + d.total, 0);
    const totalDone = days.reduce((s, d) => s + d.done, 0);
    const tasksPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

    // Habits: completion is per-date, so count scheduled vs done up to today.
    const doneSet = new Set((schedule.ritualCompletions ?? []).map((c) => `${c.ritualId}|${c.date}`));
    let habitTotal = 0, habitDone = 0;
    DAYS_ORDER.forEach((dk, i) => {
      const date = addDaysToISO(monday, i);
      if (date > todayISO) return; // future days aren't actionable yet
      const scheduled = (schedule.rituals ?? []).filter(
        (r) => !r.repeatDays || r.repeatDays.length === 0 || r.repeatDays.includes(dk)
      );
      habitTotal += scheduled.length;
      habitDone += scheduled.filter((r) => doneSet.has(`${r.id}|${date}`)).length;
    });
    const habitsPct = habitTotal > 0 ? Math.round((habitDone / habitTotal) * 100) : 0;

    if (totalTasks === 0 && habitTotal === 0) return null;
    return { days, tasksPct, habitsPct };
  }, [schedule, todayISO]);

  // Any tasks scheduled across the week (not just today) — gates execution analytics.
  const hasScheduledTasks = useMemo(
    () => Object.values(schedule.activities).some((a) => (a?.length ?? 0) > 0),
    [schedule.activities]
  );

  // Brand-new account: nothing to summarize yet. Show a guided getting-started
  // checklist instead of a grid of empty cards.
  const isFreshStart =
    schedule.plans.length === 0 &&
    !hasScheduledTasks &&
    (schedule.progressTrackers?.length ?? 0) === 0 &&
    (schedule.rituals?.length ?? 0) === 0;

  // ── Routine Consistency — today's rituals with streak + 7-day dot history ──
  const ritualConsistency = useMemo(() => {
    const completions = schedule.ritualCompletions ?? [];
    const doneSet = new Set(completions.map((c) => `${c.ritualId}|${c.date}`));
    const last7 = Array.from({ length: 7 }, (_, i) => addDaysToISO(todayISO, -(6 - i)));
    const todayIdx = new Date(todayISO + "T00:00:00").getDay();
    const da = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][todayIdx] as DayKey;
    return (schedule.rituals ?? [])
      .filter((r) => !r.repeatDays || r.repeatDays.length === 0 || r.repeatDays.includes(da))
      .map((r) => {
        // Streak: consecutive scheduled days (ending yesterday→back) the ritual was done.
        let streak = 0;
        let cursor = addDaysToISO(todayISO, -1);
        for (let i = 0; i < 90; i++) {
          const dow = new Date(cursor + "T00:00:00").getDay();
          const scheduled = !r.repeatDays || r.repeatDays.length === 0 ||
            r.repeatDays.includes(["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][dow] as DayKey);
          if (scheduled) { if (doneSet.has(`${r.id}|${cursor}`)) streak++; else break; }
          cursor = addDaysToISO(cursor, -1);
        }
        const dots = last7.map((d) => doneSet.has(`${r.id}|${d}`));
        return { ritual: r, streak, dots };
      });
  }, [schedule.rituals, schedule.ritualCompletions, todayISO]);

  // ── Plan Consistency — score + milestone progress per plan ──────────────────
  const planConsistency = useMemo(() =>
    schedule.plans.map((plan) => {
      const { consistency } = getPlanCardStats(plan, schedule.activities, todayKey);
      const ms = (schedule.milestones ?? []).filter((m) => m.planId === plan.id);
      const msDone = ms.filter((m) => m.status === "completed").length;
      return { plan, consistency, milestonesTotal: ms.length, milestonesDone: msDone };
    }),
    [schedule.plans, schedule.activities, schedule.milestones, todayKey]
  );

  // Unified execution streak (tasks + rituals) — the single momentum signal.
  const executionStreak = useMemo(
    () => calculateExecutionStreak(schedule, localISODate(new Date())),
    [schedule]
  );

  // ── Render — one responsive layout for mobile + desktop ───────────────────

  return (
    <div className="pb-24 lg:pb-8">
      <div className="mx-auto w-full max-w-[1120px] px-4 pt-5 lg:px-6 lg:pt-3">

        {/* Desktop header */}
        <div className="mb-4 hidden lg:block">
          <p className="text-[13px] font-semibold text-neutral-400 dark:text-neutral-500">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight text-neutral-950 dark:text-white">Overview</h1>
        </div>

        {isFreshStart ? (
          <GettingStarted onNavigate={onNavigate} />
        ) : (
        <>

        {/* ── Execution streak — the one momentum signal, both surfaces ────── */}
        <ExecutionStreakBanner data={executionStreak} />

        {/* ── Task count row (mobile only — desktop shows it in the card) ──── */}
        <div className="mb-3 lg:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[14px] text-neutral-400 dark:text-neutral-500">
              <IconChecklist size={16} strokeWidth={2} className="shrink-0" />
              <span className="font-bold text-neutral-900 dark:text-white">{tasksDone}/{tasksTotal}</span>
              <span className="font-medium">Tasks Done</span>
            </div>
            <button
              type="button"
              onClick={() => { haptic("light"); setShowAllTasks((v) => !v); }}
              className="flex items-center gap-0.5 text-[14px] font-bold text-neutral-900 dark:text-white"
            >
              {showAllTasks ? "Hide" : "View All"}
              <IconChevronRight
                size={16}
                strokeWidth={2.5}
                className={`shrink-0 transition-transform duration-200 ${showAllTasks ? "-rotate-90" : "rotate-0"}`}
              />
            </button>
          </div>
        </div>

        {/* ── 3-column dashboard grid ──────────────────────────────────────── */}
        <div className="space-y-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0 lg:items-start">

          {/* Column 1 — Today's Task · Routine Consistency */}
          <div className="space-y-4 lg:min-w-0">

          {/* ── Desktop: plain Today's Task list card (reference design) ── */}
          <div className="hidden lg:block">
            <TodayTaskListCard
              tasks={todayTasks}
              done={tasksDone}
              total={tasksTotal}
              plans={schedule.plans}
              onMarkDone={onMarkTaskDone}
              onOpenSubtasks={onOpenSubtasks}
            />
          </div>

          {/* ── Mobile: swipeable Next-up card + View All list ── */}
          <div className="lg:hidden">

          {/* ── Swipeable card stack — hidden while the full list is shown ── */}
          {!showAllTasks && (
            <AnimatePresence mode="popLayout" initial={false}>
              {incompleteTasks.length > 0 ? (
                <m.div key="stack" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <SwipeableCardStack
                    tasks={incompleteTasks}
                    plans={schedule.plans}
                    onMarkDone={(t) => onMarkTaskDone(t.id, t.subtasks?.map((s) => s.id) ?? [])}
                    onSkip={(t) =>
                      // "Missed it" / swipe — record the task (and its subtasks) as
                      // missed for today; it then leaves the Next-up stack.
                      onMissedTask(t.id, t.subtasks?.map((s) => s.id) ?? [])
                    }
                    onOpenSubtasks={onOpenSubtasks}
                  />
                </m.div>
              ) : (
                <m.div key="all-done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="rounded-2xl border border-neutral-200/70 bg-white px-5 py-5 dark:border-white/[0.07] dark:bg-neutral-900">
                  <p className="text-[15px] font-bold text-neutral-900 dark:text-white">
                    {tasksTotal === 0 ? "No tasks today" : missedCount > 0 ? "All tasks handled" : "You're all caught up! ✓"}
                  </p>
                  <p className="mt-0.5 text-[13px] text-neutral-400 dark:text-neutral-500">
                    {tasksTotal === 0
                      ? "Head to Today to add tasks."
                      : missedCount > 0
                      ? `${tasksDone} done · ${missedCount} missed`
                      : "Great work — all tasks done."}
                  </p>
                </m.div>
              )}
            </AnimatePresence>
          )}

          {/* ── Inline task list (View All) — clean list, no swipe ── */}
          <AnimatePresence>
            {showAllTasks && todayTasks.length > 0 && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className={`${CARD} divide-y divide-neutral-100 dark:divide-white/[0.05]`}>
                  {todayTasks.map((task) => {
                    const subTotal = task.subtasks?.length ?? 0;
                    const subDone = subTotal > 0
                      ? (task.completedSubtaskIds ?? []).filter((id) => task.subtasks!.some((s) => s.id === id)).length
                      : 0;
                    const done = isTaskCompleted(task, subTotal);
                    const isMissed = !done && !!task.missed;
                    const plan = schedule.plans.find((p) => p.id === task.planId);
                    return (
                      <div key={task.id} className="flex items-center gap-3 px-4 py-3.5">
                        {/* Checkbox — toggles completion */}
                        <button
                          type="button"
                          aria-label={done ? "Mark not done" : "Mark done"}
                          aria-pressed={done}
                          onClick={() => { haptic("light"); onMarkTaskDone(task.id, task.subtasks?.map((s) => s.id) ?? []); }}
                          className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
                            done ? "border-emerald-500 bg-emerald-500"
                            : isMissed ? "border-rose-500 bg-rose-500"
                            : "border-emerald-500/60 hover:border-emerald-500 dark:border-emerald-500/50"
                          }`}
                        >
                          {done && <IconCheck size={15} strokeWidth={3} className="text-white" />}
                          {isMissed && <IconX size={15} strokeWidth={3} className="text-white" />}
                        </button>

                        {/* Title + meta */}
                        <div className="min-w-0 flex-1">
                          <p className={`text-[15px] font-bold leading-snug ${
                            done ? "text-neutral-400 line-through dark:text-neutral-600"
                            : isMissed ? "text-neutral-400 line-through decoration-rose-400 dark:text-neutral-600"
                            : "text-neutral-900 dark:text-white"
                          }`}>
                            {task.title}
                          </p>
                          {(task.startTime || plan) && (
                            <p className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500">
                              {task.startTime && formatTime(task.startTime)}
                              {task.startTime && plan && " · "}
                              {plan && plan.title}
                            </p>
                          )}
                        </div>

                        {/* Subtask pill — only when the task has subtasks */}
                        {subTotal > 0 && (
                          <button
                            type="button"
                            onClick={() => { haptic("light"); onOpenSubtasks?.(task.id); }}
                            aria-label={`Open subtasks (${subDone} of ${subTotal} done)`}
                            className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1.5 text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.1] dark:text-neutral-400 dark:hover:bg-white/[0.04]"
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
              </m.div>
            )}
          </AnimatePresence>
          </div>

            {/* ── Routine Consistency ── */}
            <RoutineConsistencyCard rows={ritualConsistency} />
          </div>

          {/* Column 2 — This Week · Weekly Progress · Active Tracking */}
          <div className="mt-4 space-y-4 lg:mt-0 lg:min-w-0">

            {/* ── This Week ── */}
            {weeklyActivity && (
            <div className={`${CARD} px-5 py-4`}>
              {/* Header */}
              <div className="flex items-center gap-2 mb-4">
                <IconCalendarEvent size={14} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500 shrink-0" />
                <p className="text-[13px] font-bold text-neutral-800 dark:text-neutral-200 truncate">
                  This Week
                </p>
              </div>

              {/* 7-day bars */}
              <div className="flex items-end justify-between gap-1 mb-3">
                {weeklyActivity.days.map(({ label, total, done, pct, isToday }) => {
                  const barColor =
                    total === 0 ? "bg-neutral-200 dark:bg-white/[0.08]" :
                    pct >= 70 ? "bg-emerald-500" :
                    pct >= 40 ? "bg-amber-400" : "bg-rose-400";
                  return (
                    <div key={label} className="flex flex-1 flex-col items-center gap-1">
                      <span className={`text-[10px] ${isToday ? "font-bold text-emerald-600 dark:text-emerald-400" : "font-medium text-neutral-400 dark:text-neutral-500"}`}>{label}</span>
                      {/* Bar track */}
                      <div className={`w-full rounded-full ${isToday ? "ring-1 ring-emerald-400/40" : ""} bg-neutral-100 dark:bg-white/[0.07]`} style={{ height: 4 }}>
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
            )}

            {/* ── Execution trend (8-week analytics) ── */}
            {hasScheduledTasks && <ExecutionTrendCard schedule={schedule} />}

            {/* ── Active Tracking ── */}
            <div className={`${CARD} px-5 py-4`}>
            <div className="flex items-center gap-2 mb-3">
              <IconTarget size={14} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500 shrink-0" />
              <p className="text-[13px] font-bold text-neutral-700 dark:text-neutral-300">Active Tracking</p>
            </div>

            {trackerData.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-2 py-4 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400">
                  <IconChartLine size={22} strokeWidth={2} />
                </span>
                <div className="space-y-0.5">
                  <p className="text-[14px] font-bold text-neutral-900 dark:text-white">No trackers yet</p>
                  <p className="mx-auto max-w-[230px] text-[12.5px] leading-snug text-neutral-400 dark:text-neutral-500">
                    Track metrics like weight, pages read, or revenue to watch your trends here.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { haptic("light"); onNavigate(1); }}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white"
                >
                  Set up tracking
                  <IconArrowRight size={14} strokeWidth={2.5} />
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {trackerData.map(({ tracker, latest, trend, plan }) => {
                  const accent = accentStyles(plan?.color ?? "cyan");
                  return (
                    <div
                      key={tracker.id}
                      className="flex items-center gap-3 border-b border-neutral-200/70 px-4 py-3 dark:border-white/[0.07]"
                    >
                      <span className={`h-3 w-3 shrink-0 rounded-full ${accent.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-[15px] font-bold text-neutral-900 dark:text-white leading-tight">{tracker.title}</p>
                          {trend && <TrendArrow direction={trend.direction} state={trend.state} />}
                        </div>
                        <p className="text-[13px] font-medium text-neutral-400 dark:text-neutral-500 leading-tight mt-0.5">
                          {latest ? `${latest.value}${tracker.unit ?? ""}` : "No entries yet"}
                        </p>
                      </div>
                      <m.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        aria-label={`Log ${tracker.title}`}
                        onClick={() => { haptic("light"); onLogTracker(tracker); }}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      >
                        <IconPlus size={18} strokeWidth={2.5} />
                      </m.button>
                    </div>
                  );
                })}
              </div>
            )}
            </div>
          </div>

          {/* Column 3 — Plan Consistency */}
          <div className="mt-4 space-y-4 lg:mt-0 lg:min-w-0">

            {/* ── Plan Consistency ── */}
            <PlanConsistencyCard rows={planConsistency} onNavigate={onNavigate} />
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}

// ── Getting started (fresh account — guided checklist instead of empty cards) ─

function GettingStarted({ onNavigate }: { onNavigate: (tab: number) => void }) {
  const steps = [
    {
      n: 1,
      icon: IconClipboardList,
      title: "Create your first plan",
      desc: "Group related tasks, set milestones, and track progress toward a goal.",
      tab: 1,
    },
    {
      n: 2,
      icon: IconCalendarEvent,
      title: "Schedule today's tasks",
      desc: "Add what you'll work on today, then check items off as you go.",
      tab: 0,
    },
    {
      n: 3,
      icon: IconRepeat,
      title: "Build a daily routine",
      desc: "Track small recurring habits and keep your streak alive.",
      tab: 2,
    },
  ];
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-[560px]"
    >
      {/* Hero */}
      <div className="flex flex-col items-center gap-4 pb-7 pt-10 text-center lg:pt-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-emerald-500/10 dark:bg-emerald-500/[0.14]">
          <IconSparkles size={36} strokeWidth={1.4} className="text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-[18px] font-bold text-neutral-900 dark:text-white">Let&apos;s get you set up</p>
          <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-neutral-400 dark:text-neutral-500">
            Three steps to turn your goals into daily follow-through.
          </p>
        </div>
      </div>

      {/* Step cards */}
      <div className="space-y-2.5">
        {steps.map(({ n, icon: Icon, title, desc, tab }) => (
          <button
            key={n}
            type="button"
            onClick={() => { haptic("light"); onNavigate(tab); }}
            className="flex w-full items-center gap-3.5 rounded-2xl border border-neutral-200/70 bg-white px-4 py-3.5 text-left transition-colors hover:border-neutral-300 active:bg-neutral-50 dark:border-white/[0.07] dark:bg-neutral-900 dark:hover:border-white/20 dark:active:bg-white/[0.03]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400">
              <Icon size={21} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[10px] font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {n}
                </span>
                <p className="text-[15px] font-bold text-neutral-900 dark:text-white">{title}</p>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-neutral-400 dark:text-neutral-500">{desc}</p>
            </div>
            <IconChevronRight size={18} strokeWidth={2} className="shrink-0 text-neutral-300 dark:text-neutral-600" />
          </button>
        ))}
      </div>
    </m.div>
  );
}

// ── Routine Consistency card (reference: streak + 7-day dots) ─────────────────

function RoutineConsistencyCard({
  rows,
}: {
  rows: { ritual: { id: string; title: string; time: string }; streak: number; dots: boolean[] }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className={`${CARD} px-5 py-4`}>
      <div className="mb-1 flex items-center gap-2">
        <IconRepeat size={14} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
        <p className="text-[13px] font-bold text-neutral-700 dark:text-neutral-300">Routine Consistency</p>
      </div>
      <div className="divide-y divide-neutral-100 dark:divide-white/[0.05]">
        {rows.map(({ ritual, streak, dots }) => (
          <div key={ritual.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-neutral-900 dark:text-white">
                {ritual.title}
                {ritual.time && <span className="ml-1.5 font-medium text-neutral-400 dark:text-neutral-500">{ritual.time}</span>}
              </p>
              {streak > 0 && (
                <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 dark:text-rose-400">
                  <IconFlame size={12} strokeWidth={2} />
                  {streak}d Streak
                </span>
              )}
            </div>
            <div className="flex shrink-0 gap-1">
              {dots.map((on, i) => (
                <span key={i} className={`h-2.5 w-2.5 rounded-full ${on ? "bg-emerald-500" : "bg-neutral-200 dark:bg-white/[0.1]"}`} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Plan Consistency card (reference: % conic ring per plan) ──────────────────

function ringColor(pct: number): string {
  if (pct >= 70) return "#00a63e";
  if (pct >= 35) return "#fab623";
  return "#fb2c36";
}

function PlanConsistencyCard({
  rows,
  onNavigate,
}: {
  rows: { plan: { id: string; title: string }; consistency: number; milestonesTotal: number; milestonesDone: number }[];
  onNavigate: (tab: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={`${CARD} px-5 py-4`}>
      <div className="mb-1 flex items-center gap-2">
        <IconClipboardList size={14} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
        <p className="text-[13px] font-bold text-neutral-700 dark:text-neutral-300">Plan Consistency</p>
      </div>
      <div className="divide-y divide-neutral-100 dark:divide-white/[0.05]">
        {rows.map(({ plan, consistency, milestonesTotal, milestonesDone }) => {
          const color = ringColor(consistency);
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => { haptic("light"); onNavigate(1); }}
              className="flex w-full items-center justify-between gap-3 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-neutral-900 dark:text-white">{plan.title}</p>
                {milestonesTotal > 0 && (
                  <>
                    <p className="mt-0.5 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                      {milestonesDone}/{milestonesTotal} Milestone
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {Array.from({ length: Math.min(milestonesTotal, 10) }, (_, i) => (
                        <span key={i} className={`h-2 w-2 rounded-full ${i < milestonesDone ? "bg-emerald-500" : "bg-neutral-200 dark:bg-white/[0.1]"}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center gap-1">
                <span
                  className="grid h-[44px] w-[44px] place-items-center rounded-full"
                  style={{ background: `conic-gradient(${color} ${consistency}%, var(--color-neutral-200) 0)` }}
                >
                  <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-white text-[10px] font-extrabold tabular-nums text-neutral-900 dark:bg-neutral-900 dark:text-white">
                    {consistency}%
                  </span>
                </span>
                <span className="text-[9px] font-medium text-neutral-400 dark:text-neutral-500">Consistency</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Today's Task list card (desktop — plain list, no swipe) ───────────────────

function TodayTaskListCard({
  tasks,
  done,
  total,
  plans,
  onMarkDone,
  onOpenSubtasks,
}: {
  tasks: Task[];
  done: number;
  total: number;
  plans: Plan[];
  onMarkDone: (taskId: string, subtaskIds: string[]) => void;
  onOpenSubtasks?: (taskId: string) => void;
}) {
  return (
    <div className={`${CARD} px-5 py-4`}>
      <div className="mb-1 flex items-center gap-2">
        <IconChecklist size={14} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
        <p className="text-[13px] font-bold text-neutral-700 dark:text-neutral-300">{done}/{total} Today&apos;s Task</p>
      </div>
      {tasks.length === 0 ? (
        <p className="py-3 text-[13px] text-neutral-400 dark:text-neutral-500">No tasks scheduled today.</p>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.05]">
          {tasks.map((task) => {
            const subTotal = task.subtasks?.length ?? 0;
            const subDone = subTotal > 0
              ? (task.completedSubtaskIds ?? []).filter((id) => task.subtasks!.some((s) => s.id === id)).length
              : 0;
            const isDone = isTaskCompleted(task, subTotal);
            const isMissed = !isDone && !!task.missed;
            const plan = plans.find((p) => p.id === task.planId);
            return (
              <div key={task.id} className="flex items-center gap-3 py-3">
                <button
                  type="button"
                  aria-label={isDone ? "Mark not done" : "Mark done"}
                  aria-pressed={isDone}
                  onClick={() => { haptic("light"); onMarkDone(task.id, task.subtasks?.map((s) => s.id) ?? []); }}
                  className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    isDone ? "border-emerald-500 bg-emerald-500"
                    : isMissed ? "border-rose-500 bg-rose-500"
                    : "border-emerald-500/60 hover:border-emerald-500 dark:border-emerald-500/50"
                  }`}
                >
                  {isDone && <IconCheck size={14} strokeWidth={3} className="text-white" />}
                  {isMissed && <IconX size={14} strokeWidth={3} className="text-white" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-bold leading-snug ${
                    isDone ? "text-neutral-400 line-through dark:text-neutral-600"
                    : isMissed ? "text-neutral-400 line-through decoration-rose-400 dark:text-neutral-600"
                    : "text-neutral-900 dark:text-white"
                  }`}>
                    {task.title}
                  </p>
                  {(task.startTime || plan) && (
                    <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">
                      {task.startTime && formatTime(task.startTime)}
                      {task.startTime && plan && " · "}
                      {plan && plan.title}
                    </p>
                  )}
                </div>
                {subTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => { haptic("light"); onOpenSubtasks?.(task.id); }}
                    aria-label={`Open subtasks (${subDone} of ${subTotal} done)`}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.1] dark:text-neutral-400 dark:hover:bg-white/[0.04]"
                  >
                    <IconListCheck size={13} strokeWidth={2} className="shrink-0" />
                    <span className="text-[12px] font-bold tabular-nums">{subDone}/{subTotal}</span>
                    <IconArrowUpRight size={12} strokeWidth={2.2} className="shrink-0" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
