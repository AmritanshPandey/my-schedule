"use client";

import { IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import IconButton from "@/components/ui/IconButton";
import type { DeadlineScope } from "@/lib/subtaskDeadline";

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
  onChange: (updated: SubtaskDraft) => void;
  onDelete: () => void;
  autoFocus?: boolean;
  showDeadline?: boolean;
}

const SCOPE_LABEL: Record<DeadlineScope, string> = { day: "Day", week: "Wk", month: "Mo" };

const INPUT_BASE =
  "rounded-xl border border-neutral-200 bg-white px-3 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:placeholder:text-neutral-500 dark:focus:border-white/20";

export default function SubtaskDraftRow({
  draft,
  onChange,
  onDelete,
  autoFocus,
  showDeadline,
}: SubtaskDraftRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: draft.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
      }}
      className="group rounded-2xl border border-neutral-200 bg-neutral-50/60 p-2 dark:border-white/[0.08] dark:bg-white/[0.02]"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex h-9 w-6 shrink-0 cursor-grab items-center justify-center rounded-lg text-neutral-300 transition-colors hover:text-neutral-500 active:cursor-grabbing dark:text-white/20 dark:hover:text-white"
        >
          <IconGripVertical size={14} />
        </button>
        <input
          autoFocus={autoFocus}
          value={draft.title ?? ""}
          onChange={(e) => onChange({ ...draft, title: e.target.value })}
          placeholder="Name"
          className={`h-9 min-w-0 flex-1 text-[14px] font-medium text-neutral-900 focus:bg-white dark:text-white dark:focus:bg-white/[0.07] ${INPUT_BASE}`}
        />
        <input
          value={draft.duration ?? ""}
          onChange={(e) => onChange({ ...draft, duration: e.target.value })}
          placeholder="5min"
          className={`h-9 w-[120px] shrink-0 text-center text-[13px] font-semibold text-sky-700 focus:bg-white dark:text-sky-300 dark:focus:bg-white/[0.07] ${INPUT_BASE}`}
        />
        <IconButton
          label="Delete subtask"
          variant="dangerGhost"
          size="xs"
          radius="lg"
          onClick={onDelete}
        >
          <IconTrash size={15} />
        </IconButton>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
        <input
          value={draft.info ?? ""}
          onChange={(e) => onChange({ ...draft, info: e.target.value })}
          placeholder="Info"
          className={`h-8 min-w-[110px] flex-1 text-[13px] text-neutral-500 focus:bg-white dark:text-neutral-400 dark:focus:bg-white/[0.07] ${INPUT_BASE}`}
        />
        {showDeadline && (
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              type="date"
              value={draft.deadline ?? ""}
              onChange={(e) =>
                onChange({
                  ...draft,
                  deadline: e.target.value || undefined,
                  deadlineScope: e.target.value ? draft.deadlineScope ?? "day" : undefined,
                })
              }
              aria-label="Deadline date"
              className={`h-8 shrink-0 text-[12px] font-medium text-neutral-600 focus:bg-white dark:text-neutral-300 dark:focus:bg-white/[0.07] dark:[color-scheme:dark] ${INPUT_BASE}`}
            />
            {draft.deadline && (
              <div className="flex shrink-0 gap-0.5">
                {(["day", "week", "month"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => onChange({ ...draft, deadlineScope: scope })}
                    className={`h-8 rounded-lg px-2 text-[11px] font-bold transition-colors ${
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
  );
}
