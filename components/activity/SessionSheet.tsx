"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { IconCheck } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import type { Task, Plan } from "@/lib/useScheduleDB";
import type { ScheduleEntry } from "@/components/ScheduleItem";

interface SessionSheetProps {
  isOpen: boolean;
  task: Task | null;
  linkedPlan: Plan | null;
  onClose: () => void;
  onComplete: (taskId: string, allSubtaskIds: string[]) => void;
  onEdit: () => void;
}

export default function SessionSheet({
  isOpen,
  task,
  linkedPlan,
  onClose,
  onComplete,
  onEdit,
}: SessionSheetProps) {
  const items: ScheduleEntry[] = useMemo(() => {
    if (!task) return [];
    // Routine tasks: items are always task-level only (no plan fallback)
    if (task.taskType === "session") return task.subtasks ?? [];
    return task.subtasks?.length ? task.subtasks : linkedPlan?.items ?? [];
  }, [task, linkedPlan]);

  const allItemIds = useMemo(() => items.map((i) => i.id), [items]);

  const done = useMemo(() => !!task?.completed, [task]);

  if (!task) return null;

  const eyebrow = linkedPlan?.title ?? "Session";

  return (
    <BottomSheet open={isOpen} onClose={onClose}>
      <div className="px-5 pt-2 pb-6 flex flex-col gap-5">
        {/* Header */}
        <SheetHeader eyebrow={eyebrow} title={task.title} onClose={onClose} />

        {/* Time chip */}
        {(task.startTime || task.endTime) && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3.5 py-1.5 text-[13px] font-semibold text-neutral-600 dark:border-white/[0.10] dark:bg-white/[0.04] dark:text-neutral-400">
              {task.startTime}{task.endTime ? ` – ${task.endTime}` : ""}
            </span>
          </div>
        )}

        {/* Routine items */}
        {items.length > 0 && (
          <div className="rounded-[24px] border border-neutral-200 bg-white overflow-hidden dark:border-white/[0.08] dark:bg-neutral-950/50">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-center gap-3 px-4 py-4 ${
                  idx > 0 ? "border-t border-neutral-100 dark:border-white/[0.05]" : ""
                }`}
              >
                <span className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/[0.06] text-[12px] font-bold text-neutral-600 dark:text-neutral-400">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-medium text-neutral-900 dark:text-white">
                    {item.task}
                  </p>
                  {item.info ? (
                    <p className="mt-1 truncate text-[13px] text-neutral-500 dark:text-neutral-400">
                      {item.info}
                    </p>
                  ) : null}
                </div>
                {item.duration && (
                  <span className="shrink-0 rounded-full bg-neutral-100 dark:bg-white/[0.06] px-3 py-1 text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">
                    {item.duration}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Description */}
        {task.description && (
          <p className="text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {task.description}
          </p>
        )}

        {/* Action row */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => { onEdit(); onClose(); }}
            className="text-[14px] font-semibold text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
          >
            Edit Session
          </button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            onClick={() => {
              onComplete(task.id, allItemIds);
              if (!done) onClose();
            }}
            className={`ml-auto flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-bold transition-colors duration-200 ${
              done
                ? "bg-neutral-100 text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-400"
                : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
            }`}
          >
            {done ? (
              <>
                <IconCheck size={16} strokeWidth={2.5} />
                Completed
              </>
            ) : (
              "Complete Session"
            )}
          </motion.button>
        </div>
      </div>
    </BottomSheet>
  );
}
