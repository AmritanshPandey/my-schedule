"use client";

import { useState } from "react";
import PlanItem from "./PlanItem";
import { ScheduleEntry, MetaField } from "./ScheduleItem";
import { IconCheck, IconEdit, IconGripVertical, IconPlus, IconTarget, IconTrash, IconX } from "@tabler/icons-react";
import { Goal, SummaryConfig } from "@/lib/useScheduleDB";
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
  goals: Goal[];
  onUpdatePlan: (id: string, updates: { title: string; emoji: string; color: AccentColor; metaFields: string[] }) => void;
  onDeletePlan: (id: string) => void;
  onReorderItems: (activeId: string, overId: string) => void;
  onAdd: (entry: Omit<ScheduleEntry, "id">) => void;
  onEdit: (id: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (id: string) => void;
  onAddGoal: (goal: Omit<Goal, "id">) => void;
  onDeleteGoal: (goalId: string) => void;
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
  showDate,
  onEdit,
  onDelete,
}: {
  index: number;
  entry: ScheduleEntry;
  metaFields: string[];
  editMode: boolean;
  showDate: boolean;
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
        showDate={showDate}
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

function inferUnit(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("calorie")) return "kcal";
  if (key.includes("protein") || key.includes("carb") || key.includes("fat")) return "g";
  if (key.includes("duration") || key.includes("time")) return "min";
  if (key.includes("weight")) return "kg";
  if (key.includes("step")) return "steps";
  if (key.includes("water")) return "ml";
  return "";
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PlanCard({
  id,
  title,
  emoji,
  color,
  items,
  metaFields,
  summary,
  goals,
  onUpdatePlan,
  onDeletePlan,
  onReorderItems,
  onAdd,
  onEdit,
  onDelete,
  onAddGoal,
  onDeleteGoal,
  dragHandleProps,
}: PlanCardProps) {
  const [adding, setAdding] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [planEditMode, setPlanEditMode] = useState(false);
  const [dateFilter, setDateFilter] = useState<"today" | "all">("today");
  const [addingGoal, setAddingGoal] = useState(false);
  const [goalMetric, setGoalMetric] = useState(metaFields[0] ?? "");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDirection, setGoalDirection] = useState<"below" | "above">("below");
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
  const todayStr = todayISO();

  const filteredItems = dateFilter === "today"
    ? items.filter((item) => item.date === todayStr)
    : items;

  const totalItems = dateFilter === "today"
    ? items.filter((item) => item.date === todayStr)
    : items;

  const totals = summary?.map((s) => {
    const total = totalItems.reduce((acc, item) => {
      const m = item.meta?.find((x) => x.label.toLowerCase() === s.metaKey.toLowerCase());
      return acc + (m ? parseNumber(m.value) : 0);
    }, 0);
    return { ...s, total: Math.round(total) };
  });

  function getGoalCurrent(metric: string): number {
    return items
      .filter((item) => item.date === todayStr)
      .reduce((acc, item) => {
        const m = item.meta?.find((x) => x.label.toLowerCase() === metric.toLowerCase());
        return acc + parseNumber(m?.value ?? "0");
      }, 0);
  }

  function handleAdd() {
    if (!task.trim()) return;
    const meta: MetaField[] = metaFields
      .filter((f) => metaValues[f]?.trim())
      .map((f) => ({ label: f, value: metaValues[f].trim().slice(0, 20) }));

    onAdd({
      task: task.trim().slice(0, 50),
      note: note.trim().slice(0, 80) || undefined,
      meta: meta.length > 0 ? meta : undefined,
      date: todayStr,
    });

    setTask("");
    setNote("");
    setMetaValues({});
    setAdding(false);
  }

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

  function handleAddGoal() {
    const target = parseFloat(goalTarget);
    if (!goalMetric || isNaN(target) || target <= 0) return;
    onAddGoal({
      metric: goalMetric,
      target,
      direction: goalDirection,
      unit: inferUnit(goalMetric),
      startDate: todayStr,
    });
    setGoalTarget("");
    setGoalDirection("below");
    setGoalMetric(metaFields[0] ?? "");
    setAddingGoal(false);
  }

  function goalBarColor(direction: "below" | "above", pct: number): string {
    if (direction === "below") {
      if (pct >= 100) return "bg-rose-500";
      if (pct >= 80) return "bg-amber-400";
      return "bg-emerald-500";
    } else {
      if (pct >= 100) return "bg-emerald-500";
      if (pct >= 50) return "bg-cyan-500";
      return "bg-amber-400";
    }
  }

  function goalTextColor(direction: "below" | "above", pct: number): string {
    if (direction === "below") {
      if (pct >= 100) return "text-rose-600 dark:text-rose-400";
      if (pct >= 80) return "text-amber-600 dark:text-amber-400";
      return "text-emerald-600 dark:text-emerald-400";
    } else {
      if (pct >= 100) return "text-emerald-600 dark:text-emerald-400";
      if (pct >= 50) return "text-cyan-600 dark:text-cyan-400";
      return "text-amber-600 dark:text-amber-400";
    }
  }

  return (
    <div className={`overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-neutral-900 dark:shadow-black/25 border-neutral-200/80 dark:border-white/[0.08] ${accent.cardAccent}`}>
      {/* ── Header ── */}
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
                {items.length} {items.length === 1 ? "entry" : "entries"} total
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
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 transition-all duration-150 ${sel ? `${ic.solid} shadow-sm scale-[1.04]` : `${ic.tint} ${ic.text} hover:scale-[1.04]`}`}
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

        {/* Date filter */}
        <div className="mt-3 flex items-center gap-1.5">
          {(["today", "all"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setDateFilter(f)}
              className={`h-6 rounded-md px-2.5 text-[11px] font-semibold transition-all duration-150 ${
                dateFilter === f
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
              }`}
            >
              {f === "today" ? "Today" : "History"}
            </button>
          ))}
        </div>

        {/* Totals */}
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

      {/* ── Body ── */}
      <div className="p-4 space-y-4">
        {/* Goals section */}
        {(goals.length > 0 || (metaFields.length > 0 && !addingGoal)) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <IconTarget size={13} className="text-neutral-400 dark:text-neutral-500" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                  Today&apos;s Goals
                </p>
              </div>
              {metaFields.length > 0 && !addingGoal && (
                <button
                  type="button"
                  onClick={() => { setAddingGoal(true); setGoalMetric(metaFields[0] ?? ""); }}
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/[0.07] dark:hover:text-neutral-200 transition-colors"
                >
                  <IconPlus size={11} />
                  Add goal
                </button>
              )}
            </div>

            {goals.length === 0 && !addingGoal && (
              <p className="text-xs text-neutral-400 dark:text-neutral-500 pl-0.5">
                No goals set. Add one to track your daily targets.
              </p>
            )}

            {goals.map((goal) => {
              const current = getGoalCurrent(goal.metric);
              const pct = Math.min((current / goal.target) * 100, 100);
              const barColor = goalBarColor(goal.direction, pct);
              const textColor = goalTextColor(goal.direction, pct);
              const label = goal.direction === "below" ? "limit" : "target";
              return (
                <div key={goal.id} className="rounded-xl border border-neutral-100 bg-neutral-50/80 px-3 py-2.5 dark:border-white/[0.07] dark:bg-white/[0.03]">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                        {goal.metric}
                      </span>
                      <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
                        {goal.direction === "below" ? "↓ stay under" : "↑ reach"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold tabular-nums ${textColor}`}>
                        {Math.round(current).toLocaleString()} / {goal.target.toLocaleString()}
                        {goal.unit ? ` ${goal.unit}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteGoal(goal.id)}
                        className="h-5 w-5 flex items-center justify-center rounded text-neutral-300 hover:text-rose-500 dark:text-neutral-700 dark:hover:text-rose-400 transition-colors"
                      >
                        <IconX size={11} />
                      </button>
                    </div>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-600">0</span>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-600">
                      {goal.target.toLocaleString()} {goal.unit} {label}
                    </span>
                  </div>
                </div>
              );
            })}

            {addingGoal && (
              <div className="space-y-3 rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <p className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">New daily goal</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">Metric</p>
                    <select
                      value={goalMetric}
                      onChange={(e) => setGoalMetric(e.target.value)}
                      className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:focus:border-white/20"
                    >
                      {metaFields.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">Target</p>
                    <input
                      type="number"
                      value={goalTarget}
                      onChange={(e) => setGoalTarget(e.target.value)}
                      placeholder="e.g. 2000"
                      min="1"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddGoal(); if (e.key === "Escape") setAddingGoal(false); }}
                      className="h-9 w-full rounded-lg border border-neutral-200 bg-white px-2.5 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-900 dark:text-white dark:focus:border-white/20"
                    />
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">Direction</p>
                  <div className="flex rounded-lg border border-neutral-200 dark:border-white/10 overflow-hidden">
                    {(["below", "above"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setGoalDirection(d)}
                        className={`flex-1 h-8 text-xs font-medium transition-colors ${
                          goalDirection === d
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                            : "text-neutral-500 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-white/5"
                        }`}
                      >
                        {d === "below" ? "↓ Stay under" : "↑ Reach above"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddGoal}
                    className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-white transition-colors hover:opacity-90 ${accent.iconSolid}`}
                  >
                    <IconCheck size={13} />
                    Set Goal
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingGoal(false)}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-neutral-200 px-3 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
                  >
                    <IconX size={13} />
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Items list */}
        {filteredItems.length === 0 && !adding && (
          <div className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400 dark:border-white/10 dark:text-neutral-500">
            {dateFilter === "today"
              ? "Nothing logged today. Add an entry or switch to History."
              : "No entries yet. Add the first item to turn this plan into something useful."}
          </div>
        )}

        {filteredItems.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setPlanEditMode((prev) => !prev)}
              className={`h-7 rounded-md px-2.5 text-xs font-medium transition-all duration-200 ${
                planEditMode
                  ? "text-cyan-600 dark:text-cyan-300"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {planEditMode ? "Done" : "Manage"}
            </button>
          </div>
        )}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={filteredItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            {filteredItems.map((item, i) => (
              <SortablePlanItem
                key={item.id}
                index={i + 1}
                entry={item}
                metaFields={metaFields}
                editMode={planEditMode}
                showDate={dateFilter === "all"}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* ── Footer: add entry ── */}
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
                Log Entry
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
            Log Entry
          </button>
        )}
      </div>
    </div>
  );
}

// helper re-exported so PlanCard callers can use it
export { formatDate };
