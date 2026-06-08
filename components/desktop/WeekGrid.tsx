"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { DayKey, Plan, Schedule, Task } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { sortTasksByTime } from "@/lib/taskMutations";
import { completionForDate, resolveTaskState } from "@/lib/taskCompletion";
import { localISODate, todayISO } from "@/lib/dateUtils";
import { currentMinutes, formatDuration, parseTimeToMinutes } from "@/lib/timeUtils";
import { categoryHex, resolveAccentColor } from "@/lib/colorSystem";
import { haptic } from "@/lib/haptics";
import { TaskBlockCard } from "@/components/TaskBlockCard";
import type { TaskSaveData } from "@/components/task/TaskSheet";

export type CalendarView = "1day" | "3day" | "7day" | "custom3";

const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

const VIEW_LABELS: Record<CalendarView, string> = {
  "1day": "1D", "3day": "3D", "7day": "7D", "custom3": "Custom",
};

const PX_MIN = 2;        // 1 minute = 2px → 30 min = 60px, 1h = 120px
const RAIL_W = 64;

function fmtRail(m: number): string {
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, "0")} ${ap}`;
}

interface BlockLayout {
  task: Task;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}

/** Lay timed tasks out into non-overlapping lanes; return untimed separately. */
function buildDayLayout(tasks: Task[], startMin: number, endMin: number): { timed: BlockLayout[]; untimed: Task[] } {
  const untimed: Task[] = [];
  const parsed: { task: Task; s: number; e: number }[] = [];
  for (const t of tasks) {
    const s = parseTimeToMinutes(t.startTime);
    if (s == null) { untimed.push(t); continue; }
    let e = parseTimeToMinutes(t.endTime);
    if (e == null || e <= s) e = s + 30;
    parsed.push({ task: t, s, e });
  }
  parsed.sort((a, b) => a.s - b.s || a.e - b.e);

  // Greedy lane assignment.
  const laneEnd: number[] = [];
  const withLane = parsed.map((p) => {
    let lane = laneEnd.findIndex((end) => end <= p.s);
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(p.e); } else laneEnd[lane] = p.e;
    return { ...p, lane };
  });

  // Cluster overlapping runs to size column widths.
  const timed: BlockLayout[] = [];
  let i = 0;
  while (i < withLane.length) {
    let clusterEnd = withLane[i].e;
    let j = i + 1;
    while (j < withLane.length && withLane[j].s < clusterEnd) { clusterEnd = Math.max(clusterEnd, withLane[j].e); j++; }
    const cluster = withLane.slice(i, j);
    const lanes = Math.max(...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) {
      const top = (Math.max(c.s, startMin) - startMin) * PX_MIN;
      const bottom = (Math.min(c.e, endMin) - startMin) * PX_MIN;
      timed.push({
        task: c.task,
        top,
        height: Math.max(22, bottom - top),
        widthPct: 100 / lanes,
        leftPct: (100 / lanes) * c.lane,
      });
    }
    i = j;
  }
  return { timed, untimed };
}

interface WeekGridProps {
  schedule: Schedule;
  plansById: Map<string, Plan>;
  plans: Plan[];
  weekDates: Array<{ day: DayKey; date: Date }>;
  todayKey: DayKey;
  weekLabel: string;
  activeDay: DayKey;
  calendarView: CalendarView;
  customDays: DayKey[];
  onDaySelect: (day: DayKey) => void;
  onWeekPrev: () => void;
  onWeekNext: () => void;
  onWeekToday: () => void;
  onCalendarViewChange: (v: CalendarView) => void;
  onCustomDaysChange: (days: DayKey[]) => void;
  onEditTask: (task: Task) => void;
  onToggleTaskComplete: (taskId: string, allSubtaskIds: string[], day: DayKey, dateISO: string) => void;
  onDeleteTask: (taskId: string) => void;
  onInlineAdd: (data: TaskSaveData) => void;
}

export function WeekGrid({
  schedule,
  plansById,
  plans,
  weekDates,
  todayKey,
  weekLabel,
  activeDay,
  calendarView,
  customDays,
  onDaySelect,
  onWeekPrev,
  onWeekNext,
  onWeekToday,
  onCalendarViewChange,
  onCustomDaysChange,
  onEditTask,
  onToggleTaskComplete,
  onDeleteTask,
}: WeekGridProps) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [now, setNow] = useState(() => currentMinutes());
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tick the now-line every minute.
  useEffect(() => {
    const id = setInterval(() => setNow(currentMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  // One-time: scroll so the current time sits near the top third of the grid.
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current || !scrollRef.current) return;
    const showsToday = weekDates.some(({ date }) => localISODate(date) === todayISO());
    if (!showsToday) return;
    const offset = (currentMinutes() - 4 * 60) * PX_MIN - 140;
    scrollRef.current.scrollTo({ top: Math.max(0, offset) });
    didAutoScroll.current = true;
  }, [weekDates]);

  // Close custom picker on outside click
  useEffect(() => {
    if (!showCustomPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowCustomPicker(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showCustomPicker]);

  // Dynamic display label based on visible dates
  const displayLabel = (() => {
    if (calendarView === "7day") return weekLabel;
    if (weekDates.length === 0) return weekLabel;
    if (calendarView === "1day" && weekDates[0]) {
      return weekDates[0].date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
    const first = weekDates[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const last = weekDates[weekDates.length - 1].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${first} – ${last}`;
  })();

  function toggleCustomDay(d: DayKey) {
    const sel = customDays.includes(d);
    if (sel) {
      if (customDays.length > 1) onCustomDaysChange(customDays.filter((x) => x !== d));
    } else {
      onCustomDaysChange([...customDays, d]);
    }
  }

  // ── Resolve per-day tasks (date-aware completion) ─────────────────────────
  const days = weekDates.map(({ day, date }) => {
    const dateISO = localISODate(date);
    const dayIsToday = dateISO === todayISO();
    const raw = sortTasksByTime(schedule.activities[day] ?? []);
    const tasks = dayIsToday ? raw : raw.map((t) => ({ ...t, ...completionForDate(t, dateISO) }));
    return { day, date, dateISO, dayIsToday, tasks };
  });

  // ── Compute the time window from all visible timed tasks ──────────────────
  const allMinutes = days.flatMap((d) =>
    d.tasks.map((t) => {
      const s = parseTimeToMinutes(t.startTime);
      if (s == null) return null;
      let e = parseTimeToMinutes(t.endTime);
      if (e == null || e <= s) e = s + 30;
      return { s, e };
    }).filter((x): x is { s: number; e: number } => x !== null),
  );

  // Day always starts at 4 AM; the end follows the latest task (min 10h window).
  const startMin = 4 * 60;
  let endMin = 24 * 60;
  // if (allMinutes.length > 0) {
  //   endMin = Math.min(24 * 60, Math.ceil(Math.max(...allMinutes.map((x) => x.e)) / 60) * 60);
  // }
  if (endMin - startMin < 10 * 60) endMin = Math.min(24 * 60, startMin + 10 * 60);
  const totalPx = (endMin - startMin) * PX_MIN;

  const railLabels: number[] = [];
  for (let m = startMin; m <= endMin; m += 30) railLabels.push(m);

  const cols = Math.max(1, weekDates.length);
  const gridTemplate = `${RAIL_W}px repeat(${cols}, minmax(0, 1fr))`;
  const hasUntimed = days.some((d) => d.tasks.some((t) => parseTimeToMinutes(t.startTime) == null));

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Nav bar ─────────────────────────────────────────────────────────── */}
      <div className="relative z-10 shrink-0">
        <div className="flex h-[60px] items-center gap-3 border-b border-neutral-100 px-4 dark:border-white/[0.06]">
          <span className="min-w-0 shrink truncate text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
            {displayLabel}
          </span>

          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 dark:border-white/[0.07] dark:bg-white/[0.04]">
            {(["1day", "3day", "7day", "custom3"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  haptic("light");
                  onCalendarViewChange(v);
                  setShowCustomPicker(v === "custom3");
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  calendarView === v
                    ? "bg-white text-neutral-900 dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => { haptic("light"); onWeekToday(); }}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => { haptic("light"); onWeekPrev(); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.07]"
              aria-label="Previous"
            >
              <IconChevronLeft size={18} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={() => { haptic("light"); onWeekNext(); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.07]"
              aria-label="Next"
            >
              <IconChevronRight size={18} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* ── Custom day picker ──────────────────────────────────────────────── */}
        <AnimatePresence>
          {calendarView === "custom3" && showCustomPicker && (
            <motion.div
              ref={pickerRef}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-0 right-0 top-full z-20 border-b border-neutral-200 bg-white px-4 py-3 dark:border-white/[0.08] dark:bg-neutral-900"
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                Pick days · {customDays.length} selected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => {
                  const sel = customDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleCustomDay(d)}
                      className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                        sel
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "border border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20"
                      }`}
                    >
                      {DAY_SHORT[d]}
                    </button>
                  );
                })}
              </div>
              {customDays.length >= 1 && (
                <button
                  type="button"
                  onClick={() => setShowCustomPicker(false)}
                  className="mt-2.5 w-full rounded-xl bg-neutral-900 py-1.5 text-[12px] font-bold text-white dark:bg-white dark:text-neutral-900"
                >
                  Done
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Fixed day-header row ─────────────────────────────────────────────── */}
      <div
        className="grid shrink-0 border-b border-neutral-100 px-3 dark:border-white/[0.06]"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div className="border-r border-neutral-200 dark:border-white/[0.07]" />
        {days.map(({ day, date, dayIsToday }) => {
          const isActive = day === activeDay;
          return (
            <button
              key={day}
              type="button"
              onClick={() => { haptic("light"); onDaySelect(day); }}
              className={`flex flex-col items-center gap-0.5 border-r border-neutral-100 py-2.5 transition-colors last:border-r-0 dark:border-white/[0.06] ${
                isActive ? "bg-neutral-900 dark:bg-white" : "hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
              }`}
            >
              <span className={`text-[11px] font-bold uppercase tracking-wider ${
                isActive ? "text-white dark:text-neutral-900" : dayIsToday ? "text-rose-500" : "text-neutral-400 dark:text-neutral-500"
              }`}>
                {DAY_SHORT[day]}
              </span>
              <span className={`text-[17px] font-extrabold tabular-nums leading-none ${
                isActive ? "text-white dark:text-neutral-900" : dayIsToday ? "text-rose-500" : "text-neutral-800 dark:text-neutral-100"
              }`}>
                {date.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Scrollable grid body ─────────────────────────────────────────────── */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-8">

        {/* All-day / untimed band */}
        {hasUntimed && (
          <div className="grid border-b border-neutral-100 px-3 dark:border-white/[0.06]" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="flex items-start justify-end border-r border-neutral-100 px-2 pt-2 dark:border-white/[0.06]">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-300 dark:text-neutral-600">All day</span>
            </div>
            {days.map(({ day, tasks, dayIsToday, dateISO }) => {
              const untimed = tasks.filter((t) => parseTimeToMinutes(t.startTime) == null);
              return (
                <div key={day} className="flex flex-col gap-1 border-r border-neutral-100 p-1.5 last:border-r-0 dark:border-white/[0.06]">
                  {untimed.map((task) => {
                    const hex = categoryHex(resolveAccentColor(task.color, task.icon));
                    const state = resolveTaskState(task, task.subtasks?.length ?? 0);
                    const done = state === "completed";
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onEditTask(task)}
                        className={`flex items-center gap-1.5 rounded-lg border border-neutral-200/70 bg-white px-2 py-1 text-left dark:border-white/[0.08] dark:bg-neutral-900 ${done ? "opacity-60" : ""}`}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hex }} />
                        <span className={`truncate text-[11px] font-semibold ${done ? "text-neutral-400 line-through dark:text-neutral-600" : "text-neutral-800 dark:text-neutral-200"}`}>
                          {task.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid — flex row so the rail + every column share one height/origin */}
        <div
          className="relative mt-3 flex px-3 [--grid-line:#e5e5e5] dark:[--grid-line:rgba(255,255,255,0.07)]"
          style={{ height: totalPx }}
        >
          {/* Time rail */}
          <div className="relative shrink-0 border-r border-neutral-200 dark:border-white/[0.07]" style={{ width: RAIL_W }}>
            {railLabels.map((m) => {
              const onHour = m % 60 === 0;
              return (
                <span
                  key={m}
                  className={`absolute right-3 -translate-y-1/2 whitespace-nowrap tabular-nums ${
                    onHour
                      ? "text-[11px] font-bold text-neutral-500 dark:text-neutral-300"
                      : "text-[10px] font-semibold text-neutral-300 dark:text-neutral-600"
                  }`}
                  style={{ top: (m - startMin) * PX_MIN }}
                >
                  {fmtRail(m)}
                </span>
              );
            })}
          </div>

          {/* Day columns */}
          {days.map(({ day, dayIsToday, dateISO, tasks }) => {
            const { timed } = buildDayLayout(tasks, startMin, endMin);
            const showNow = dayIsToday && now >= startMin && now <= endMin;
            return (
              <div
                key={day}
                className="relative min-w-0 flex-1 border-r border-neutral-200 last:border-r-0 dark:border-white/[0.06]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, var(--grid-line) 0, var(--grid-line) 1px, transparent 1px, transparent 60px)",
                }}
              >
                {timed.map((layout) => (
                  <TimeBlock
                    key={layout.task.id}
                    layout={layout}
                    plan={plansById.get(layout.task.planId) ?? null}
                    readOnly={!dayIsToday}
                    onEdit={onEditTask}
                    onDelete={() => onDeleteTask(layout.task.id)}
                    onToggle={() =>
                      onToggleTaskComplete(layout.task.id, layout.task.subtasks?.map((s) => s.id) ?? [], day, dateISO)
                    }
                  />
                ))}

                {showNow && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-[4] border-t-[1.5px] border-rose-500"
                    style={{ top: (now - startMin) * PX_MIN }}
                  >
                    <span className="absolute -left-[3px] -top-[4px] h-[7px] w-[7px] rounded-full bg-rose-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Single time-grid task block ───────────────────────────────────────────────

interface TimeBlockProps {
  layout: BlockLayout;
  plan: Plan | null;
  readOnly: boolean;
  onEdit: (task: Task) => void;
  onToggle: () => void;
  onDelete: () => void;
}

function TimeBlock({ layout, plan, readOnly, onEdit, onToggle, onDelete }: TimeBlockProps) {
  const { task, top, height, leftPct, widthPct } = layout;
  const state = resolveTaskState(task, task.subtasks?.length ?? 0);
  const duration = formatDuration(task.startTime, task.endTime);

  // Positioning lives on this wrapper; the card fills it. (TaskBlockCard's own
  // `relative` would otherwise beat a passed `absolute` in Tailwind's CSS order.)
  return (
    <div
      className="absolute"
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 5px)`,
        width: `calc(${widthPct}% - 10px)`,
        minHeight: 24,
      }}
    >
      <TaskBlockCard
        variant="grid"
        task={task}
        plan={plan}
        state={state}
        duration={duration}
        readOnly={readOnly}
        compact={height < 56}
        narrow={widthPct < 60 || height < 88}
        onToggle={onToggle}
        onClick={() => onEdit(task)}
        onDelete={readOnly ? undefined : onDelete}
        className="h-full w-full"
      />
    </div>
  );
}
