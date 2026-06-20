"use client";

import { m } from "framer-motion";
import { IconBolt, IconCheck } from "@tabler/icons-react";
import type { Task, Plan, Milestone } from "@/lib/useScheduleDB";
import { formatDisplayTime } from "@/lib/timeUtils";

interface WhatNextCardProps {
  task: Task;
  plan: Plan;
  milestone?: Milestone;
  onMarkDone: () => void;
  onDismissDay: () => void;
}

export default function WhatNextCard({
  task,
  plan,
  milestone,
  onMarkDone,
  onDismissDay,
}: WhatNextCardProps) {
  const timeLabel =
    task.startTime && task.endTime
      ? `${formatDisplayTime(task.startTime)} – ${formatDisplayTime(task.endTime)}`
      : task.startTime
        ? formatDisplayTime(task.startTime)
        : task.endTime
          ? formatDisplayTime(task.endTime)
          : null;

  return (
    <m.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="mb-3 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/[0.08] dark:to-transparent"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 border-b border-emerald-100 px-4 py-2.5 dark:border-emerald-500/[0.12]">
        <IconBolt
          size={12}
          strokeWidth={2.5}
          className="shrink-0 text-emerald-500"
        />
        <p className="text-[10.5px] font-black uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-400">
          Current Task
        </p>
      </div>

      {/* Body */}
      <div className="px-4 pt-3 pb-3.5">
        {/* Task title + time */}
        <p className="text-[17px] font-bold leading-snug tracking-[-0.3px] text-neutral-950 dark:text-white">
          {task.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {timeLabel && (
            <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">
              {timeLabel}
            </span>
          )}
          <span className="text-[13px] text-neutral-400 dark:text-neutral-500">
            {plan.emoji} {plan.title}
          </span>
        </div>

        {/* Milestone link */}
        {milestone && (
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 dark:bg-violet-500/[0.1]">
            <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">
              → {milestone.title}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onMarkDone}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
          >
            <IconCheck size={14} strokeWidth={2.5} />
            Mark done
          </button>
          <button
            type="button"
            onClick={onDismissDay}
            className="rounded-xl px-3 py-2 text-[13px] font-medium text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            Focus later
          </button>
        </div>
      </div>
    </m.div>
  );
}
