"use client";

import { useState } from "react";
import PlanItem from "./PlanItem";
import { ScheduleEntry, MetaField } from "./ScheduleItem";
import { IconCheck, IconEdit, IconGripVertical, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { SummaryConfig } from "@/lib/useScheduleDB";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import type { AccentColor } from "@/lib/colorSystem";
import { accentStyles, colorFromIcon, resolveAccentColor } from "@/lib/colorSystem";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";

interface PlanCardProps {
  id: string;
  title: string;
  emoji: string;
  color: string;
  items: ScheduleEntry[];
  metaFields: string[];
  summary?: SummaryConfig[];
  onUpdatePlan: (id: string, updates: { title: string; emoji: string; color: AccentColor; metaFields: string[] }) => void;
  onDeletePlan: (id: string) => void;
  onReorderItems: (activeId: string, overId: string) => void;
  onAdd: (entry: Omit<ScheduleEntry, "id">) => void;
  onEdit: (id: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
  };
}

function SortablePlanItem({
  index,
  entry,
  metaFields,
  editMode,
  onEdit,
  onDelete,
}: {
  index: number;
  entry: ScheduleEntry;
  metaFields: string[];
  editMode: boolean;
  onEdit: (id: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef } = useSortable({ id: entry.id });

  return (
    <div ref={setNodeRef}>
      <PlanItem
        index={index}
        entry={entry}
        metaFields={metaFields}
        editMode={editMode}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={editMode ? {
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: (listeners ?? {}) as Record<string, unknown>,
        } : undefined}
      />
    </div>
  );
}

function parseNumber(val: string): number {
  const m = val.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

export default function PlanCard({
  id,
  title,
  emoji,
  color,
  items,
  metaFields,
  summary,
  onUpdatePlan,
  onDeletePlan,
  onReorderItems,
  onAdd,
  onEdit,
  onDelete,
  dragHandleProps,
}: PlanCardProps) {
  const [adding, setAdding] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [planEditMode, setPlanEditMode] = useState(false);
  const [task, setTask] = useState("");
  const [note, setNote] = useState("");
  const [metaValues, setMetaValues] = useState<Record<string, string>>({});
  const [editTitle, setEditTitle] = useState(title);
  const [editIconName, setEditIconName] = useState(emoji);
  const [editColor, setEditColor] = useState(resolveAccentColor(color, emoji));
  const [editMetaFields, setEditMetaFields] = useState<string[]>([...metaFields]);
  const [editMetaInput, setEditMetaInput] = useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const accent = accentStyles(color);

  function handleAdd() {
    if (!task.trim()) return;

    const meta: MetaField[] = metaFields
      .filter((f) => metaValues[f]?.trim())
      .map((f) => ({ label: f, value: metaValues[f].trim().slice(0, 20) }));

    onAdd({
      task: task.trim().slice(0, 50),
      note: note.trim().slice(0, 80) || undefined,
      meta: meta.length > 0 ? meta : undefined,
    });

    setTask("");
    setNote("");
    setMetaValues({});
    setAdding(false);
  }

  const totals = summary?.map((s) => {
    const total = items.reduce((acc, item) => {
      const m = item.meta?.find(
        (x) => x.label.toLowerCase() === s.metaKey.toLowerCase()
      );
      return acc + (m ? parseNumber(m.value) : 0);
    }, 0);

    return { ...s, total: Math.round(total) };
  });

  function handleSavePlan() {
    const nextTitle = editTitle.trim();
    if (!nextTitle) return;
    onUpdatePlan(id, {
      title: nextTitle,
      emoji: editIconName,
      color: editColor,
      metaFields: editMetaFields.filter(Boolean),
    });
    setEditMetaInput("");
    setEditingPlan(false);
  }

  function handleCancelPlanEdit() {
    setEditTitle(title);
    setEditIconName(emoji);
    setEditColor(resolveAccentColor(color, emoji));
    setEditMetaFields([...metaFields]);
    setEditMetaInput("");
    setEditingPlan(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorderItems(String(active.id), String(over.id));
  }

  return (
    <div className={`overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900 dark:shadow-black/25 border-neutral-200/80 dark:border-white/[0.08] ${accent.cardAccent}`}>
      <div className="border-b border-neutral-100 dark:border-white/[0.07] px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {(() => {
              const ic = SECTION_ICONS.find((i) => i.name === emoji);
              const PlanIcon = (ic ?? SECTION_ICONS[0]).icon;
              return (
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accent.iconSolid}`}>
                  <PlanIcon size={17} strokeWidth={1.6} />
                </span>
              );
            })()}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white leading-tight truncate">
                {title}
              </h2>
              <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                {items.length} {items.length === 1 ? "item" : "items"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              aria-label="Drag plan"
              className="inline-flex h-9 w-8 touch-none items-center justify-center rounded text-neutral-300 transition-colors hover:text-neutral-500 dark:text-neutral-600 dark:hover:text-neutral-400"
              {...(dragHandleProps?.attributes ?? {})}
              {...(dragHandleProps?.listeners ?? {})}
            >
              <IconGripVertical size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditTitle(title);
                setEditIconName(emoji);
                setEditColor(resolveAccentColor(color, emoji));
                setEditMetaFields([...metaFields]);
                setEditingPlan(true);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-white/5 dark:hover:text-neutral-300"
              title="Edit plan"
            >
              <IconEdit size={16} />
            </button>
            <button
              type="button"
              onClick={() => onDeletePlan(id)}
              className="inline-flex h-9 w-9 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
              title="Delete plan"
            >
              <IconTrash size={16} />
            </button>
          </div>
        </div>

        {editingPlan && (
          <div className="mt-3 space-y-3 rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-4 dark:border-white/[0.08] dark:bg-neutral-950">
            <input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Plan name"
              className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:focus:border-white/20"
            />
            <div className="grid grid-cols-5 gap-1.5">
              {SECTION_ICONS.map(({ name, label, icon: Icon }) => {
                const ic = getIconPickerStyle(name);
                const sel = editIconName === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={label}
                    onClick={() => { setEditIconName(name); setEditColor(colorFromIcon(name)); }}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition-all duration-150 ${sel ? `${ic.solid} shadow-sm scale-[1.04]` : `${ic.tint} ${ic.text} hover:scale-[1.04]`
                      }`}
                  >
                    <Icon size={17} strokeWidth={1.5} />
                    <span className={`text-[9px] font-semibold leading-none ${sel ? "text-white/80" : ""}`}>{label}</span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Metrics to track</p>
              {editMetaFields.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editMetaFields.map((field) => (
                    <span key={field} className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:border-white/10 dark:bg-white/10 dark:text-neutral-300">
                      {field}
                      <button
                        type="button"
                        onClick={() => setEditMetaFields((prev) => prev.filter((f) => f !== field))}
                        className="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-500 dark:hover:text-rose-400"
                      >
                        <IconX size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  value={editMetaInput}
                  onChange={(e) => setEditMetaInput(e.target.value)}
                  placeholder="Add metric (e.g. Calories, Sets…)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = editMetaInput.trim();
                      if (val && !editMetaFields.includes(val)) {
                        setEditMetaFields((prev) => [...prev, val]);
                        setEditMetaInput("");
                      }
                    }
                  }}
                  className="h-9 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20"
                />
                <button
                  type="button"
                  onClick={() => {
                    const val = editMetaInput.trim();
                    if (val && !editMetaFields.includes(val)) {
                      setEditMetaFields((prev) => [...prev, val]);
                      setEditMetaInput("");
                    }
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <IconPlus size={15} />
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSavePlan}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
              >
                <IconCheck size={16} />
                Save
              </button>
              <button
                type="button"
                onClick={handleCancelPlanEdit}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
              >
                <IconX size={16} />
                Cancel
              </button>
            </div>
          </div>
        )}

        {totals && totals.length > 0 && (
          <div className="mt-3 flex items-center gap-4 flex-wrap">
            {totals.map((t, i) => (
              <div key={t.label} className="flex items-baseline gap-1.5">
                {i > 0 && <span className="h-3 w-px shrink-0 bg-neutral-200 dark:bg-white/10 self-center" />}
                <span className={`text-sm font-bold ${accent.text}`}>
                  {t.total.toLocaleString()}
                </span>
                <span className="text-xs text-neutral-400 dark:text-neutral-500">
                  {t.unit || t.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {items.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400 dark:border-white/10 dark:text-neutral-500">
            No entries yet. Add the first item to turn this plan into something useful.
          </div>
        )}

        {items.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPlanEditMode((prev) => !prev)}
              className={`h-7 rounded-md px-2.5 text-xs font-medium transition-all duration-200
              ${planEditMode
                  ? "text-cyan-600 dark:text-cyan-300"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
            >
              {planEditMode ? "Done" : "Manage"}
            </button>
          </div>
        )}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            {items.map((item, i) => (
              <SortablePlanItem
                key={item.id}
                index={i + 1}
                entry={item}
                metaFields={metaFields}
                editMode={planEditMode}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="px-4 pb-4">
        {adding ? (
          <div className="space-y-3 rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div>
              <input
                value={task}
                onChange={(e) => setTask(e.target.value.slice(0, 50))}
                placeholder="Item name"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setTask(""); setNote(""); setMetaValues({}); } }}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20"
              />
              {task.length >= 40 && (
                <p className={`mt-1 text-right text-[10px] ${task.length >= 50 ? "text-rose-500" : "text-neutral-400"}`}>{task.length}/50</p>
              )}
            </div>

            {metaFields.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {metaFields.map((field) => (
                  <div key={field} className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400 dark:text-neutral-500 pointer-events-none">
                      {field}
                    </span>
                    <input
                      value={metaValues[field] ?? ""}
                      onChange={(e) => setMetaValues((prev) => ({ ...prev, [field]: e.target.value.slice(0, 20) }))}
                      placeholder="—"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setAdding(false); }}
                      className="h-9 w-full rounded-lg border border-neutral-200 bg-white pl-20 pr-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20"
                    />
                  </div>
                ))}
              </div>
            )}

            <div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 80))}
                placeholder="Note (optional)"
                rows={2}
                onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setTask(""); setNote(""); setMetaValues({}); } }}
                className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20"
              />
              <p className={`mt-0.5 text-right text-[10px] ${note.length >= 70 ? note.length >= 80 ? "text-rose-500" : "text-amber-500" : "text-neutral-400"}`}>
                {note.length}/80
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setAdding(false); setTask(""); setNote(""); setMetaValues({}); }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
              >
                <IconX size={15} />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white transition-colors hover:opacity-90 ${accent.iconSolid}`}
              >
                <IconPlus size={15} />
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            <IconPlus size={16} />
            Add Entry
          </button>
        )}
      </div>
    </div>
  );
}
