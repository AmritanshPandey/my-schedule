"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconCheck,
  IconListCheck,
  IconPlus,
  IconRepeat,
} from "@tabler/icons-react";
import type { Task, DayKey } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";

const DAY_ABBR: Record<DayKey, string> = {
  monday: "Mo", tuesday: "Tu", wednesday: "We", thursday: "Th",
  friday: "Fr", saturday: "Sa", sunday: "Su",
};

interface RoutineGroup {
  key: string;
  representativeTask: Task;
  todayTask: Task | null;
  activeDays: DayKey[];
  stepCount: number;
  doneToday: boolean;
}

interface RoutineViewProps {
  activities: Record<DayKey, Task[]>;
  todayKey: DayKey;
  onOpenRoutine: (task: Task) => void;
  onCreateRoutine: () => void;
}

export default function RoutineView({
  activities,
  todayKey,
  onOpenRoutine,
  onCreateRoutine,
}: RoutineViewProps) {
  const routines = useMemo((): RoutineGroup[] => {
    const seen = new Map<string, RoutineGroup>();

    for (const day of DAYS) {
      for (const task of activities[day]) {
        if (task.taskType !== "routine") continue;
        const key = task.title.trim().toLowerCase();
        const existing = seen.get(key);
        if (existing) {
          if (!existing.activeDays.includes(day)) existing.activeDays.push(day);
          if (day === todayKey) {
            existing.todayTask = task;
            existing.doneToday = !!task.completed;
          }
        } else {
          seen.set(key, {
            key,
            representativeTask: task,
            todayTask: day === todayKey ? task : null,
            activeDays: [day],
            stepCount: task.subtasks?.length ?? 0,
            doneToday: day === todayKey ? !!task.completed : false,
          });
        }
      }
    }

    return Array.from(seen.values());
  }, [activities, todayKey]);

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-32 pt-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <IconRepeat size={16} className="text-neutral-400" strokeWidth={1.8} />
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400">
              Daily Habits
            </span>
          </div>
          <h1 className="text-[28px] font-bold leading-tight text-neutral-900 dark:text-white">
            Routines
          </h1>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => { haptic("medium"); onCreateRoutine(); }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
        >
          <IconPlus size={20} strokeWidth={2.2} />
        </motion.button>
      </div>

      {/* Empty state */}
      {routines.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4 pt-16 text-center"
        >
          <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-neutral-100 dark:bg-white/[0.06]">
            <IconRepeat size={36} strokeWidth={1.4} className="text-neutral-400 dark:text-neutral-500" />
          </div>
          <div>
            <p className="text-[16px] font-semibold text-neutral-700 dark:text-neutral-200">
              No routines yet
            </p>
            <p className="mt-1.5 max-w-[240px] text-[14px] leading-relaxed text-neutral-400">
              Create routine tasks to build consistent daily habits across your week.
            </p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => { haptic("medium"); onCreateRoutine(); }}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-[14px] font-semibold text-white dark:bg-white dark:text-neutral-950"
          >
            <IconPlus size={16} strokeWidth={2.5} />
            Create First Routine
          </motion.button>
        </motion.div>
      )}

      {/* Routine list */}
      <AnimatePresence initial={false}>
        {routines.map((r, i) => {
          const task = r.todayTask ?? r.representativeTask;
          return (
            <motion.div
              key={r.key}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ delay: i * 0.04, duration: 0.22 }}
              className="mb-3"
            >
              <motion.button
                type="button"
                whileTap={{ scale: 0.99 }}
                onClick={() => { haptic("light"); onOpenRoutine(task); }}
                className="w-full rounded-[22px] border border-neutral-200/80 bg-white px-5 py-4 text-left transition-all duration-150 dark:border-white/[0.08] dark:bg-neutral-900"
              >
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    r.doneToday
                      ? "bg-green-500/10"
                      : "bg-neutral-100 dark:bg-white/[0.07]"
                  }`}>
                    {r.doneToday
                      ? <IconCheck size={18} strokeWidth={2.5} className="text-green-600 dark:text-green-400" />
                      : <IconRepeat size={18} strokeWidth={1.8} className="text-neutral-500 dark:text-neutral-400" />
                    }
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className={`text-[16px] font-semibold leading-snug ${
                      r.doneToday
                        ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-500 dark:decoration-neutral-600"
                        : "text-neutral-900 dark:text-white"
                    }`}>
                      {r.representativeTask.title}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {/* Day pills */}
                      <div className="flex gap-[3px]">
                        {DAYS.map((day) => (
                          <span
                            key={day}
                            className={`inline-block rounded-full px-[5px] py-[2px] text-[10px] font-bold ${
                              r.activeDays.includes(day)
                                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                                : "bg-neutral-100 text-neutral-300 dark:bg-white/[0.04] dark:text-neutral-600"
                            }`}
                          >
                            {DAY_ABBR[day]}
                          </span>
                        ))}
                      </div>

                      {/* Step count */}
                      {r.stepCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">
                          <IconListCheck size={12} strokeWidth={2} />
                          {r.stepCount} step{r.stepCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Done badge */}
                  {r.doneToday && (
                    <span className="self-center rounded-full bg-green-500/10 px-2.5 py-1 text-[11px] font-bold text-green-600 dark:text-green-400">
                      Done
                    </span>
                  )}
                </div>
              </motion.button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
