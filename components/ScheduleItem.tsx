"use client";

import { useState } from "react";
import { IconCheck, IconEdit, IconPlus, IconTrash, IconX } from "@tabler/icons-react";

export interface MetaField {
  label: string;
  value: string;
}

export interface ScheduleEntry {
  id: string;
  time: string;
  task: string;
  meta?: MetaField[];
}

interface ScheduleItemProps {
  entry: ScheduleEntry;
  onEdit: (id: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (id: string) => void;
}

export default function ScheduleItem({ entry, onEdit, onDelete }: ScheduleItemProps) {
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(entry.time);
  const [task, setTask] = useState(entry.task);

  function handleSave() {
    if (!time.trim() || !task.trim()) return;
    onEdit(entry.id, { time: time.trim(), task: task.trim() });
    setEditing(false);
  }

  function handleCancel() {
    setTime(entry.time);
    setTask(entry.task);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="Time"
          className="w-full sm:w-24 sm:shrink-0 h-10 border border-neutral-800 bg-neutral-900 rounded-md px-3 text-sm font-mono text-neutral-400 focus:outline-none focus:border-cyan-400"
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
          className="flex-1 h-10 border border-neutral-800 bg-neutral-900 rounded-md px-3 text-sm text-white focus:outline-none focus:border-cyan-400"
        />
        </div>
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
      <span className="w-20 shrink-0 text-sm font-mono text-neutral-400">
        {entry.time}
      </span>
      <span className="flex-1 text-sm text-white">{entry.task}</span>
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
