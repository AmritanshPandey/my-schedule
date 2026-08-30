"use client";

import { useMemo, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { RitualCalendarDay, RitualCalendarStatus } from "@/lib/consistency/ritualCalendar";

const DOW_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function cellStyles(status: RitualCalendarStatus): string {
  switch (status) {
    case "complete":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/[0.18] dark:text-emerald-300";
    case "missed":
      return "bg-red-100 text-red-700 dark:bg-red-500/[0.18] dark:text-red-300";
    case "future":
      return "bg-neutral-100 text-neutral-500 dark:bg-white/[0.05] dark:text-neutral-400";
    case "not-scheduled":
      return "text-neutral-300 dark:text-neutral-700";
  }
}

interface RoutineMonthCalendarProps {
  year: number;
  month: number; // 0-indexed
  days: RitualCalendarDay[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDay?: (dateISO: string) => void;
  title?: string;
}

export default function RoutineMonthCalendar({
  year,
  month,
  days,
  onPrevMonth,
  onNextMonth,
  onSelectDay,
  title = "This month",
}: RoutineMonthCalendarProps) {
  const firstDow = new Date(year, month, 1).getDay();

  const stats = useMemo(() => {
    let complete = 0, missed = 0;
    for (const d of days) {
      if (d.status === "complete") complete++;
      else if (d.status === "missed") missed++;
    }
    const scheduled = complete + missed;
    const pct = scheduled > 0 ? Math.round((complete / scheduled) * 100) : 0;
    return { complete, missed, pct, scheduled };
  }, [days]);

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-[15px] font-bold leading-tight tracking-[-0.2px] text-neutral-950 dark:text-white">
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
            {MONTHS[month]} · {stats.scheduled} scheduled days
          </p>
        </div>
        {stats.scheduled > 0 && (
          <m.p
            key={`routine-cal-${year}-${month}`}
            className="text-[20px] font-extrabold tracking-tight leading-none text-emerald-600 dark:text-emerald-400"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            {stats.pct}%
          </m.p>
        )}
      </div>

      <div className="rounded-[20px] border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 pt-[18px] pb-4">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={onPrevMonth}
            className="w-7 h-7 rounded-[7px] flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <IconChevronLeft size={22} strokeWidth={2} />
          </button>
          <p className="text-[15px] font-bold tracking-[-0.2px] text-neutral-900 dark:text-white">
            {MONTHS[month]} {year}
          </p>
          <button
            type="button"
            onClick={onNextMonth}
            className="w-7 h-7 rounded-[7px] flex items-center justify-center text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <IconChevronRight size={22} strokeWidth={2} />
          </button>
        </div>

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

        <AnimatePresence mode="wait">
          <m.div
            key={`routine-grid-${year}-${month}`}
            className="grid grid-cols-7 gap-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
          >
            {Array.from({ length: firstDow }, (_, i) => (
              <div key={`blank-${i}`} className="aspect-square" />
            ))}
            {days.map(({ day, dateISO, status }) => (
              <button
                type="button"
                key={dateISO}
                onClick={onSelectDay ? () => onSelectDay(dateISO) : undefined}
                disabled={!onSelectDay}
                className={`aspect-square rounded-[10px] flex items-center justify-center text-[13px] font-semibold select-none ${cellStyles(status)} ${onSelectDay ? "cursor-pointer active:scale-95 transition-transform" : ""}`}
              >
                {day}
              </button>
            ))}
          </m.div>
        </AnimatePresence>

        <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center pt-3.5 mt-3 border-t border-neutral-100 dark:border-white/[0.06]">
          {[
            { label: "Complete", cls: "bg-emerald-500 dark:bg-emerald-400" },
            { label: "Missed", cls: "bg-red-500 dark:bg-red-400" },
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
