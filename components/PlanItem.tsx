"use client";

import { useEffect, useState } from "react";
import { ScheduleEntry, MetaField } from "./ScheduleItem";
import { IconCheck, IconEdit, IconGripVertical, IconTrash, IconX } from "@tabler/icons-react";

const META_BADGE_COLORS = [
  "bg-blue-500/10 text-blue-600 border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-400/35",
  "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-400/35",
  "bg-violet-500/10 text-violet-600 border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-400/35",
  "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35",
  "bg-pink-500/10 text-pink-600 border-pink-500/25 dark:bg-pink-500/15 dark:text-pink-400 dark:border-pink-400/35",
  "bg-cyan-500/10 text-cyan-600 border-cyan-500/25 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-400/35",
];

const TITLE_LIMIT = 50;
const NOTE_LIMIT = 80;
const META_VALUE_LIMIT = 20;


interface PlanItemProps {
  index: number;
  entry: ScheduleEntry;
  metaFields: string[];
  editMode: boolean;
  showDate: boolean;
  onEdit: (id: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
  };
}

export default function PlanItem({ index, entry, metaFields, editMode, showDate, onEdit, onDelete, dragHandleProps }: PlanItemProps) {
  const [editing, setEditing] = useState(false);
  const [task, setTask] = useState(entry.task);
  const [note, setNote] = useState(entry.note ?? "");
  const [metaValues, setMetaValues] = useState<Record<string, string>>(
    Object.fromEntries((entry.meta ?? []).map((m) => [m.label, m.value]))
  );

  useEffect(() => {
    if (!editing) {
      setTask(entry.task);
      setNote(entry.note ?? "");
      setMetaValues(Object.fromEntries((entry.meta ?? []).map((m) => [m.label, m.value])));
    }
  }, [entry, editing]);

  function handleSave() {
    if (!task.trim()) return;
    const meta: MetaField[] = metaFields
      .filter((f) => metaValues[f]?.trim())
      .map((f) => ({ label: f, value: metaValues[f].trim().slice(0, META_VALUE_LIMIT) }));
    onEdit(entry.id, {
      task: task.trim().slice(0, TITLE_LIMIT),
      note: note.trim().slice(0, NOTE_LIMIT) || undefined,
      meta: meta.length > 0 ? meta : undefined,
    });
    setEditing(false);
  }

  function handleCancel() {
    setTask(entry.task);
    setNote(entry.note ?? "");
    setMetaValues(Object.fromEntries((entry.meta ?? []).map((m) => [m.label, m.value])));
    setEditing(false);
  }

  const displayMeta = (entry.meta ?? []).slice(0, 3);

  if (editing) {
    return (
      <div className="space-y-3 rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <div>
          <input
            value={task}
            onChange={(e) => setTask(e.target.value.slice(0, TITLE_LIMIT))}
            placeholder="Item name"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); }}
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20"
          />
          {task.length >= TITLE_LIMIT - 10 && (
            <p className={`mt-1 text-right text-[10px] ${task.length >= TITLE_LIMIT ? "text-rose-500" : "text-neutral-400"}`}>
              {task.length}/{TITLE_LIMIT}
            </p>
          )}
        </div>

        {metaFields.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {metaFields.map((field) => (
              <div key={field}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400 dark:text-neutral-500 pointer-events-none">
                    {field}
                  </span>
                  <input
                    value={metaValues[field] ?? ""}
                    onChange={(e) => setMetaValues((prev) => ({ ...prev, [field]: e.target.value.slice(0, META_VALUE_LIMIT) }))}
                    placeholder="—"
                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
                    className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-20 pr-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20"
                  />
                </div>
                {(metaValues[field]?.length ?? 0) >= META_VALUE_LIMIT - 4 && (
                  <p className={`mt-0.5 text-right text-[10px] ${(metaValues[field]?.length ?? 0) >= META_VALUE_LIMIT ? "text-rose-500" : "text-neutral-400"}`}>
                    {metaValues[field]?.length ?? 0}/{META_VALUE_LIMIT}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, NOTE_LIMIT))}
            placeholder="Add a note… (optional)"
            rows={2}
            onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); }}
            className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20"
          />
          <p className={`mt-0.5 text-right text-[10px] ${note.length >= NOTE_LIMIT - 10 ? note.length >= NOTE_LIMIT ? "text-rose-500" : "text-amber-500" : "text-neutral-400"}`}>
            {note.length}/{NOTE_LIMIT}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            <IconCheck size={14} />
            Save
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            <IconX size={14} />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.03]">
      {editMode && (
        <button
          type="button"
          aria-label="Drag item"
          className="mt-0.5 inline-flex h-6 w-5 touch-none items-center justify-center rounded text-neutral-300 hover:text-neutral-500 dark:text-neutral-700 dark:hover:text-neutral-400"
          {...(dragHandleProps?.attributes ?? {})}
          {...(dragHandleProps?.listeners ?? {})}
        >
          <IconGripVertical size={13} />
        </button>
      )}

      <span className="mt-0.5 w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-neutral-300 dark:text-neutral-700 select-none">
        {index}
      </span>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
          {entry.task}
        </p>
        {displayMeta.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {displayMeta.map((m, i) => (
              <span
                key={m.label}
                className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${META_BADGE_COLORS[i % META_BADGE_COLORS.length]}`}
              >
                {m.label}: {m.value}
              </span>
            ))}
          </div>
        )}
        {entry.note && (
          <p className="mt-1 text-xs leading-relaxed text-neutral-400 dark:text-neutral-500 line-clamp-2">
            {entry.note}
          </p>
        )}
      </div>

      {editMode && (
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Edit"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
          >
            <IconEdit size={13} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(entry.id)}
            title="Delete"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          >
            <IconTrash size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
