"use client";

import { useState } from "react";
import PlanItem from "./PlanItem";
import { ScheduleEntry, MetaField } from "./ScheduleItem";
import { IconCheck, IconEdit, IconGripVertical, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { SummaryConfig } from "@/lib/useScheduleDB";
import { SECTION_ICONS } from "@/components/SectionIcons";
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
  entry,
  metaFields,
  onEdit,
  onDelete,
}: {
  entry: ScheduleEntry;
  metaFields: string[];
  onEdit: (id: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef } = useSortable({ id: entry.id });

  return (
    <div ref={setNodeRef}>
      <PlanItem
        entry={entry}
        metaFields={metaFields}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={{
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: (listeners ?? {}) as Record<string, unknown>,
        }}
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
  const [time, setTime] = useState("");
  const [task, setTask] = useState("");
  const [metaValues, setMetaValues] = useState<Record<string, string>>({});
  const [editTitle, setEditTitle] = useState(title);
  const [editIconName, setEditIconName] = useState(emoji);
  const [editColor, setEditColor] = useState(resolveAccentColor(color, emoji));
  const [editMetaFields, setEditMetaFields] = useState(metaFields.join(", "));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const accent = accentStyles(color);

  function handleAdd() {
    if (!time.trim() || !task.trim()) return;

    const meta: MetaField[] = metaFields
      .filter((f) => metaValues[f]?.trim())
      .map((f) => ({ label: f, value: metaValues[f].trim() }));

    onAdd({
      time: time.trim(),
      task: task.trim(),
      meta: meta.length > 0 ? meta : undefined,
    });

    setTime("");
    setTask("");
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
    const parsedMetaFields = editMetaFields
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
    onUpdatePlan(id, {
      title: nextTitle,
      emoji: editIconName,
      color: editColor,
      metaFields: parsedMetaFields,
    });
    setEditingPlan(false);
  }

  function handleCancelPlanEdit() {
    setEditTitle(title);
    setEditIconName(emoji);
    setEditColor(resolveAccentColor(color, emoji));
    setEditMetaFields(metaFields.join(", "));
    setEditingPlan(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorderItems(String(active.id), String(over.id));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-white">
              {(() => {
                const ic = SECTION_ICONS.find((i) => i.name === emoji);
                const PlanIcon = (ic ?? SECTION_ICONS[0]).icon;
                return <PlanIcon size={20} strokeWidth={1.5} className={accent.text} />;
              })()}
              {title}
              <span className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 dark:border-white/10 dark:bg-white/5 dark:text-neutral-400">
                {items.length}
              </span>
            </h2>
            <div className="flex items-center">
              <button
                type="button"
                aria-label="Drag plan"
                className="inline-flex h-9 w-8 touch-none items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-white/5 dark:hover:text-neutral-300"
                {...(dragHandleProps?.attributes ?? {})}
                {...(dragHandleProps?.listeners ?? {})}
              >
                <IconGripVertical size={16} />
              </button>
              <button
                onClick={() => {
                  setEditTitle(title);
                  setEditIconName(emoji);
                  setEditColor(resolveAccentColor(color, emoji));
                  setEditMetaFields(metaFields.join(", "));
                  setEditingPlan(true);
                }}
                className={`inline-flex h-9 w-9 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-white/5 dark:hover:text-neutral-300 ${accent.action}`}
                title="Edit plan"
              >
                <IconEdit size={18} />
              </button>
              <button
                onClick={() => onDeletePlan(id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-neutral-500 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                title="Delete plan"
              >
                <IconTrash size={18} />
              </button>
            </div>
          </div>

          {editingPlan && (
            <div className="mt-3 space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-950">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Plan name"
                className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:focus:border-white/20"
              />
              <div className="grid grid-cols-5 gap-3">
                {SECTION_ICONS.map(({ name, label, icon: Icon }) => (
                  <button
                    key={name}
                    type="button"
                    title={label}
                    onClick={() => {
                      setEditIconName(name);
                      setEditColor(colorFromIcon(name));
                    }}
                    className={`h-10 w-10 flex items-center justify-center rounded-md border transition-colors ${
                      editIconName === name
                        ? `${accentStyles(editColor).border} ${accentStyles(editColor).tint} ${accentStyles(editColor).text}`
                        : "border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-neutral-800 dark:text-neutral-500 dark:hover:border-neutral-600"
                    }`}
                  >
                    <Icon size={20} strokeWidth={1.5} />
                  </button>
                ))}
              </div>
              <input
                value={editMetaFields}
                onChange={(e) => setEditMetaFields(e.target.value)}
                placeholder="Meta fields (comma separated): Calories, Protein"
                className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:focus:border-white/20"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSavePlan}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  <IconCheck size={16} />
                  Save
                </button>
                <button
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
              <div className="flex gap-2 flex-wrap mt-3">
                {totals.map((t) => (
                  <div
                    key={t.label}
                    className={`text-xs px-3 py-1 rounded-full border ${t.colorClass ?? accent.badge}`}
                  >
                    <span className="font-semibold text-neutral-900 dark:text-white">
                      {t.total.toLocaleString()}
                    </span>
                    <span className="text-neutral-500 ml-1">{t.unit}</span>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="p-4 space-y-4">
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400 dark:border-white/10 dark:text-neutral-500">
              No entries yet. Add the first item to turn this plan into something useful.
            </div>
          )}

          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => (
                <SortablePlanItem
                  key={item.id}
                  entry={item}
                  metaFields={metaFields}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="px-4 pb-4">
          {adding ? (
	            <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-white/10 dark:bg-neutral-950">
              
              <div className="flex flex-col gap-2">
                <input
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="Time"
                  autoFocus
	                  className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm font-mono text-neutral-600 outline-none transition-colors focus:border-neutral-400 sm:w-24 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:focus:border-white/20"
                />

                <input
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Description"
	                  className="h-10 flex-1 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:focus:border-white/20"
                />
              </div>

              {metaFields.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {metaFields.map((field) => (
                    <div key={field} className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500 pointer-events-none">
                        {field}
                      </span>
                      <input
                        value={metaValues[field] ?? ""}
                        onChange={(e) =>
                          setMetaValues((prev) => ({
                            ...prev,
                            [field]: e.target.value,
                          }))
                        }
                        placeholder="optional"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAdd();
                          if (e.key === "Escape") setAdding(false);
                        }}
	                        className="h-10 w-full rounded-md border border-neutral-200 bg-white pl-20 pr-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:focus:border-white/20"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setAdding(false);
                    setTime("");
                    setTask("");
                    setMetaValues({});
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-neutral-200 px-3 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
                >
                  <IconX size={15} />
                  Cancel
                </button>

                <button
                  onClick={handleAdd}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neutral-900 px-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  <IconPlus size={16} />
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
	              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-dashed border-neutral-200 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              <IconPlus size={16} />
              Add Entry
            </button>
          )}
        </div>
    </div>
  );
}
