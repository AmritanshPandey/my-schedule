"use client";

import { IconClock, IconCopy, IconCornerDownRight, IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useState } from "react";
import IconButton from "@/components/ui/IconButton";
import { FORM_CONTROL_BASE } from "@/components/ui/Input";
import type { DeadlineScope } from "@/lib/subtaskDeadline";
import { parseDurationMinutes, formatMinutes } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";

export interface SubtaskDraft {
  id: string;
  title: string;
  info?: string;
  /** Free-text detail — a quantity, spec, or short note; whatever fits the step. */
  duration?: string;
  /** Dedicated time budget in minutes (see ScheduleEntry.timeMinutes). */
  timeMinutes?: number;
  deadline?: string;
  deadlineScope?: DeadlineScope;
}

interface SubtaskDraftRowProps {
  draft: SubtaskDraft;
  onChange: (id: string, updated: SubtaskDraft) => void;
  onDelete: (id: string) => void;
  /** Duplicate this subtask within the current task (inserts a copy below). */
  onDuplicate?: (id: string) => void;
  /** Copy this subtask into other tasks (opens a target picker). */
  onCopyToTask?: (id: string) => void;
  autoFocus?: boolean;
  showDeadline?: boolean;
}

const SCOPE_LABEL: Record<DeadlineScope, string> = { day: "Day", week: "Wk", month: "Mo" };

const ROW_INPUT =
  `${FORM_CONTROL_BASE} bg-white px-3 text-[16px] focus:bg-white dark:bg-white/[0.04] dark:focus:bg-white/[0.07]`;

