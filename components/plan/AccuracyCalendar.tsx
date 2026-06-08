"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconChevronLeft, IconChevronRight, IconLayoutGrid, IconPlus } from "@tabler/icons-react";
import type { DayKey, Task } from "@/lib/useScheduleDB";
import { todayISO, localISODate } from "@/lib/dateUtils";
import { completedOnDate } from "@/lib/consistency/calculateDailyStats";

// ── Constants ─────────────────────────────────────────────────────────────────

const JS_DOW_KEY: DayKey[] = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];
const DOW_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── Types ─────────────────────────────────────────────────────────────────────

type DayStatus = "completed" | "missed" | "partial" | "upcoming" | "none";

interface CalDay {
  day: number;
  dateISO: string;
  status: DayStatus;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildCalendarDays(
  year: number,
  month: number,
  planId: string,
  activities: Record<DayKey, Task[]>,
  today: string,
  planStart?: string,
  planEnd?: string,
): CalDay[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: CalDay[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const iso = localISODate(date);
    const dayKey = JS_DOW_KEY[date.getDay()];

    if ((planStart && iso < planStart) || (planEnd && iso > planEnd)) {
      result.push({ day: d, dateISO: iso, status: "none" });
      continue;
    }

    const tasks = (activities[dayKey] ?? []).filter((t) => t.planId === planId);

    if (!tasks.length) {
      result.push({ day: d, dateISO: iso, status: "none" });
      continue;
    }

    if (iso > today) {
      result.push({ day: d, dateISO: iso, status: "upcoming" });
      continue;
    }

    const done = completedOnDate(tasks, iso, iso === today);
    const status: DayStatus =
      done === tasks.length ? "completed" : done > 0 ? "partial" : "missed";
    result.push({ day: d, dateISO: iso, status });
  }

  return result;
}

function cellStyles(status: DayStatus): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/[0.18] dark:text-emerald-300";
    case "missed":
      return "bg-red-100 text-red-700 dark:bg-red-500/[0.18] dark:text-red-300";
    case "partial":
      return "bg-amber-100 text-amber-800 dark:bg-amber-500/[0.18] dark:text-amber-300";
    case "upcoming":
      return "bg-neutral-100 text-neutral-500 dark:bg-white/[0.05] dark:text-neutral-400";
    case "none":
      return "text-neutral-300 dark:text-neutral-700";
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface AccuracyCalendarProps {
  planId: string;
  activities: Record<DayKey, Task[]>;
  planStartDate?: string;
  planEndDate?: string;
  onAddTask: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccuracyCalendar({
  planId,
  activities,
  planStartDate,
  planEndDate,
  onAddTask,
}: AccuracyCalendarProps) {
  const today = useMemo(() => todayISO(), []);
  const now = new Date(today + "T00:00:00");

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const calDays = useMemo(
    () => buildCalendarDays(year, month, planId, activities, today, planStartDate, planEndDate),
    [year, month, planId, activities, today, planStartDate, planEndDate],
  );

  const stats = useMemo(() => {
    let completed = 0, missed = 0, partial = 0, upcoming = 0;
    for (const d of calDays) {
      if (d.status === "completed") completed++;
      else if (d.status === "missed") missed++;
      else if (d.status === "partial") partial++;
      else if (d.status === "upcoming") upcoming++;
    }
    const scheduled = completed + missed + partial;
    const accuracy = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
    return { completed, missed, partial, upcoming, accuracy };
  }, [calDays]);

  const firstDow = new Date(year, month, 1).getDay(); // 0 = Sunday

  const hasTasks = useMemo(
    () => Object.values(activities).some((tasks) => tasks.some((t) => t.planId === planId)),
    [activities, planId],
  );

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (!hasTasks) {
    return (
      <div className="rounded-[24px] border border-neutral-200 bg-white px-6 py-10 text-center dark:border-white/[0.08] dark:bg-neutral-900">
        <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-white/[0.06] flex items-center justify-center mx-auto mb-3">
          <IconLayoutGrid size={24} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
        </div>
        <p className="text-[14px] font-semibold text-neutral-900 dark:text-white mb-1">
          No linked tasks yet
        </p>
        <p className="text-[13px] text-neutral-400 dark:text-neutral-500 max-w-[200px] mx-auto leading-relaxed mb-4">
          Link activities to this plan to start tracking accuracy.
        </p>
        <button
          type="button"
          onClick={onAddTask}
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.04] transition-colors"
        >
          <IconPlus size={16} strokeWidth={1.5} />
          Add Activity
        </button>
      </div>
    );
  }

  // ── Calendar ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Section header — eyebrow + title + month accuracy */}
      <div className="flex items-start justify-between mb-3">
        <div>
        
          <h3 className="text-[20px] font-bold leading-tight tracking-[-0.35px] text-neutral-950 dark:text-white mb-1">
            Accuracy
          </h3>
        </div>
        <motion.p
          key={`acc-${year}-${month}`}
          className="text-[26px] font-extrabold tracking-tight leading-none text-emerald-600 dark:text-emerald-400"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
          {stats.accuracy}%
        </motion.p>
      </div>

      {/* Card */}
      <div className="rounded-[20px] border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
        <div className="px-4 pt-[18px]">

          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={prevMonth}
              className="w-7 h-7 rounded-[7px] flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <IconChevronLeft size={24} strokeWidth={2} />
            </button>
            <p className="text-[15px] font-bold tracking-[-0.3px] text-neutral-900 dark:text-white">
              {MONTHS[month]} {year}
            </p>
            <button
              type="button"
              onClick={nextMonth}
              className="w-7 h-7 rounded-[7px] flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <IconChevronRight size={24} strokeWidth={2} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DOW_LABELS.map((label) => (
              <div
                key={label}
                className="text-center text-[11px] font-medium text-neutral-400 dark:text-neutral-500 py-1"
              >
                {label}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`grid-${year}-${month}`}
              className="grid grid-cols-7 gap-1.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
            >
              {/* Leading blank cells */}
              {Array.from({ length: firstDow }, (_, i) => (
                <div key={`blank-${i}`} className="aspect-square" />
              ))}
              {/* Day cells */}
              {calDays.map(({ day, dateISO, status }) => (
                <div
                  key={dateISO}
                  className={`aspect-square rounded-[8px] flex items-center justify-center text-[13px] font-semibold select-none ${cellStyles(status)}`}
                >
                  {day}
                </div>
              ))}
            </motion.div>
          </AnimatePresence>

