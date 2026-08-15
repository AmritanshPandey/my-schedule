"use client";

import { IconCalendarDue } from "@tabler/icons-react";
import Pill from "@/components/ui/Pill";
import TaskStatusCheckbox from "@/components/task/TaskStatusCheckbox";
import type { TaskState } from "@/lib/taskCompletion";
import type { ScheduleEntry, MetaField } from "@/components/ScheduleItem";
import {
  deadlineState,
  formatDeadline,
  type DeadlineState,
} from "@/lib/subtaskDeadline";
import { formatMinutes } from "@/lib/timeUtils";

const DEADLINE_BADGE: Record<DeadlineState, string> = {
  overdue: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  soon: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  upcoming: "border-neutral-200 bg-white text-neutral-500 dark:border-white/[0.12] dark:bg-transparent dark:text-neutral-400",
};

interface DetailSegment {
  text: string;
  /** Marks the segment as the time figure, so it renders in Info Blue. */
  isTime?: boolean;
}

/** Structured detail pieces for a checklist item — info, then time, then any
 *  free-text detail — so the time figure can be styled distinctly from the rest. */
export function getTaskDetailSegments(entry: ScheduleEntry): DetailSegment[] | null {
  const info = entry.info?.trim() || entry.note?.trim();
  const segments: DetailSegment[] = [];
  if (info) segments.push({ text: info });
  if (entry.timeMinutes != null && entry.timeMinutes > 0) {
    segments.push({ text: formatMinutes(entry.timeMinutes), isTime: true });
  }
  if (entry.duration) segments.push({ text: entry.duration });
  if (segments.length > 0) return segments;
  const meta = (entry as ScheduleEntry & { meta?: MetaField[] }).meta;
  if (meta && meta.length > 0) return meta.map((m) => ({ text: m.value }));
  if (entry.time) return [{ text: entry.time }];
  return null;
}

export function getTaskDetailPill(entry: ScheduleEntry): string | null {
  const segments = getTaskDetailSegments(entry);
  return segments ? segments.map((s) => s.text).join(" · ") : null;
}

interface TaskChecklistItemProps {
  item: ScheduleEntry;
  isDone: boolean;
  state: TaskState;
  today: string;
  readOnly?: boolean;
  onToggle: () => void;
}

export default function TaskChecklistItem({
  item,
  isDone,
  state,
  today,
  readOnly = false,
  onToggle,
}: TaskChecklistItemProps) {
  const detailSegments = getTaskDetailSegments(item);
  const deadline = item.deadline
    ? {
        label: formatDeadline(item.deadline, item.deadlineScope ?? "day"),
        state: deadlineState(item.deadline, item.deadlineScope ?? "day", today),
      }
    : null;

  function handleToggle() {
    if (!readOnly) onToggle();
  }

  return (
    <div
      role="button"
      tabIndex={readOnly ? -1 : 0}
      onClick={handleToggle}
      onKeyDown={(e) => {
        if (readOnly) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors ${
        isDone ? "bg-transparent" : "bg-neutral-100/70 dark:bg-white/[0.03]"
      }`}
    >
      <TaskStatusCheckbox
        state={state}
        checked={isDone}
        readOnly={readOnly}
        label={isDone ? "Mark subtask not done" : "Mark subtask done"}
        onClick={onToggle}
      />
      <span className={`min-w-0 flex-1 text-[16px] font-semibold ${
        isDone ? "text-neutral-400 line-through dark:text-neutral-500"
        : state === "missed" ? "text-neutral-400 line-through decoration-rose-400 dark:text-neutral-500"
        : "text-neutral-800 dark:text-neutral-200"
      }`}>
        {item.task}
      </span>
      {deadline && (
        <Pill
          size="sm"
          className={`font-bold ${
            isDone
              ? "border-neutral-200 bg-white text-neutral-400 dark:border-white/[0.12] dark:bg-transparent dark:text-neutral-500"
              : DEADLINE_BADGE[deadline.state]
          }`}
          icon={<IconCalendarDue size={12} strokeWidth={2.2} />}
        >
          {deadline.label}
        </Pill>
      )}
      {detailSegments && (
        <Pill variant="neutral" size="md" className="text-[13px]">
          {detailSegments.map((seg, i) => (
            <span key={i} className={seg.isTime ? "font-extrabold tabular-nums text-blue-600 dark:text-blue-400" : undefined}>
              {i > 0 && <span className="mx-1 text-neutral-300 dark:text-neutral-600">·</span>}
              {seg.text}
            </span>
          ))}
        </Pill>
      )}
    </div>
  );
}