function SubtaskDraftRow({
  draft,
  onChange,
  onDelete,
  onDuplicate,
  onCopyToTask,
  autoFocus,
  showDeadline,
}: SubtaskDraftRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: draft.id });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteCopy = buildDeleteConfirmationCopy("subtask", {
    name: draft.title.trim() || undefined,
    description: "This subtask will be removed from the task.",
  });

  // The dedicated time field is edited as free text (so "1h 30m" can be typed)
  // but stored as canonical minutes. Local text state holds the in-progress
  // string; `timeMinutes` on the draft is the parsed value used for summing.
  const [timeText, setTimeText] = useState(() =>
    draft.timeMinutes != null ? formatMinutes(draft.timeMinutes) : ""
  );
  const timeInvalid = timeText.trim() !== "" && parseDurationMinutes(timeText) == null;
  function handleTimeChange(text: string) {
    setTimeText(text);
    const mins = parseDurationMinutes(text);
    onChange(draft.id, { ...draft, timeMinutes: mins != null && mins > 0 ? mins : undefined });
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
      }}
      className="group rounded-2xl border border-neutral-200 bg-neutral-50/60 p-2.5 transition-colors hover:border-neutral-300 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-white/[0.14]"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Reorder subtask"
          className="flex h-10 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-neutral-300 transition-colors hover:text-neutral-500 active:cursor-grabbing dark:text-white/20 dark:hover:text-white"
        >
          <IconGripVertical size={14} />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              autoFocus={autoFocus}
              value={draft.title ?? ""}
              onChange={(e) => onChange(draft.id, { ...draft, title: e.target.value })}
              placeholder="Name"
              aria-label="Subtask name"
              autoComplete="off"
              spellCheck
              className={`h-10 min-w-[150px] flex-[1_1_180px] font-semibold ${ROW_INPUT}`}
            />
            {/* Dedicated time — accepts only a time (min/hour); this is what
                counts toward the task's allotted-time budget. */}
            <div className="relative h-10 w-[112px] shrink-0">
              <IconClock
                size={13}
                strokeWidth={2.2}
                className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 ${
                  timeInvalid ? "text-rose-500 dark:text-rose-400" : "text-blue-500 dark:text-blue-400"
                }`}
              />
              <input
                value={timeText}
                onChange={(e) => handleTimeChange(e.target.value)}
                placeholder="15min"
                aria-label="Subtask time (minutes or hours)"
                aria-invalid={timeInvalid}
                autoComplete="off"
                inputMode="text"
                className={`h-10 w-full text-center font-bold ${ROW_INPUT} !pl-6 ${
                  timeInvalid
                    ? "text-rose-600 ring-1 ring-rose-400 dark:text-rose-400"
                    : "text-blue-600 dark:text-blue-400"
                }`}
              />
            </div>
          </div>

          {timeInvalid && (
            <p className="text-[11px] font-semibold text-rose-500 dark:text-rose-400">
              Use a time like 15min, 1h, or 1h30m.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {/* Free-text detail — a short note, quantity, or spec; whatever
                this step needs (e.g. "3 pages", "2 sets", "medium heat"). */}
            <input
              value={draft.duration ?? ""}
              onChange={(e) => onChange(draft.id, { ...draft, duration: e.target.value })}
              placeholder="Detail · optional"
              aria-label="Subtask detail"
              autoComplete="off"
              spellCheck
              className={`h-10 min-w-[120px] flex-[1_1_150px] font-semibold text-neutral-600 dark:text-neutral-300 ${ROW_INPUT}`}
            />
            <input
              value={draft.info ?? ""}
              onChange={(e) => onChange(draft.id, { ...draft, info: e.target.value })}
              placeholder="Info"
              aria-label="Subtask info"
              autoComplete="off"
              spellCheck
              className={`h-10 min-w-[120px] flex-[1_1_150px] text-neutral-600 dark:text-neutral-300 ${ROW_INPUT}`}
            />
            {showDeadline && (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  value={draft.deadline ?? ""}
                  onChange={(e) =>
                    onChange(draft.id, {
                      ...draft,
                      deadline: e.target.value || undefined,
                      deadlineScope: e.target.value ? draft.deadlineScope ?? "day" : undefined,
                    })
                  }
                  aria-label="Subtask deadline date"
                  className={`h-10 w-[150px] shrink-0 font-medium text-neutral-600 dark:text-neutral-300 ${ROW_INPUT}`}
                />
                {draft.deadline && (
                  <div className="flex shrink-0 gap-1">
                    {(["day", "week", "month"] as const).map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => onChange(draft.id, { ...draft, deadlineScope: scope })}
                        aria-pressed={(draft.deadlineScope ?? "day") === scope}
                        className={`h-9 rounded-lg px-2.5 text-[12px] font-bold transition-colors ${
                          (draft.deadlineScope ?? "day") === scope
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                            : "border border-neutral-200 text-neutral-400 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:text-neutral-300"
                        }`}
                      >
                        {SCOPE_LABEL[scope]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-0.5">
          {onDuplicate && (
            <IconButton
              label="Duplicate subtask"
              variant="ghost"
              size="xs"
              radius="lg"
              onClick={() => { haptic("light"); onDuplicate(draft.id); }}
            >
              <IconCopy size={15} />
            </IconButton>
          )}
          {onCopyToTask && (
            <IconButton
              label="Copy subtask to another task"
              variant="ghost"
              size="xs"
              radius="lg"
              onClick={() => { haptic("light"); onCopyToTask(draft.id); }}
            >
              <IconCornerDownRight size={15} />
            </IconButton>
          )}
          <IconButton
            label="Delete subtask"
            variant="dangerGhost"
            size="xs"
            radius="lg"
            onClick={() => { haptic("light"); setDeleteOpen(true); }}
          >
            <IconTrash size={15} />
          </IconButton>
        </div>
      </div>

      <ConfirmSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          onDelete(draft.id);
          setDeleteOpen(false);
        }}
        title={deleteCopy.title}
        description={deleteCopy.description}
        confirmLabel={deleteCopy.confirmLabel}
      />
    </div>
  );
}

export default memo(SubtaskDraftRow);
