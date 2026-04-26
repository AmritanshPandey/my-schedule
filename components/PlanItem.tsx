"use client";

import { useEffect, useState } from "react";
import { ScheduleEntry, MetaField } from "./ScheduleItem";
import { IconCheck, IconEdit, IconGripVertical, IconTrash, IconX } from "@tabler/icons-react";

const BADGE_STYLES: Record<string, string> = {
  calories: "bg-amber-500/10 text-amber-600 border border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35",
  protein:  "bg-emerald-500/10 text-emerald-600 border border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-400/35",
  carbs:    "bg-violet-500/10 text-violet-600 border border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-400/35",
  fat:      "bg-pink-500/10 text-pink-600 border border-pink-500/25 dark:bg-pink-500/15 dark:text-pink-400 dark:border-pink-400/35",
  duration: "bg-sky-500/10 text-sky-600 border border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-400/35",
  sets:     "bg-blue-500/10 text-blue-600 border border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-400/35",
  reps:     "bg-cyan-500/10 text-cyan-600 border border-cyan-500/25 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-400/35",
};

function badgeStyle(label: string) {
  return BADGE_STYLES[label.toLowerCase()] ?? "bg-neutral-100 text-neutral-600 border border-neutral-200 dark:bg-neutral-900 dark:text-neutral-400 dark:border-neutral-800";
}

interface PlanItemProps {
  entry: ScheduleEntry;
  metaFields: string[];
  onEdit: (id: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
  };
}

export default function PlanItem({ entry, metaFields, onEdit, onDelete, dragHandleProps }: PlanItemProps) {
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(entry.time);
  const [task, setTask] = useState(entry.task);
  const [metaValues, setMetaValues] = useState<Record<string, string>>(
    Object.fromEntries((entry.meta ?? []).map((m) => [m.label, m.value]))
  );

  useEffect(() => {
    if (!editing) {
      setTime(entry.time);
      setTask(entry.task);
      setMetaValues(Object.fromEntries((entry.meta ?? []).map((m) => [m.label, m.value])));
    }
  }, [entry, editing]);

  function handleSave() {
    if (!time.trim() || !task.trim()) return;
    const meta: MetaField[] = metaFields
      .filter((f) => metaValues[f]?.trim())
      .map((f) => ({ label: f, value: metaValues[f].trim() }));
    onEdit(entry.id, { time: time.trim(), task: task.trim(), meta: meta.length > 0 ? meta : undefined });
    setEditing(false);
  }

  function handleCancel() {
    setTime(entry.time);
    setTask(entry.task);
    setMetaValues(Object.fromEntries((entry.meta ?? []).map((m) => [m.label, m.value])));
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-white/10 dark:bg-neutral-900">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="Time"
            className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-mono text-neutral-600 outline-none transition-colors focus:border-neutral-400 sm:w-24 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-300 dark:focus:border-white/20"
          />
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Description"
            autoFocus
            className="h-10 flex-1 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:border-white/20"
          />
        </div>
        {metaFields.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {metaFields.map((field) => (
              <input
                key={field}
                value={metaValues[field] ?? ""}
                onChange={(e) => setMetaValues((prev) => ({ ...prev, [field]: e.target.value }))}
                placeholder={field}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") handleCancel();
                }}
                className="h-9 w-28 rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-600 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-300 dark:focus:border-white/20"
              />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            <IconCheck size={15} />
            Save
          </button>
          <button
            onClick={handleCancel}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            <IconX size={15} />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
      <button
        type="button"
        aria-label="Drag item"
        className="inline-flex h-8 w-7 touch-none items-center justify-center rounded text-neutral-400 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        {...(dragHandleProps?.attributes ?? {})}
        {...(dragHandleProps?.listeners ?? {})}
      >
        <IconGripVertical size={15} />
      </button>
      <span className="w-20 shrink-0 text-xs font-mono text-neutral-400 dark:text-neutral-500">{entry.time}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-neutral-900 dark:text-white">{entry.task}</span>
        {entry.meta && entry.meta.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {entry.meta.map((m) => (
              <span
                key={m.label}
                className={`text-xs px-2 py-0.5 rounded font-medium ${badgeStyle(m.label)}`}
              >
                {m.label}: {m.value}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => setEditing(true)}
          title="Edit"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-neutral-300"
        >
          <IconEdit size={16} />
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          title="Delete"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
        >
          <IconTrash size={16} />
        </button>
      </div>
    </div>
  );
}
