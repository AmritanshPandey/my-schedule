"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import PlanCard from "@/components/PlanCard";
import Tabs from "@/components/Tabs";
import ThemeToggle from "@/components/ThemeToggle";
import { ScheduleEntry } from "@/components/ScheduleItem";
import { useScheduleDB, DAYS, DAY_LABELS, DayKey, Plan, SummaryConfig, Task } from "@/lib/useScheduleDB";
import type { AccentColor } from "@/lib/colorSystem";
import { accentStyles, colorFromIcon, resolveAccentColor, timelineCardStyles } from "@/lib/colorSystem";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { IconActivity, IconCheck, IconChecklist, IconEdit, IconGripVertical, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";

function SortablePlanCard({
  plan,
  onUpdatePlan,
  onDeletePlan,
  onReorderItems,
  onAdd,
  onEdit,
  onDelete,
}: {
  plan: Plan;
  onUpdatePlan: (planId: string, updates: { title: string; emoji: string; color: AccentColor; metaFields: string[] }) => void;
  onDeletePlan: (planId: string) => void;
  onReorderItems: (planId: string, activeId: string, overId: string) => void;
  onAdd: (entry: Omit<ScheduleEntry, "id">) => void;
  onEdit: (itemId: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (itemId: string) => void;
}) {
  const { attributes, listeners, setNodeRef } = useSortable({ id: plan.id });

  return (
    <div ref={setNodeRef}>
      <PlanCard
        id={plan.id}
        title={plan.title}
        emoji={plan.emoji}
        color={plan.color}
        items={plan.items}
        metaFields={plan.metaFields ?? []}
        summary={plan.summary}
        onUpdatePlan={onUpdatePlan}
        onDeletePlan={onDeletePlan}
        onReorderItems={(activeId, overId) => onReorderItems(plan.id, activeId, overId)}
        onAdd={onAdd}
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

function SortableTaskCard({
  task,
  children,
}: {
  task: Task;
  children: (dragHandleProps: { attributes: Record<string, unknown>; listeners: Record<string, unknown> }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useSortable({ id: task.id });

  return <div ref={setNodeRef}>{children({ attributes: attributes as unknown as Record<string, unknown>, listeners: (listeners ?? {}) as Record<string, unknown> })}</div>;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const JS_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

const TIMELINE_START_HOUR = 4;
const TIMELINE_END_HOUR = 24;
const HOUR_HEIGHT = 76;
const TIMELINE_TOP_PADDING = 18;
const TIMELINE_BOTTOM_PADDING = 28;

function inferUnit(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("calorie")) return "kcal";
  if (key.includes("protein") || key.includes("carb") || key.includes("fat")) return "g";
  if (key.includes("duration") || key.includes("time")) return "min";
  return "";
}

function inferBadgeClass(index: number): string {
  const cycle = [
    "bg-blue-500/10 text-blue-600 border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-400/35",
    "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-400/35",
    "bg-violet-500/10 text-violet-600 border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-400/35",
  ];
  return cycle[index % cycle.length];
}

function createSummaryFromMeta(metaFields: string[]): SummaryConfig[] {
  return metaFields.slice(0, 3).map((field, index) => ({
    label: field,
    metaKey: field,
    unit: inferUnit(field),
    colorClass: inferBadgeClass(index),
  }));
}

function emptyTaskDraft(): Omit<Task, "id"> {
  return {
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    icon: "briefcase",
    color: colorFromIcon("briefcase"),
  };
}

function parseTimeToMinutes(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;

  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelveHour) {
    let hours = Number(twelveHour[1]);
    const minutes = Number(twelveHour[2]);
    const meridiem = twelveHour[3].toUpperCase();
    if (meridiem === "PM" && hours !== 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  const twentyFourHour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);
  }

  return null;
}

function displayTimeToInputValue(value: string): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return "";

  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function inputValueToDisplayTime(value: string): string {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return value.trim();

  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  if (hours === 0) {
    hours = 12;
  } else if (hours > 12) {
    hours -= 12;
  }

  return `${hours.toString().padStart(2, "0")}:${minutes} ${suffix}`;
}

function formatTaskDuration(startTime: string, endTime: string): string | null {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start === null || end === null || end <= start) return null;

  const total = end - start;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function formatHourLabel(hour24: number): string {
  const normalizedHour = hour24 % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const hour = normalizedHour % 12 || 12;
  return `${hour} ${suffix}`;
}

function getActiveDayDate(day: DayKey): string {
  const today = new Date();
  const todayIndex = today.getDay();
  const targetIndex = JS_DAYS.indexOf(day);
  const diff = targetIndex - todayIndex;
  const target = new Date(today);
  target.setDate(today.getDate() + diff);
  return target.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sortTasksByTime(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const leftMinutes = parseTimeToMinutes(left.startTime);
    const rightMinutes = parseTimeToMinutes(right.startTime);

    if (leftMinutes === null && rightMinutes === null) return left.title.localeCompare(right.title);
    if (leftMinutes === null) return 1;
    if (rightMinutes === null) return -1;
    if (leftMinutes !== rightMinutes) return leftMinutes - rightMinutes;

    const leftEnd = parseTimeToMinutes(left.endTime) ?? leftMinutes;
    const rightEnd = parseTimeToMinutes(right.endTime) ?? rightMinutes;
    return leftEnd - rightEnd;
  });
}

function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export default function ScheduleApp() {
  const { schedule, setSchedule, ready } = useScheduleDB();
  const [todayKey, setTodayKey] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [editMode, setEditMode] = useState(false);

  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask] = useState<Omit<Task, "id">>(emptyTaskDraft());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Omit<Task, "id">>(emptyTaskDraft());

  const [addingPlan, setAddingPlan] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanIconName, setNewPlanIconName] = useState("brain");
  const [newPlanMetaFields, setNewPlanMetaFields] = useState("");
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const newPlanAccent = accentStyles(colorFromIcon(newPlanIconName));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowMinutes(getCurrentMinutes()), 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const timeoutId = window.setTimeout(() => setTodayKey(JS_DAYS[new Date().getDay()]), msUntilMidnight);
    return () => window.clearTimeout(timeoutId);
  }, [todayKey]);

  useEffect(() => {
    if (!ready || activeDay !== todayKey || editMode) return;

    const timeline = timelineScrollRef.current;
    if (!timeline) return;

    const timelineStartMinutes = TIMELINE_START_HOUR * 60;
    const timelineEndMinutes = TIMELINE_END_HOUR * 60;
    const clampedNow = clamp(getCurrentMinutes(), timelineStartMinutes, timelineEndMinutes);
    const currentTop = TIMELINE_TOP_PADDING + ((clampedNow - timelineStartMinutes) / 60) * HOUR_HEIGHT;
    const targetTop = clamp(currentTop - timeline.clientHeight * 0.35, 0, timeline.scrollHeight - timeline.clientHeight);

    timeline.scrollTop = targetTop;
  }, [activeDay, editMode, ready]);

  function handleAddTask() {
    const title = newTask.title.trim();
    const startTime = inputValueToDisplayTime(newTask.startTime);
    const endTime = inputValueToDisplayTime(newTask.endTime);
    if (!title || !startTime || !endTime) return;

    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: [
          ...prev.activities[activeDay],
          {
            id: uid(),
            title,
            description: newTask.description?.trim() || undefined,
            startTime,
            endTime,
            icon: newTask.icon,
            color: newTask.color,
          },
        ],
      },
    }));
    setNewTask(emptyTaskDraft());
    setAddingTask(false);
  }

  function handleDeleteTask(taskId: string) {
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: prev.activities[activeDay].filter((task) => task.id !== taskId),
      },
    }));
  }

  function startEditingTask(task: Task) {
    setEditingTaskId(task.id);
    setEditingTask({
      title: task.title,
      description: task.description ?? "",
      startTime: displayTimeToInputValue(task.startTime),
      endTime: displayTimeToInputValue(task.endTime),
      icon: task.icon,
      color: resolveAccentColor(task.color, task.icon),
    });
  }

  function cancelEditingTask() {
    setEditingTaskId(null);
    setEditingTask(emptyTaskDraft());
  }

  function saveEditingTask(taskId: string) {
    const title = editingTask.title.trim();
    const startTime = inputValueToDisplayTime(editingTask.startTime);
    const endTime = inputValueToDisplayTime(editingTask.endTime);
    if (!title || !startTime || !endTime) return;

    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: prev.activities[activeDay].map((task) =>
          task.id === taskId
            ? {
                ...task,
                title,
                description: editingTask.description?.trim() || undefined,
                startTime,
                endTime,
                icon: editingTask.icon,
                color: editingTask.color,
              }
            : task
        ),
      },
    }));
    cancelEditingTask();
  }

  function handleAddPlan() {
    const title = newPlanTitle.trim();
    if (!title) return;

    const metaFields = newPlanMetaFields
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    const plan: Plan = {
      id: uid(),
      title,
      emoji: newPlanIconName,
      color: colorFromIcon(newPlanIconName),
      items: [],
      metaFields,
      summary: createSummaryFromMeta(metaFields),
    };

    setSchedule((prev) => ({
      ...prev,
      plans: [...prev.plans, plan],
    }));

    setNewPlanTitle("");
    setNewPlanIconName("brain");
    setNewPlanMetaFields("");
    setAddingPlan(false);
  }

  function handleUpdatePlan(planId: string, updates: { title: string; emoji: string; color: AccentColor; metaFields: string[] }) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              title: updates.title,
              emoji: updates.emoji,
              color: updates.color,
              metaFields: updates.metaFields,
              summary: createSummaryFromMeta(updates.metaFields),
            }
          : plan
      ),
    }));
  }

  function handleDeletePlan(planId: string) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.filter((plan) => plan.id !== planId),
    }));
  }

  function handlePlanAdd(planId: string, entry: Omit<ScheduleEntry, "id">) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, items: [...plan.items, { ...entry, id: uid() }] }
          : plan
      ),
    }));
  }

  function handlePlanEdit(planId: string, itemId: string, updated: Omit<ScheduleEntry, "id">) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, items: plan.items.map((item) => item.id === itemId ? { ...item, ...updated } : item) }
          : plan
      ),
    }));
  }

  function handlePlanDelete(planId: string, itemId: string) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, items: plan.items.filter((item) => item.id !== itemId) }
          : plan
      ),
    }));
  }

  function handleReorderPlans(activeId: string, overId: string) {
    setSchedule((prev) => {
      const oldIndex = prev.plans.findIndex((p) => p.id === activeId);
      const newIndex = prev.plans.findIndex((p) => p.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, plans: arrayMove(prev.plans, oldIndex, newIndex) };
    });
  }

  function handleReorderPlanItems(planId: string, activeId: string, overId: string) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) => {
        if (plan.id !== planId) return plan;
        const oldIndex = plan.items.findIndex((i) => i.id === activeId);
        const newIndex = plan.items.findIndex((i) => i.id === overId);
        if (oldIndex === -1 || newIndex === -1) return plan;
        return { ...plan, items: arrayMove(plan.items, oldIndex, newIndex) };
      }),
    }));
  }

  function handlePlansDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    handleReorderPlans(String(active.id), String(over.id));
  }

  function handleReorderTasks(activeId: string, overId: string) {
    setSchedule((prev) => {
      const tasks = prev.activities[activeDay];
      const oldIndex = tasks.findIndex((task) => task.id === activeId);
      const newIndex = tasks.findIndex((task) => task.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;

      return {
        ...prev,
        activities: {
          ...prev.activities,
          [activeDay]: arrayMove(tasks, oldIndex, newIndex),
        },
      };
    });
  }

  function handleTasksDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    handleReorderTasks(String(active.id), String(over.id));
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
      </main>
    );
  }

  const storedDayTasks = schedule.activities[activeDay];
  const dayTasks = editMode ? storedDayTasks : sortTasksByTime(storedDayTasks);
  const timelineHours = Array.from(
    { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
    (_, index) => TIMELINE_START_HOUR + index
  );
  const timelineStartMinutes = TIMELINE_START_HOUR * 60;
  const timelineEndMinutes = TIMELINE_END_HOUR * 60;
  const timelineDurationHours = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
  const timelineHeight = TIMELINE_TOP_PADDING + timelineDurationHours * HOUR_HEIGHT + TIMELINE_BOTTOM_PADDING;
  const showCurrentTime = activeDay === todayKey && nowMinutes >= timelineStartMinutes && nowMinutes <= timelineEndMinutes;
  const currentTimeTop = TIMELINE_TOP_PADDING + ((nowMinutes - timelineStartMinutes) / 60) * HOUR_HEIGHT;

  function getTimelineTaskLayouts(tasks: Task[]) {
    const intervals = tasks
      .map((task) => {
        const start = parseTimeToMinutes(task.startTime) ?? timelineStartMinutes;
        const end = parseTimeToMinutes(task.endTime) ?? start + 30;
        const clampedStart = clamp(start, timelineStartMinutes, timelineEndMinutes);
        const clampedEnd = clamp(Math.max(end, clampedStart + 15), timelineStartMinutes, timelineEndMinutes);

        return {
          task,
          start: clampedStart,
          end: clampedEnd,
          top: TIMELINE_TOP_PADDING + ((clampedStart - timelineStartMinutes) / 60) * HOUR_HEIGHT,
          height: ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT,
          compact: ((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT <= 60,
          lane: 0,
          laneCount: 1,
        };
      })
      .sort((left, right) => left.start - right.start || left.end - right.end || left.task.title.localeCompare(right.task.title));

    const layouts: typeof intervals = [];
    let cluster: typeof intervals = [];
    let laneEnds: number[] = [];
    let clusterEnd = -1;

    function finishCluster() {
      const laneCount = Math.max(1, laneEnds.length);
      cluster.forEach((layout) => {
        layout.laneCount = laneCount;
        layouts.push(layout);
      });
      cluster = [];
      laneEnds = [];
      clusterEnd = -1;
    }

    intervals.forEach((layout) => {
      if (cluster.length > 0 && layout.start >= clusterEnd) {
        finishCluster();
      }

      const lane = laneEnds.findIndex((laneEnd) => laneEnd <= layout.start);
      layout.lane = lane === -1 ? laneEnds.length : lane;
      laneEnds[layout.lane] = layout.end;
      clusterEnd = Math.max(clusterEnd, layout.end);
      cluster.push(layout);
    });

    if (cluster.length > 0) {
      finishCluster();
    }

    return layouts;
  }

  const timelineTaskLayouts = getTimelineTaskLayouts(dayTasks);

  function getTaskLaneStyle(layout: (typeof timelineTaskLayouts)[number]) {
    const gap = layout.laneCount > 1 ? 6 : 0;
    const width = 100 / layout.laneCount;

    return {
      top: layout.top,
      height: layout.height,
      left: `calc(${layout.lane * width}% + ${layout.lane > 0 ? gap / 2 : 0}px)`,
      width: `calc(${width}% - ${layout.laneCount > 1 ? gap : 0}px)`,
    };
  }

  function renderTaskCard(
    task: Task,
    cardClassName: string,
    dragHandleProps?: { attributes: Record<string, unknown>; listeners: Record<string, unknown> },
    compact = false
  ) {
    const accent = accentStyles(task.color);
    const tone = timelineCardStyles(task.color);
    const iconEntry = SECTION_ICONS.find((entry) => entry.name === task.icon) ?? SECTION_ICONS[0];
    const TaskIcon = iconEntry.icon;
    const duration = formatTaskDuration(task.startTime, task.endTime);

    if (editingTaskId === task.id) {
      return (
        <div className="rounded-xl p-4 w-full min-w-0 space-y-3 border border-neutral-200/80 bg-white shadow-sm transition-colors dark:border-white/[0.08] dark:bg-neutral-900 dark:shadow-black/20">
          <div className="grid grid-cols-5 gap-3">
            {SECTION_ICONS.map(({ name, label, icon: Icon }) => (
              <button
                key={name}
                type="button"
                title={label}
                onClick={() =>
                  setEditingTask((prev) => ({
                    ...prev,
                    icon: name,
                    color: colorFromIcon(name),
                  }))
                }
                className={`h-12 w-12 flex items-center justify-center rounded-lg border ${
                  editingTask.icon === name
                    ? `${accent.border} ${accent.tint} ${accent.text}`
                    : "border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20"
                }`}
              >
                <Icon size={20} strokeWidth={1.5} />
              </button>
            ))}
          </div>
          <input
            value={editingTask.title}
            onChange={(e) => setEditingTask((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Task title"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEditingTask(task.id);
              if (e.key === "Escape") cancelEditingTask();
            }}
            className="w-full min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20"
          />
          <input
            value={editingTask.description}
            onChange={(e) => setEditingTask((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Description (optional)"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEditingTask(task.id);
              if (e.key === "Escape") cancelEditingTask();
            }}
            className="w-full min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20"
          />
          <div className="flex gap-2 min-w-0">
            <input
              value={editingTask.startTime}
              onChange={(e) => setEditingTask((prev) => ({ ...prev, startTime: e.target.value }))}
              type="time"
              aria-label="Edit task start time"
              title="Edit task start time"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEditingTask(task.id);
                if (e.key === "Escape") cancelEditingTask();
              }}
              className="w-full min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:border-white/20"
            />
            <input
              value={editingTask.endTime}
              onChange={(e) => setEditingTask((prev) => ({ ...prev, endTime: e.target.value }))}
              type="time"
              aria-label="Edit task end time"
              title="Edit task end time"
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEditingTask(task.id);
                if (e.key === "Escape") cancelEditingTask();
              }}
              className="w-full min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 focus:outline-none focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:border-white/20"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => saveEditingTask(task.id)}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md bg-neutral-900 text-white text-sm hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
            >
              <IconCheck size={16} />
              Save
            </button>
            <button
              onClick={cancelEditingTask}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-md border border-neutral-200 text-neutral-600 text-sm hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              <IconX size={16} />
              Cancel
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className={`${cardClassName} transition-[background-color,border-color,box-shadow] duration-200 ease-out ${tone.cardBg} ${tone.cardBorder} ${tone.shadow}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1 break-words">
            <div className="flex items-start gap-2 min-w-0">
              <div className={`mt-0.5 ${compact ? "h-6 w-6" : "h-8 w-8"} shrink-0 rounded-md flex items-center justify-center ${tone.iconBg} ${tone.iconText}`}>
                <TaskIcon size={compact ? 15 : 18} strokeWidth={1.7} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className={`${compact ? "text-sm" : "text-[15px]"} font-semibold leading-snug text-neutral-900 dark:text-white`}>
                  {task.title}
                </h3>
                {!compact && task.description && (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    {task.description}
                  </p>
                )}
                <div className={`mt-1.5 flex flex-wrap items-center gap-2 ${compact ? "text-[11px]" : "text-xs"} font-medium text-neutral-500 dark:text-neutral-400`}>
                  <span>{task.startTime} - {task.endTime}</span>
                  {duration && (
                    <span className={`rounded border bg-neutral-50 px-2 py-0.5 border-neutral-200 dark:bg-white/[0.06] dark:border-white/10 ${accent.text}`}>
                      {duration}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {editMode && (
            <div className="flex shrink-0 items-center gap-1">
              {dragHandleProps && (
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  title="Reorder task"
                  {...dragHandleProps.attributes}
                  {...dragHandleProps.listeners}
                >
                  <IconGripVertical size={18} />
                </button>
              )}
              <button
                type="button"
                onClick={() => startEditingTask(task)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                title="Edit task"
              >
                <IconEdit size={18} />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTask(task.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:text-rose-500 dark:hover:text-rose-400"
                title="Delete task"
              >
                <IconTrash size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-5 sm:py-6">
        <header className="mb-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center">
              <img
                src="/logo.svg"
                alt="Planner"
                className="h-7 w-auto dark:hidden"
              />
              <img
                src="/logo-dark.svg"
                alt="Planner"
                className="hidden h-7 w-auto dark:block"
              />
            </div>
            <ThemeToggle />
          </div>
        </header>

        <div>
          <Tabs
            tabs={[
              {
                label: "Day Activity",
                icon: <IconActivity size={18} />,
                content: (
	                  <div className="space-y-4 pt-1">
                    <div className="px-1">
                      {/* Heading */}
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                            {activeDay.charAt(0).toUpperCase() + activeDay.slice(1)}&apos;s Tasks
                          </h2>
                          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                            {getActiveDayDate(activeDay)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveDay(todayKey)}
                          className="mt-0.5 h-7 shrink-0 rounded-md px-2.5 text-xs font-medium text-neutral-600 transition-all duration-200 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/5"
                        >
                          Today
                        </button>
                      </div>
                      {/* Day tabs */}
                      <div className="flex gap-1.5">
                        {DAYS.map((day) => {
                          const isToday = day === todayKey;
                          const isActive = day === activeDay;
                          const dayClass = isActive
                            ? "bg-neutral-900 text-white shadow-sm shadow-neutral-900/20 dark:bg-white dark:text-neutral-900 dark:shadow-white/10"
                            : isToday
                              ? "bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-neutral-300"
                              : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07]";
                          return (
                            <button
                              key={day}
                              onClick={() => setActiveDay(day)}
                              className={`flex-1 min-w-[40px] max-w-[56px] h-10 rounded-md text-xs font-medium transition-all duration-200 ${dayClass}`}
                            >
                              {DAY_LABELS[day]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-4 pb-24">
                      {dayTasks.length === 0 && !addingTask && (
                        <div className="rounded-xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-400 dark:border-white/10 dark:text-neutral-500">
                          Nothing is on today&apos;s calendar yet. Add your first block to start mapping the day.
                        </div>
                      )}

                      {editMode ? (
                        <DndContext sensors={sensors} onDragEnd={handleTasksDragEnd}>
                          <SortableContext items={dayTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
                            <div className="flex flex-col gap-5">
                              {dayTasks.map((task) => (
                                <SortableTaskCard key={task.id} task={task}>
                                  {(dragHandleProps) => (
                                    <div className="w-full min-w-0 animate-panel-in">
                                      {renderTaskCard(task, "border rounded-xl p-4 w-full min-w-0", dragHandleProps)}
                                    </div>
                                  )}
                                </SortableTaskCard>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      ) : (
		                        <div
		                          ref={timelineScrollRef}
		                          className="calendar-scrollbar-none relative flex max-h-[72vh] overflow-y-auto overflow-x-hidden rounded-xl border border-neutral-100 bg-white shadow-sm shadow-neutral-200/50 dark:border-white/[0.07] dark:bg-neutral-900 dark:shadow-black/25"
		                        >
		                          <div className="sticky left-0 z-20 w-12 shrink-0 bg-white/95 pr-2 sm:w-14 dark:bg-neutral-900/95 backdrop-blur-sm" style={{ height: timelineHeight }}>
		                            {timelineHours.map((hour, index) => (
		                              <span
		                                key={hour}
		                                className="absolute right-2 text-[11px] font-medium text-neutral-400 dark:text-neutral-500"
		                                style={{ top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT - (index === 0 ? 0 : 8) }}
		                              >
		                                {formatHourLabel(hour)}
		                              </span>
		                            ))}
		                          </div>
				                          <div className="relative min-w-0 flex-1 border-l border-neutral-100 dark:border-white/5" style={{ height: timelineHeight }}>
		                            <div className="absolute inset-0">
		                              {timelineHours.map((hour, index) => (
		                                <div
		                                  key={`grid-${hour}`}
				                                  className="absolute left-0 right-0 border-t border-neutral-100 dark:border-white/[0.06]"
		                                  style={{ top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT }}
		                                />
		                              ))}
		                            </div>
		                            <div className="absolute inset-0">
		                              {timelineTaskLayouts.map((layout) => {
		                                return (
		                                  <div
		                                    key={layout.task.id}
		                                    className="absolute min-w-0 px-1 animate-panel-in"
		                                    style={getTaskLaneStyle(layout)}
		                                  >
	                                    <div className="relative h-full min-h-[36px]">
		                                      {renderTaskCard(layout.task, "h-full rounded-xl p-2.5 w-full min-w-0 border overflow-hidden", undefined, layout.compact)}
	                                    </div>
	                                  </div>
	                                );
		                              })}
		                            </div>
		                            {showCurrentTime && (
		                              <div
		                                className="pointer-events-none absolute left-0 right-0 z-30 flex -translate-y-1/2 items-center"
		                                style={{ top: currentTimeTop }}
		                              >
		                                <div className="-ml-[5px] h-2.5 w-2.5 rounded-full bg-red-500" />
		                                <div className="h-px flex-1 bg-red-500" />
		                              </div>
		                            )}
		                          </div>
		                        </div>
	                      )}

                      {addingTask ? (
                        <div className="space-y-3 rounded-xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-neutral-900 dark:shadow-black/20">
                          <p className="text-sm font-semibold text-neutral-900 dark:text-white">New time block</p>
                          <div className="grid grid-cols-5 gap-3">
                            {SECTION_ICONS.map(({ name, label, icon: Icon }) => (
                              <button
                                key={name}
                                type="button"
                                title={label}
                                onClick={() =>
                                  setNewTask((prev) => ({
                                    ...prev,
                                    icon: name,
                                    color: colorFromIcon(name),
                                  }))
                                }
                                className={`h-10 w-10 flex items-center justify-center rounded-lg border transition-colors ${
                                  newTask.icon === name
                                    ? `${accentStyles(newTask.color).border} ${accentStyles(newTask.color).tint} ${accentStyles(newTask.color).text}`
                                    : "border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20"
                                }`}
                              >
                                <Icon size={20} strokeWidth={1.5} />
                              </button>
                            ))}
                          </div>
                          <input
                            value={newTask.title}
                            onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                            placeholder="Block title"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddTask();
                              if (e.key === "Escape") {
                                setAddingTask(false);
                                setNewTask(emptyTaskDraft());
                              }
                            }}
                            className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:border-white/20"
                          />
                          <input
                            value={newTask.description}
                            onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Short note (optional)"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddTask();
                              if (e.key === "Escape") {
                                setAddingTask(false);
                                setNewTask(emptyTaskDraft());
                              }
                            }}
                            className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:border-white/20 dark:placeholder:text-neutral-500"
                          />
                          <div className="flex gap-2">
                            <input
                              value={newTask.startTime}
                              onChange={(e) => setNewTask((prev) => ({ ...prev, startTime: e.target.value }))}
                              type="time"
                              aria-label="New task start time"
                              title="New task start time"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddTask();
                                if (e.key === "Escape") {
                                  setAddingTask(false);
                                  setNewTask(emptyTaskDraft());
                                }
                              }}
                              className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:border-white/20"
                            />
                            <input
                              value={newTask.endTime}
                              onChange={(e) => setNewTask((prev) => ({ ...prev, endTime: e.target.value }))}
                              type="time"
                              aria-label="New task end time"
                              title="New task end time"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleAddTask();
                                if (e.key === "Escape") {
                                  setAddingTask(false);
                                  setNewTask(emptyTaskDraft());
                                }
                              }}
                              className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:border-white/20"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleAddTask}
                              className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                            >
                              <IconPlus size={16} />
                              Save Block
                            </button>
                            <button
                              onClick={() => {
                                setAddingTask(false);
                                setNewTask(emptyTaskDraft());
                              }}
                              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingTask(true)}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
                        >
                          <IconPlus size={16} />
                          Add Time Block
                        </button>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                label: "Plan",
                icon: <IconChecklist size={18} />,
                content: (
                  <div className="space-y-4 pt-1">
                    {schedule.plans.length === 0 && !addingPlan && (
                      <div className="rounded-xl border border-dashed border-neutral-200 py-8 text-center text-sm text-neutral-400 dark:border-white/10 dark:text-neutral-500">
                        No plans yet. Create one for routines, meals, workouts, or anything you want to track over time.
                      </div>
                    )}

                    <DndContext sensors={sensors} onDragEnd={handlePlansDragEnd}>
                      <SortableContext items={schedule.plans.map((plan) => plan.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-4">
                          {schedule.plans.map((plan) => (
                            <SortablePlanCard
                              key={plan.id}
                              plan={plan}
                              onUpdatePlan={handleUpdatePlan}
                              onDeletePlan={handleDeletePlan}
                              onReorderItems={handleReorderPlanItems}
                              onAdd={(entry) => handlePlanAdd(plan.id, entry)}
                              onEdit={(itemId, updated) => handlePlanEdit(plan.id, itemId, updated)}
                              onDelete={(itemId) => handlePlanDelete(plan.id, itemId)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>

                    {addingPlan ? (
                      <div className="space-y-3 rounded-xl border border-neutral-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-neutral-900 dark:shadow-black/20">
                        <p className="text-sm font-semibold text-neutral-900 dark:text-white">New plan</p>
                        <input
                          value={newPlanTitle}
                          onChange={(e) => setNewPlanTitle(e.target.value)}
                          placeholder="Plan name"
                          className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:border-white/20"
                        />
                        <div className="grid grid-cols-5 gap-3">
                          {SECTION_ICONS.map(({ name, label, icon: Icon }) => (
                            <button
                              key={name}
                              type="button"
                              title={label}
                              onClick={() => setNewPlanIconName(name)}
                              className={`h-10 w-10 flex items-center justify-center rounded-lg border transition-colors ${
                                newPlanIconName === name
                                  ? `${newPlanAccent.border} ${newPlanAccent.tint} ${newPlanAccent.text}`
                                  : "border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20"
                              }`}
                            >
                              <Icon size={20} strokeWidth={1.5} />
                            </button>
                          ))}
                        </div>
                        <input
                          value={newPlanMetaFields}
                          onChange={(e) => setNewPlanMetaFields(e.target.value)}
                          placeholder="Meta fields (optional): Calories, Protein, Duration"
                          className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:focus:border-white/20"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleAddPlan}
                            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                          >
                            <IconPlus size={16} />
                            Create Plan
                          </button>
                          <button
                            onClick={() => {
                              setAddingPlan(false);
                              setNewPlanTitle("");
                              setNewPlanIconName("brain");
                              setNewPlanMetaFields("");
                            }}
                            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingPlan(true)}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-200 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
                      >
                        <IconPlus size={16} />
                        Add Plan
                      </button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
        <button
          type="button"
          onClick={() => setEditMode((prev) => !prev)}
          className={`fixed bottom-6 right-6 z-20 flex h-12 w-12 items-center justify-center rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl hover:scale-105 ${
            editMode
              ? "bg-rose-500 text-white shadow-rose-500/30 hover:bg-rose-600 dark:bg-rose-500 dark:text-white dark:shadow-rose-500/20 dark:hover:bg-rose-600"
              : "bg-neutral-900 text-white shadow-neutral-900/25 hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:shadow-white/10 dark:hover:bg-neutral-100"
          }`}
          title={editMode ? "Exit edit mode" : "Enter edit mode"}
          aria-label={editMode ? "Exit edit mode" : "Enter edit mode"}
        >
          {editMode ? <IconX size={20} strokeWidth={2} /> : <IconPlus size={20} strokeWidth={2} />}
        </button>
      </div>
    </main>
  );
}
