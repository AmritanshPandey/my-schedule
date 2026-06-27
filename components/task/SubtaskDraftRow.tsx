"use client";

import { IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useState } from "react";
import IconButton from "@/components/ui/IconButton";
import { FORM_CONTROL_BASE } from "@/components/ui/Input";
import type { DeadlineScope } from "@/lib/subtaskDeadline";
import { haptic } from "@/lib/haptics";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";

export interface SubtaskDraft {
  id: string;
  title: string;
  info?: string;
  duration?: string;
  deadline?: string;
  deadlineScope?: DeadlineScope;
}

interface SubtaskDraftRowProps {
  draft: SubtaskDraft;
  onChange: (id: string, updated: SubtaskDraft) => void;
  onDelete: (id: string) => void;
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
  autoFocus,
  showDeadline,
}: SubtaskDraftRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: draft.id });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteCopy = buildDeleteConfirmationCopy("subtask", {
    name: draft.title.trim() || undefined,
    description: "This subtask will be removed from the task.",
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
      }}
      className="group rounded-xl border border-neutral-200 bg-neutral-50/60 p-2.5 dark:border-white/[0.08] dark:bg-white/[0.02]"
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
            <input
              value={draft.duration ?? ""}
              onChange={(e) => onChange(draft.id, { ...draft, duration: e.target.value })}
              placeholder="5min"
              aria-label="Subtask duration"
              autoComplete="off"
              inputMode="text"
              className={`h-10 w-[92px] shrink-0 text-center font-bold text-sky-700 dark:text-sky-300 ${ROW_INPUT}`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={draft.info ?? ""}
              onChange={(e) => onChange(draft.id, { ...draft, info: e.target.value })}
              placeholder="Info"
              aria-label="Subtask info"
              autoComplete="off"
              spellCheck
              className={`h-10 min-w-[150px] flex-[1_1_190px] text-neutral-600 dark:text-neutral-300 ${ROW_INPUT}`}
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
