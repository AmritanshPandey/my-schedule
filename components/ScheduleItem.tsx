"use client";

import { useState } from "react";
import { IconCheck, IconEdit, IconTrash, IconX } from "@tabler/icons-react";

export interface MetaField {
  label: string;
  value: string;
}

export interface ScheduleEntry {
  id: string;
  time?: string;   // kept for backwards-compat, not used in new UI
  task: string;
  note?: string;
  meta?: MetaField[];
  date?: string;   // ISO "YYYY-MM-DD", set when entry is logged
}

interface ScheduleItemProps {
  entry: ScheduleEntry;
  onEdit: (id: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (id: string) => void;
}

export default function ScheduleItem({ entry, onEdit, onDelete }: ScheduleItemProps) {
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(entry.time ?? "");
  const [task, setTask] = useState(entry.task);

  function handleSave() {
    if (!task.trim()) return;
    onEdit(entry.id, { time: time.trim() || undefined, task: task.trim() });
    setEditing(false);
  }

  function handleCancel() {
    setTime(entry.time ?? "");
    setTask(entry.task);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-3 px-4 py-4">
        <div className="flex gap-2 items-center">
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="Time"
            className="w-24 shrink-0 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-sm font-mono text-neutral-700 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
          />
          <input
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Task"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
            className="flex-1 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 h-10 px-3 bg-violet-500/10 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/25 dark:border-violet-400/35 rounded-md text-sm"
          >
            <IconCheck size={16} />
            Save
          </button>
          <button
            onClick={handleCancel}
            className="inline-flex items-center gap-1.5 h-10 px-3 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 rounded-md text-sm"
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
      <span className="w-20 shrink-0 text-sm font-mono text-neutral-400">
        {entry.time}
      </span>
      <span className="flex-1 text-sm text-neutral-900 dark:text-white">{entry.task}</span>
      <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
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
