"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconChevronLeft, IconChevronRight, IconPlus } from "@tabler/icons-react";
import type { DayKey, Plan, Schedule, Task } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { sortTasksByTime } from "@/lib/taskMutations";
import { CompactTaskCard } from "./CompactTaskCard";
import { haptic } from "@/lib/haptics";
import { accentStyles } from "@/lib/colorSystem";
import { parseTaskLine } from "@/lib/taskParser";
import type { TaskSaveData } from "@/components/task/TaskSheet";

export type CalendarView = "1day" | "3day" | "7day" | "custom3";

const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

const VIEW_LABELS: Record<CalendarView, string> = {
  "1day": "1D", "3day": "3D", "7day": "7D", "custom3": "Custom",
};

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
  onToggleTaskComplete: (taskId: string, allSubtaskIds: string[], day: DayKey) => void;
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
  onInlineAdd,
}: WeekGridProps) {
  const [inlineDay, setInlineDay]         = useState<DayKey | null>(null);
  const [inlineText, setInlineText]       = useState("");
  const [inlinePlanIdx, setInlinePlanIdx] = useState(0);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inlineDay) setTimeout(() => inlineInputRef.current?.focus(), 0);
  }, [inlineDay]);

  // Close custom picker on outside click
  useEffect(() => {
    if (!showCustomPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowCustomPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showCustomPicker]);

  function handleInlineSubmit(day: DayKey) {
    const text = inlineText.trim();
    if (!text) { setInlineDay(null); return; }
    const plan = plans[inlinePlanIdx % Math.max(1, plans.length)] ?? plans[0];
    if (!plan) return;
    const parsed = parseTaskLine(text);
    onInlineAdd({
      taskDraft: {
        title: parsed.title,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        icon: plan.emoji,
        color: plan.color,
        planId: plan.id,
        taskType: "task",
      },
      taskId: undefined,
      repeatDays: [day],
      planItems: null,
    });
    setInlineText("");
    setTimeout(() => inlineInputRef.current?.focus(), 0);
  }

  // Dynamic display label based on visible dates
  const displayLabel = (() => {
    if (calendarView === "7day") return weekLabel;
    if (weekDates.length === 0) return weekLabel;
    if (calendarView === "1day" && weekDates[0]) {
      return weekDates[0].date.toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
      });
    }
    const first = weekDates[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const last  = weekDates[weekDates.length - 1].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── Nav bar ─────────────────────────────────────────────────────────── */}
      <div className="relative z-10 shrink-0">
        <div className="flex h-[60px] items-center gap-3 border-b border-neutral-100 px-4 dark:border-white/[0.06]">
          {/* Date label */}
          <span className="min-w-0 shrink truncate text-[13px] font-semibold text-neutral-700 dark:text-neutral-300">
            {displayLabel}
          </span>

          {/* View toggle */}
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 dark:border-white/[0.07] dark:bg-white/[0.04]">
            {(["1day", "3day", "7day", "custom3"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  haptic("light");
                  onCalendarViewChange(v);
                  if (v === "custom3") setShowCustomPicker(true);
                  else setShowCustomPicker(false);
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

          {/* Nav buttons */}
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
              className="absolute left-0 right-0 top-full border-b border-neutral-200 bg-white px-4 py-3 dark:border-white/[0.08] dark:bg-neutral-900"
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

      {/* ── Day columns ─────────────────────────────────────────────────────── */}
      <div
        className="grid min-h-0 flex-1 divide-x divide-neutral-100 dark:divide-white/[0.06]"
        style={{ gridTemplateColumns: `repeat(${Math.max(1, weekDates.length)}, minmax(0, 1fr))` }}
      >
        {weekDates.map(({ day, date }) => {
          const isToday  = day === todayKey;
          const isActive = day === activeDay;
          const tasks    = sortTasksByTime(schedule.activities[day] ?? []);

          return (
            <div key={day} className="flex flex-col overflow-hidden">
              {/* Column header */}
              <button
                type="button"
                onClick={() => { haptic("light"); onDaySelect(day); }}
                className={`flex shrink-0 flex-col items-center gap-0.5 border-b py-2.5 transition-colors ${
                  isActive
                    ? "border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white"
                    : "border-neutral-100 hover:bg-neutral-50 dark:border-white/[0.06] dark:hover:bg-white/[0.04]"
                }`}
              >
                <span className={`text-[10px] font-bold uppercase tracking-widest ${
                  isActive ? "text-white dark:text-neutral-900" : isToday ? "text-rose-500" : "text-neutral-400 dark:text-neutral-500"
                }`}>
                  {DAY_SHORT[day]}
                </span>
                <span className={`text-[16px] font-bold tabular-nums leading-none ${
                  isActive ? "text-white dark:text-neutral-900" : isToday ? "text-rose-500" : "text-neutral-700 dark:text-neutral-200"
                }`}>
                  {date.getDate()}
                </span>
              </button>

              {/* Scrollable task list */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 pb-0">
                <div className="flex flex-col gap-1.5">
                  {tasks.map((task) => (
                    <CompactTaskCard
                      key={task.id}
                      task={task}
                      plan={plansById.get(task.planId) ?? null}
                      onToggleComplete={(id, subs) => onToggleTaskComplete(id, subs, day)}
                      onEdit={onEditTask}
                    />
                  ))}
                </div>
              </div>

              {/* Fixed Add footer */}
              <div className="shrink-0 p-1.5">
                {inlineDay === day ? (
                  <div className="flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-2 py-1.5 dark:border-white/[0.15] dark:bg-neutral-900">
                    {plans.length > 0 && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setInlinePlanIdx((i) => (i + 1) % plans.length)}
                        className={`h-2 w-2 shrink-0 rounded-full transition-transform hover:scale-125 ${accentStyles(plans[inlinePlanIdx % plans.length]?.color ?? "cyan").dot}`}
                        aria-label="Cycle plan"
                      />
                    )}
                    <input
                      ref={inlineInputRef}
                      value={inlineText}
                      onChange={(e) => setInlineText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { haptic("medium"); handleInlineSubmit(day); }
                        if (e.key === "Escape") { setInlineDay(null); setInlineText(""); }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          if (inlineDay === day) { setInlineDay(null); setInlineText(""); }
                        }, 150);
                      }}
                      placeholder="Task name [9-10]"
                      className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-neutral-800 outline-none placeholder:text-neutral-400 dark:text-neutral-200 dark:placeholder:text-neutral-600"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { haptic("light"); setInlineDay(day); setInlinePlanIdx(0); }}
                    className="flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-neutral-200 py-2 text-[11px] font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-white/[0.08] dark:text-neutral-600 dark:hover:border-white/[0.14] dark:hover:text-neutral-400"
                  >
                    <IconPlus size={11} strokeWidth={2.5} />
                    Add
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