          {/* Stats row */}
         <div className="grid grid-cols-4 gap-2 mt-[18px] pt-4 border-t border-neutral-100 dark:border-white/[0.06]">
  <div className="text-center">
    <p className="text-[22px] font-extrabold leading-none tabular-nums text-emerald-600 dark:text-emerald-400">
      {stats.completed}
    </p>
    <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 mt-1.5">
      Completed
    </p>
  </div>

  <div className="text-center">
    <p className="text-[22px] font-extrabold leading-none tabular-nums text-red-500 dark:text-red-400">
      {stats.missed}
    </p>
    <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 mt-1.5">
      Missed
    </p>
  </div>

  <div className="text-center">
    <p className="text-[22px] font-extrabold leading-none tabular-nums text-neutral-400 dark:text-neutral-500">
      {stats.upcoming}
    </p>
    <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 mt-1.5">
      Remaining
    </p>
  </div>

  <div className="text-center">
    <p className="text-[22px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">
      {stats.accuracy}%
    </p>
    <p className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 mt-1.5">
      Accuracy
    </p>
  </div>
</div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center px-4 pt-3.5 pb-4 border-t border-neutral-100 dark:border-white/[0.06] mt-4">
          {[
            { label: "Completed", cls: "bg-emerald-500 dark:bg-emerald-400" },
            { label: "Missed",    cls: "bg-red-500 dark:bg-red-400" },
            { label: "Partial",   cls: "bg-amber-500 dark:bg-amber-400" },
            { label: "Upcoming",  cls: "bg-neutral-100 border border-neutral-200 dark:bg-white/[0.1] dark:border-white/[0.05]" },
          ].map(({ label, cls }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-[3px] shrink-0 ${cls}`} />
              <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
