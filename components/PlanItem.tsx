"use client";

import { useState } from "react";
import { ScheduleEntry, MetaField } from "./ScheduleItem";
import { IconCheck, IconEdit, IconGripVertical, IconTrash, IconX } from "@tabler/icons-react";

const BADGE_STYLES: Record<string, string> = {
  calories: "bg-amber-400/10 text-amber-400 border border-amber-400/30",
  protein:  "bg-cyan-400/10 text-cyan-400 border border-cyan-400/30",
  carbs:    "bg-lime-400/10 text-lime-400 border border-lime-400/30",
  fat:      "bg-amber-400/10 text-amber-400 border border-amber-400/30",
  duration: "bg-lime-400/10 text-lime-400 border border-lime-400/30",
  sets:     "bg-cyan-400/10 text-cyan-400 border border-cyan-400/30",
  reps:     "bg-cyan-400/10 text-cyan-400 border border-cyan-400/30",
};

function badgeStyle(label: string) {
  return BADGE_STYLES[label.toLowerCase()] ?? "bg-neutral-900 text-neutral-400 border border-neutral-800";
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
      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="Time"
            className="w-full sm:w-24 h-10 bg-neutral-900 border border-neutral-800 rounded-md px-3 text-sm font-mono text-neutral-400 focus:outline-none focus:border-cyan-400"
          />
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Description"
            autoFocus
            className="flex-1 h-10 bg-neutral-900 border border-neutral-800 rounded-md px-3 text-sm text-white focus:outline-none focus:border-cyan-400"
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
                className="w-28 h-10 bg-neutral-900 border border-neutral-800 rounded-md px-2 text-xs text-neutral-300 placeholder-neutral-500 focus:outline-none focus:border-cyan-400"
              />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 h-10 px-3 bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 rounded-md text-sm"
          >
            <IconCheck size={16} />
            Save
          </button>
          <button
            onClick={handleCancel}
            className="inline-flex items-center gap-1.5 h-10 px-3 border border-neutral-800 text-neutral-400 rounded-md text-sm"
          >
            <IconX size={16} />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 px-4 py-3 rounded-md">
      <button
        type="button"
        aria-label="Drag item"
        className="inline-flex items-center justify-center h-10 w-8 text-neutral-500 touch-none"
        {...(dragHandleProps?.attributes ?? {})}
        {...(dragHandleProps?.listeners ?? {})}
      >
        <IconGripVertical size={16} />
      </button>
      <span className="w-20 shrink-0 text-sm font-mono text-neutral-400">{entry.time}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-white">{entry.task}</span>
        {entry.meta && entry.meta.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {entry.meta.map((m) => (
              <span
                key={m.label}
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeStyle(m.label)}`}
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
          className="inline-flex items-center justify-center h-10 w-10 text-neutral-500"
        >
          <IconEdit size={18} />
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          title="Delete"
          className="inline-flex items-center justify-center h-10 w-10 text-neutral-500"
        >
          <IconTrash size={18} />
        </button>
      </div>
    </div>
  );
}
