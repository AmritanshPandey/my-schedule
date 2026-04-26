"use client";

import { useState } from "react";
import ScheduleItem, { ScheduleEntry } from "./ScheduleItem";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { IconCheck, IconEdit, IconPlus, IconTrash, IconX } from "@tabler/icons-react";

interface SectionCardProps {
  title: string;
  iconName: string;
  items: ScheduleEntry[];
  onAdd: (entry: Omit<ScheduleEntry, "id">) => void;
  onEdit: (id: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (id: string) => void;
  onEditSection?: (updated: { title: string; iconName: string }) => void;
  onDeleteSection?: () => void;
}

export default function SectionCard({ title, iconName, items, onAdd, onEdit, onDelete, onEditSection, onDeleteSection }: SectionCardProps) {
  const entry = SECTION_ICONS.find((i: { name: string }) => i.name === iconName);
  const IconComp = (entry ?? SECTION_ICONS[0]).icon;
  const [adding, setAdding] = useState(false);
  const [time, setTime] = useState("");
  const [task, setTask] = useState("");
  const [editingSection, setEditingSection] = useState(false);
  const [editTitle, setEditTitle] = useState(title);
  const [editIconName, setEditIconName] = useState(iconName);

  function handleAdd() {
    if (!time.trim() || !task.trim()) return;
    onAdd({ time: time.trim(), task: task.trim() });
    setTime("");
    setTask("");
    setAdding(false);
  }

  function handleStartEditSection() {
    setEditTitle(title);
    setEditIconName(iconName);
    setEditingSection(true);
  }

  function handleSaveSection() {
    const nextTitle = editTitle.trim();
    if (!nextTitle || !onEditSection) return;
    onEditSection({ title: nextTitle, iconName: editIconName });
    setEditingSection(false);
  }

  function handleCancelSectionEdit() {
    setEditTitle(title);
    setEditIconName(iconName);
    setEditingSection(false);
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900">
      <div className="px-4 py-4 border-b border-neutral-800 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
          <IconComp size={20} className="text-cyan-400" />
          {title}
        </h2>
        <div className="flex items-center gap-1">
          {onEditSection && !editingSection && (
            <button
              onClick={handleStartEditSection}
              className="inline-flex items-center justify-center h-10 w-10 rounded-md text-neutral-500 hover:text-cyan-400"
              title="Edit section"
            >
              <IconEdit size={20} />
            </button>
          )}
          {onDeleteSection && (
            <button
              onClick={onDeleteSection}
              className="inline-flex items-center justify-center h-10 w-10 rounded-md text-neutral-500 hover:text-amber-400"
              title="Delete section"
            >
              <IconTrash size={20} />
            </button>
          )}
        </div>
      </div>
      {editingSection && onEditSection && (
        <div className="px-4 py-3 border-b border-neutral-800 space-y-3">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Section title"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveSection();
              if (e.key === "Escape") handleCancelSectionEdit();
            }}
            className="w-full h-10 border border-neutral-800 bg-neutral-900 rounded-md px-3 text-sm text-white focus:outline-none focus:border-cyan-400"
          />
          <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2">
            {SECTION_ICONS.map(({ name, label, icon: Icon }) => (
              <button
                key={name}
                type="button"
                title={label}
                onClick={() => setEditIconName(name)}
                className={`aspect-square h-10 flex items-center justify-center rounded-md border ${
                  editIconName === name
                    ? "bg-cyan-400/10 text-cyan-400 border-cyan-400/30"
                    : "bg-neutral-900 text-neutral-500 border-neutral-800"
                }`}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSaveSection}
              className="inline-flex items-center gap-1.5 h-10 px-3 bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 text-sm font-medium rounded-md"
            >
              <IconCheck size={16} />
              Save
            </button>
            <button
              onClick={handleCancelSectionEdit}
              className="inline-flex items-center gap-1.5 h-10 px-3 border border-neutral-800 text-neutral-400 text-sm font-medium rounded-md"
            >
              <IconX size={16} />
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="py-1">
        {items.map((item) => (
          <ScheduleItem key={item.id} entry={item} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
      <div className="px-4 pb-4">
        {adding ? (
          <div className="space-y-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="Time"
              autoFocus
              className="w-full sm:w-24 sm:shrink-0 h-10 border border-neutral-800 bg-neutral-900 rounded-md px-3 text-sm font-mono text-neutral-400 focus:outline-none focus:border-cyan-400"
            />
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Task description"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
                if (e.key === "Escape") setAdding(false);
              }}
              className="flex-1 h-10 border border-neutral-800 bg-neutral-900 rounded-md px-3 text-sm text-white focus:outline-none focus:border-cyan-400"
            />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                className="inline-flex items-center gap-1.5 h-10 px-3 bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 rounded-md text-sm"
              >
                <IconPlus size={16} />
                Add
              </button>
              <button
                onClick={() => { setAdding(false); setTime(""); setTask(""); }}
                className="inline-flex items-center gap-1.5 h-10 px-3 border border-neutral-800 text-neutral-400 rounded-md text-sm"
              >
                <IconX size={16} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 h-10 mt-1 text-sm text-neutral-400"
          >
            <IconPlus size={16} />
            Add item
          </button>
        )}
      </div>
    </div>
  );
}
