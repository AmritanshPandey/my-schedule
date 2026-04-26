"use client";

import { useState } from "react";
import PlanItem from "./PlanItem";
import { ScheduleEntry, MetaField } from "./ScheduleItem";
import { IconCheck, IconEdit, IconGripVertical, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { SummaryConfig } from "@/lib/useScheduleDB";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";

interface PlanCardProps {
  id: string;
  title: string;
  emoji: string;
  items: ScheduleEntry[];
  metaFields: string[];
  summary?: SummaryConfig[];
  onUpdatePlan: (id: string, updates: { title: string; emoji: string; metaFields: string[] }) => void;
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
  const [editEmoji, setEditEmoji] = useState(emoji);
  const [editMetaFields, setEditMetaFields] = useState(metaFields.join(", "));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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
      emoji: editEmoji.trim() || "🧠",
      metaFields: parsedMetaFields,
    });
    setEditingPlan(false);
  }

  function handleCancelPlanEdit() {
    setEditTitle(title);
    setEditEmoji(emoji);
    setEditMetaFields(metaFields.join(", "));
    setEditingPlan(false);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorderItems(String(active.id), String(over.id));
  }

  return (
    <div className="rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900">
      <div className="px-4 py-4 border-b border-neutral-800">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium tracking-wide text-white flex items-center gap-2">
              <span className="text-lg leading-none">{emoji}</span>
              {title}
              <span className="text-[11px] text-neutral-500 bg-neutral-900 border border-neutral-800 rounded-full px-2 py-0.5">
                {items.length}
              </span>
            </h2>
            <div className="flex items-center">
              <button
                type="button"
                aria-label="Drag plan"
                className="inline-flex items-center justify-center h-10 w-8 text-neutral-500 touch-none"
                {...(dragHandleProps?.attributes ?? {})}
                {...(dragHandleProps?.listeners ?? {})}
              >
                <IconGripVertical size={16} />
              </button>
              <button
                onClick={() => {
                  setEditTitle(title);
                  setEditEmoji(emoji);
                  setEditMetaFields(metaFields.join(", "));
                  setEditingPlan(true);
                }}
                className="inline-flex items-center justify-center h-10 w-10 text-neutral-500 hover:text-cyan-400"
                title="Edit plan"
              >
                <IconEdit size={18} />
              </button>
              <button
                onClick={() => onDeletePlan(id)}
                className="inline-flex items-center justify-center h-10 w-10 text-neutral-500 hover:text-amber-400"
                title="Delete plan"
              >
                <IconTrash size={18} />
              </button>
            </div>
          </div>

          {editingPlan && (
            <div className="mt-3 space-y-3 rounded-lg border border-neutral-800 p-3">
              <div className="flex gap-2">
                <input
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  maxLength={4}
                  placeholder="🧠"
                  className="h-10 w-14 rounded-md border border-neutral-800 bg-neutral-900 px-2 text-center text-white focus:outline-none focus:border-cyan-400"
                />
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Plan name"
                  className="h-10 flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <input
                value={editMetaFields}
                onChange={(e) => setEditMetaFields(e.target.value)}
                placeholder="Meta fields (comma separated): Calories, Protein"
                className="h-10 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-300 focus:outline-none focus:border-cyan-400"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSavePlan}
                  className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 text-sm"
                >
                  <IconCheck size={16} />
                  Save
                </button>
                <button
                  onClick={handleCancelPlanEdit}
                  className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md border border-neutral-800 text-neutral-400 text-sm"
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
                    className={`text-xs px-3 py-1 rounded-full border ${t.colorClass ?? "bg-neutral-900 text-neutral-400 border-neutral-800"}`}
                  >
                    <span className="font-semibold text-white">
                      {t.total.toLocaleString()}
                    </span>
                    <span className="text-neutral-500 ml-1">{t.unit}</span>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="p-4 space-y-3">
          {items.length === 0 && (
            <p className="text-center text-sm text-neutral-500 py-5">
              Start adding your plan.
            </p>
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
            <div className="rounded-lg border border-neutral-800 p-4 space-y-3">
              
              <div className="flex flex-col gap-2">
                <input
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="Time"
                  autoFocus
                  className="h-10 w-full sm:w-24 border border-neutral-800 rounded-md px-3 text-sm font-mono text-neutral-400 bg-neutral-900 focus:outline-none focus:border-cyan-400"
                />

                <input
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Description"
                  className="h-10 flex-1 border border-neutral-800 rounded-md px-3 text-sm text-white bg-neutral-900 focus:outline-none focus:border-cyan-400"
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
                        className="w-full h-10 border border-neutral-800 rounded-md pl-20 pr-3 text-sm text-white bg-neutral-900 focus:outline-none focus:border-cyan-400"
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
                  className="inline-flex items-center gap-1.5 h-10 px-3 border border-neutral-800 text-neutral-400 rounded-md text-sm"
                >
                  <IconX size={16} />
                  Cancel
                </button>

                <button
                  onClick={handleAdd}
                  className="inline-flex items-center gap-1.5 h-10 px-3 bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 rounded-md text-sm"
                >
                  <IconPlus size={16} />
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full inline-flex items-center justify-center gap-2 h-10 text-sm text-neutral-400 border border-dashed border-neutral-800 rounded-md"
            >
              <IconPlus size={16} />
              Add item
            </button>
          )}
        </div>
    </div>
  );
}