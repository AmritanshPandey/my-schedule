"use client";

import { IconMinus, IconX } from "@tabler/icons-react";
import type { TaskState } from "@/lib/taskCompletion";
import { taskStatusLabel } from "@/lib/taskCompletion";
import CheckDraw from "@/components/ui/CheckDraw";

interface TaskStatusCheckboxProps {
  state: TaskState;
  checked?: boolean;
  size?: "sm" | "md";
  readOnly?: boolean;
  label: string;
  onClick?: () => void;
}

const sizeClasses = {
  sm: "h-6 w-6 rounded-pr-sm",
  md: "h-7 w-7 rounded-lg",
} as const;

export default function TaskStatusCheckbox({
  state,
  checked,
  size = "sm",
  readOnly = false,
  label,
  onClick,
}: TaskStatusCheckboxProps) {
  const done = checked ?? state === "completed";
  const partial = !checked && state === "partial";
  const missed = !done && state === "missed";
  // Derived from the locals above, not from raw `state`: TaskChecklistItem
  // passes the PARENT task's state alongside the subtask's own `checked`, so
  // "missed parent, unchecked subtask" is a legitimate combination.
  const effectiveState: TaskState = done
    ? "completed"
    : missed
    ? "missed"
    : partial
    ? "partial"
    : "incomplete";
  const statusLabel = taskStatusLabel(effectiveState, readOnly, readOnly ? undefined : label);

  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={(e) => {
        e.stopPropagation();
        if (!readOnly) onClick?.();
      }}
      aria-label={statusLabel}
      aria-disabled={readOnly}
      aria-pressed={done}
      className={`tap-target flex shrink-0 items-center justify-center border-2 transition-colors disabled:opacity-100 ${
        sizeClasses[size]
      } ${readOnly ? "cursor-default" : "active:scale-95"} ${
        done || partial
          ? "border-transparent bg-green-600"
        : missed
          ? "border-transparent bg-rose-500"
          : readOnly
          ? "border-neutral-200 bg-neutral-100/80 dark:border-white/[0.08] dark:bg-white/[0.04]"
          : "border-green-600/70 bg-transparent dark:border-green-500/70"
      }`}
    >
      <CheckDraw visible={done} size={14} strokeWidth={3} className="text-white" />
      {partial && <IconMinus size={14} strokeWidth={3} className="text-white" />}
      {missed && <IconX size={14} strokeWidth={3} className="text-white" />}
    </button>
  );
}
