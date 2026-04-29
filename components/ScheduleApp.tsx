"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Progress from "@/components/Progress";
import AddTaskModal from "@/components/AddTaskModal";
import PlanCard from "@/components/PlanCard";
import BottomNav from "@/components/BottomNav";
import Settings from "@/components/Settings";
import ThemeToggle from "@/components/ThemeToggle";
import { ScheduleEntry } from "@/components/ScheduleItem";
import { useScheduleDB, DAYS, DAY_LABELS, DayKey, Goal, MetricEntry, Plan, SummaryConfig, Task } from "@/lib/useScheduleDB";
import type { AccentColor } from "@/lib/colorSystem";
import { accentStyles, colorFromIcon, resolveAccentColor, timelineCardStyles } from "@/lib/colorSystem";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import { IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconEdit, IconLayoutList, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
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
  onAddGoal,
  onDeleteGoal,
}: {
  plan: Plan;
  onUpdatePlan: (planId: string, updates: { title: string; emoji: string; color: AccentColor; metaFields: string[] }) => void;
  onDeletePlan: (planId: string) => void;
  onReorderItems: (planId: string, activeId: string, overId: string) => void;
  onAdd: (entry: Omit<ScheduleEntry, "id">) => void;
  onEdit: (itemId: string, updated: Omit<ScheduleEntry, "id">) => void;
  onDelete: (itemId: string) => void;
  onAddGoal: (goal: Omit<Goal, "id">) => void;
  onDeleteGoal: (goalId: string) => void;
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
        goals={plan.goals ?? []}
        onUpdatePlan={onUpdatePlan}
        onDeletePlan={onDeletePlan}
        onReorderItems={(activeId, overId) => onReorderItems(plan.id, activeId, overId)}
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddGoal={onAddGoal}
        onDeleteGoal={onDeleteGoal}
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
    "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35",
    "bg-pink-500/10 text-pink-600 border-pink-500/25 dark:bg-pink-500/15 dark:text-pink-400 dark:border-pink-400/35",
    "bg-cyan-500/10 text-cyan-600 border-cyan-500/25 dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-400/35",
  ];
  return cycle[index % cycle.length];
}

function createSummaryFromMeta(metaFields: string[]): SummaryConfig[] {
  return metaFields.map((field, index) => ({
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
    planId: undefined,
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

function getWeekDates(offset: number): Array<{ day: DayKey; date: Date }> {
  const today = new Date();
  const dow = today.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysToMon + offset * 7);
  monday.setHours(0, 0, 0, 0);
  return DAYS.map((day, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { day, date: d };
  });
}

export default function ScheduleApp() {
  const { schedule, setSchedule, ready } = useScheduleDB();
  const [todayKey, setTodayKey] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"card" | "calendar">("card");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Omit<Task, "id">>(emptyTaskDraft());

  const [addingPlan, setAddingPlan] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanIconName, setNewPlanIconName] = useState("brain");
  const [newPlanMetaFields, setNewPlanMetaFields] = useState<string[]>([]);
  const [newPlanMetaInput, setNewPlanMetaInput] = useState("");
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
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

  function handleAddNewTask(task: Omit<Task, "id">) {
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: [...prev.activities[activeDay], { ...task, id: uid() }],
      },
    }));
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
      planId: task.planId,
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
              planId: editingTask.planId,
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

    const plan: Plan = {
      id: uid(),
      title,
      emoji: newPlanIconName,
      color: colorFromIcon(newPlanIconName),
      items: [],
      metaFields: newPlanMetaFields,
      summary: createSummaryFromMeta(newPlanMetaFields),
    };

    setSchedule((prev) => ({
      ...prev,
      plans: [...prev.plans, plan],
    }));

    setNewPlanTitle("");
    setNewPlanIconName("brain");
    setNewPlanMetaFields([]);
    setNewPlanMetaInput("");
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

  function handleAddGoal(planId: string, goal: Omit<Goal, "id">) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, goals: [...(plan.goals ?? []), { ...goal, id: uid() }] }
          : plan
      ),
    }));
  }

  function handleDeleteGoal(planId: string, goalId: string) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((plan) =>
        plan.id === planId
          ? { ...plan, goals: (plan.goals ?? []).filter((g) => g.id !== goalId) }
          : plan
      ),
    }));
  }

  function handleAddEntry(entry: Omit<MetricEntry, "id">) {
    setSchedule((prev) => ({
      ...prev,
      metricEntries: [...prev.metricEntries, { ...entry, id: uid() }],
    }));
  }

  function handleDeleteEntry(entryId: string) {
    setSchedule((prev) => ({
      ...prev,
      metricEntries: prev.metricEntries.filter((e) => e.id !== entryId),
    }));
  }

  function handleSetPlanMetric(planId: string, metric: { name: string; unit: string } | undefined) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((p) => (p.id === planId ? { ...p, metric } : p)),
    }));
  }

  function handleClearData() {
    setSchedule((prev) => ({
      ...prev,
      plans: [],
      activities: Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as typeof prev.activities,
      metricEntries: [],
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
      const activeTask = tasks.find((t) => t.id === activeId);
      const overTask = tasks.find((t) => t.id === overId);
      if (!activeTask || !overTask) return prev;

      return {
        ...prev,
        activities: {
          ...prev.activities,
          [activeDay]: tasks.map((task) => {
            if (task.id === activeId) return { ...task, startTime: overTask.startTime, endTime: overTask.endTime };
            if (task.id === overId) return { ...task, startTime: activeTask.startTime, endTime: activeTask.endTime };
            return task;
          }),
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
  const dayTasks = sortTasksByTime(storedDayTasks);
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

  const weekDates = getWeekDates(weekOffset);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const weekLabel = weekDates[2].date.toLocaleDateString("en-US", { month: "long", year: "numeric" });

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
    const tone = timelineCardStyles(task.color);
    const iconEntry = SECTION_ICONS.find((entry) => entry.name === task.icon) ?? SECTION_ICONS[0];
    const TaskIcon = iconEntry.icon;
    const duration = formatTaskDuration(task.startTime, task.endTime);

    if (editingTaskId === task.id) {
      return (
        <div className="rounded-xl w-full min-w-0 border border-neutral-200/80 bg-white shadow-sm transition-colors dark:border-white/[0.08] dark:bg-neutral-900 dark:shadow-black/20 overflow-hidden">
          <div className={`flex items-center gap-2.5 border-b px-4 py-3 border-neutral-100 dark:border-white/[0.07] ${accentStyles(editingTask.color).tint}`}>
            <div className={`flex h-6 w-6 items-center justify-center rounded-md ${accentStyles(editingTask.color).iconSolid}`}>
              {(() => { const ic = SECTION_ICONS.find(i => i.name === editingTask.icon); const EI = (ic ?? SECTION_ICONS[0]).icon; return <EI size={13} strokeWidth={2} />; })()}
            </div>
            <p className="text-xs font-semibold text-neutral-900 dark:text-white">Edit time block</p>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-5 gap-1.5">
              {SECTION_ICONS.map(({ name, label, icon: Icon }) => {
                const ic = getIconPickerStyle(name);
                const sel = editingTask.icon === name;
                return (
                  <button
                    key={name}
                    type="button"
                    title={label}
                    onClick={() => setEditingTask((prev) => ({ ...prev, icon: name, color: colorFromIcon(name) }))}
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
              <input
                value={editingTask.title}
                onChange={(e) => setEditingTask((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Task title"
                onKeyDown={(e) => { if (e.key === "Enter") saveEditingTask(task.id); if (e.key === "Escape") cancelEditingTask(); }}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
              />
              <input
                value={editingTask.description}
                onChange={(e) => setEditingTask((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description (optional)"
                onKeyDown={(e) => { if (e.key === "Enter") saveEditingTask(task.id); if (e.key === "Escape") cancelEditingTask(); }}
                className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Start</p>
                <input
                  value={editingTask.startTime}
                  onChange={(e) => setEditingTask((prev) => ({ ...prev, startTime: e.target.value }))}
                  type="time"
                  aria-label="Edit task start time"
                  onKeyDown={(e) => { if (e.key === "Enter") saveEditingTask(task.id); if (e.key === "Escape") cancelEditingTask(); }}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">End</p>
                <input
                  value={editingTask.endTime}
                  onChange={(e) => setEditingTask((prev) => ({ ...prev, endTime: e.target.value }))}
                  type="time"
                  aria-label="Edit task end time"
                  onKeyDown={(e) => { if (e.key === "Enter") saveEditingTask(task.id); if (e.key === "Escape") cancelEditingTask(); }}
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
                />
              </div>
            </div>
            {schedule.plans.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">Link to plan</p>
                <div className="flex flex-wrap gap-1.5">
                  {schedule.plans.map((plan) => {
                    const ic = SECTION_ICONS.find((i) => i.name === plan.emoji);
                    const PI = (ic ?? SECTION_ICONS[0]).icon;
                    const sel = editingTask.planId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setEditingTask((prev) => ({ ...prev, planId: sel ? undefined : plan.id }))}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${sel ? `${accentStyles(plan.color).iconSolid} shadow-sm` : `${accentStyles(plan.color).tint} ${accentStyles(plan.color).text} hover:opacity-90`}`}
                      >
                        <PI size={11} strokeWidth={2} />
                        {plan.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => saveEditingTask(task.id)}
                className={`inline-flex flex-1 h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 ${accentStyles(editingTask.color).iconSolid}`}
              >
                <IconCheck size={15} />
                Save
              </button>
              <button
                type="button"
                onClick={cancelEditingTask}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
              >
                <IconX size={15} />
                Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (compact) {
      return (
        <div className={`${cardClassName} transition-[background-color,border-color,box-shadow] duration-200 ease-out ${tone.cardBg} ${tone.cardBorder} ${tone.shadow}`}>
          <div className="flex h-full items-center gap-2 min-w-0">
            <div className={`h-5 w-5 shrink-0 rounded-md flex items-center justify-center ${tone.iconBg} ${tone.iconText}`}>
              <TaskIcon size={11} strokeWidth={2} />
            </div>
            <span className={`text-xs font-semibold leading-tight truncate flex-1 min-w-0 ${tone.title}`}>
              {task.title}
            </span>
            {duration && (
              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${tone.durationBadge}`}>
                {duration}
              </span>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className={`${cardClassName} transition-[background-color,border-color,box-shadow] duration-200 ease-out ${tone.cardBg} ${tone.cardBorder} ${tone.shadow}`}>
        <div className="flex items-start justify-between gap-2 h-full">
          <div className="min-w-0 flex-1 flex flex-col gap-1.5">
            {/* Time + duration — first so you orient to when before what */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[11px] font-medium tracking-tight ${tone.time}`}>
                {task.startTime} – {task.endTime}
              </span>
              {duration && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${tone.durationBadge}`}>
                  {duration}
                </span>
              )}
            </div>
            {/* Icon + title */}
            <div className="flex items-center gap-2 min-w-0">
              <div className={`h-6 w-6 shrink-0 rounded-md flex items-center justify-center ${tone.iconBg} ${tone.iconText}`}>
                <TaskIcon size={13} strokeWidth={2} />
              </div>
              <h3 className={`text-[14px] font-semibold leading-snug break-words ${tone.title}`}>
                {task.title}
              </h3>
            </div>
            {task.description && (
              <p className={`text-[12px] leading-relaxed ${tone.description}`}>
                {task.description}
              </p>
            )}
            {task.planId && (() => {
              const linkedPlan = schedule.plans.find((p) => p.id === task.planId);
              if (!linkedPlan) return null;
              const planIc = SECTION_ICONS.find((i) => i.name === linkedPlan.emoji);
              const PI = (planIc ?? SECTION_ICONS[0]).icon;
              const pa = accentStyles(linkedPlan.color);
              return (
                <div className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${pa.tint} ${pa.text}`}>
                  <PI size={9} strokeWidth={2.5} />
                  {linkedPlan.title}
                </div>
              );
            })()}
          </div>

          {editMode && (
            <div className="flex shrink-0 items-center gap-1">
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

  function renderCardViewTask(
    task: Task,
    dragHandleProps?: { attributes: Record<string, unknown>; listeners: Record<string, unknown> }
  ) {
    if (editingTaskId === task.id) {
      return renderTaskCard(task, "border rounded-xl p-4 w-full min-w-0", dragHandleProps);
    }

    const tone = timelineCardStyles(task.color);
    const iconEntry = SECTION_ICONS.find((e) => e.name === task.icon) ?? SECTION_ICONS[0];
    const CardIcon = iconEntry.icon;
    const duration = formatTaskDuration(task.startTime, task.endTime);
    const linkedPlan = task.planId ? schedule.plans.find((p) => p.id === task.planId) : null;

    return (
      <div
        className={`flex items-center gap-4 rounded-2xl border p-4 transition-all duration-200 ${tone.cardBg} ${tone.cardBorder} ${editMode && dragHandleProps ? "cursor-grab active:cursor-grabbing" : ""}`}
        {...(editMode && dragHandleProps ? { ...dragHandleProps.attributes, ...dragHandleProps.listeners } : {})}
      >
        <div className={`h-12 w-12 shrink-0 rounded-full flex items-center justify-center ${tone.iconBg} ${tone.iconText}`}>
          <CardIcon size={22} strokeWidth={1.8} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-sm font-semibold truncate flex-1 min-w-0 ${tone.title}`}>
              {task.title}
            </span>
            {duration && (
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tone.durationBadge}`}>
                {duration}
              </span>
            )}
          </div>
          <p className={`text-xs font-medium mt-0.5 ${tone.time}`}>
            {task.startTime} – {task.endTime}
          </p>
          {linkedPlan && (
            <p className="text-[10px] font-semibold tracking-widest uppercase text-neutral-400 dark:text-neutral-500 mt-0.5">
              {linkedPlan.title}
            </p>
          )}
        </div>

        {editMode && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); startEditingTask(task); }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              title="Edit"
            >
              <IconEdit size={15} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
              title="Delete"
            >
              <IconTrash size={15} />
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 pb-28 text-neutral-900 dark:bg-neutral-950 dark:text-white">
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
          {activeTab === 0 && (
            <div className="space-y-4 pt-1">
              {/* Week calendar strip */}
              <div className="rounded-xl border border-neutral-200/80 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-semibold text-neutral-900 dark:text-white">{weekLabel}</span>
                        <div className="flex gap-0.5">
                          <button
                            type="button"
                            onClick={() => setWeekOffset((w) => w - 1)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07] transition-colors"
                          >
                            <IconChevronLeft size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setWeekOffset(0); setActiveDay(todayKey); }}
                            className="h-7 rounded-lg px-2 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07] transition-colors"
                          >
                            Today
                          </button>
                          <button
                            type="button"
                            onClick={() => setWeekOffset((w) => w + 1)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07] transition-colors"
                          >
                            <IconChevronRight size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-0.5">
                        {weekDates.map(({ day, date }) => {
                          const isDateToday = date.getTime() === todayMidnight.getTime();
                          const isActive = day === activeDay;
                          return (
                            <button
                              key={day}
                              type="button"
                              onClick={() => setActiveDay(day)}
                              className={`flex flex-col items-center gap-1 rounded-xl py-2 transition-all duration-200 ${
                                isActive
                                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                                  : isDateToday
                                    ? "bg-neutral-100 text-neutral-700 dark:bg-white/10 dark:text-neutral-200"
                                    : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
                              }`}
                            >
                              <span className={`text-[9px] font-semibold uppercase tracking-wide leading-none ${isActive ? "opacity-70" : "opacity-60"}`}>
                                {DAY_LABELS[day]}
                              </span>
                              <span className="text-sm font-bold leading-none">{date.getDate()}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Section header */}
                    <div className="flex items-start justify-between gap-3 px-1">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
                          My Schedule
                        </p>
                        <h2 className="mt-0.5 text-base font-semibold text-neutral-900 dark:text-white">
                          Today&apos;s Task
                        </h2>
                      </div>
                      {viewMode === "card" && (
                        <button
                          type="button"
                          onClick={() => setEditMode((prev) => !prev)}
                          title={editMode ? "Done editing" : "Edit tasks"}
                          className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                            editMode
                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                              : "border-neutral-200 text-neutral-500 hover:bg-neutral-100 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
                          }`}
                        >
                          <IconEdit size={14} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-3 pb-28">
                      {dayTasks.length === 0 && (
                        <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400 dark:border-white/10 dark:text-neutral-500">
                          Nothing scheduled yet — tap + to add your first task.
                        </div>
                      )}

                      {viewMode === "card" ? (
                        editMode ? (
                          <DndContext sensors={sensors} onDragEnd={handleTasksDragEnd}>
                            <SortableContext items={dayTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                              <div className="flex flex-col gap-3">
                                {dayTasks.map((task) => (
                                  <SortableTaskCard key={task.id} task={task}>
                                    {(dragHandleProps) => (
                                      <div className="w-full min-w-0 animate-panel-in">
                                        {renderCardViewTask(task, dragHandleProps)}
                                      </div>
                                    )}
                                  </SortableTaskCard>
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {dayTasks.map((task) => (
                              <div key={task.id} className="animate-panel-in">
                                {renderCardViewTask(task)}
                              </div>
                            ))}
                          </div>
                        )
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
                              {timelineTaskLayouts.map((layout) => (
                                <div
                                  key={layout.task.id}
                                  className="absolute min-w-0 px-1 animate-panel-in"
                                  style={getTaskLaneStyle(layout)}
                                >
                                  <div className="relative h-full min-h-[36px]">
                                    {renderTaskCard(layout.task, "h-full rounded-xl p-2.5 w-full min-w-0 border overflow-hidden", undefined, layout.compact)}
                                  </div>
                                  </div>
                                ))}
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

                    </div>
            </div>
          )}
          {activeTab === 1 && (
            <div className="space-y-4 pt-1 pb-28">
                    {schedule.plans.length === 0 && !addingPlan && (
                      <div className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-400 dark:border-white/10 dark:text-neutral-500">
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
                              onAddGoal={(goal) => handleAddGoal(plan.id, goal)}
                              onDeleteGoal={(goalId) => handleDeleteGoal(plan.id, goalId)}
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
                        <div className="grid grid-cols-5 gap-1.5">
                          {SECTION_ICONS.map(({ name, label, icon: Icon }) => {
                            const ic = getIconPickerStyle(name);
                            const sel = newPlanIconName === name;
                            return (
                              <button
                                key={name}
                                type="button"
                                title={label}
                                onClick={() => setNewPlanIconName(name)}
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
                          {newPlanMetaFields.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {newPlanMetaFields.map((field, i) => (
                                <span key={field} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${inferBadgeClass(i)}`}>
                                  {field}
                                  <button
                                    type="button"
                                    onClick={() => setNewPlanMetaFields((prev) => prev.filter((f) => f !== field))}
                                    className="ml-0.5 opacity-60 hover:opacity-100"
                                  >
                                    <IconX size={10} />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-1.5">
                            <input
                              value={newPlanMetaInput}
                              onChange={(e) => setNewPlanMetaInput(e.target.value)}
                              placeholder="Add metric (e.g. Calories, Sets…)"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const val = newPlanMetaInput.trim();
                                  if (val && !newPlanMetaFields.includes(val)) {
                                    setNewPlanMetaFields((prev) => [...prev, val]);
                                    setNewPlanMetaInput("");
                                  }
                                }
                              }}
                              className="h-9 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-400 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const val = newPlanMetaInput.trim();
                                if (val && !newPlanMetaFields.includes(val)) {
                                  setNewPlanMetaFields((prev) => [...prev, val]);
                                  setNewPlanMetaInput("");
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
                            onClick={handleAddPlan}
                            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                          >
                            <IconPlus size={16} />
                            Create Plan
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingPlan(false);
                              setNewPlanTitle("");
                              setNewPlanIconName("brain");
                              setNewPlanMetaFields([]);
                              setNewPlanMetaInput("");
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
                        className="relative inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-md font-medium
  text-cyan-600 dark:text-cyan-300
  border border-cyan-500/40
  transition-all duration-300

  hover:border-cyan-400 hover:text-cyan-700
  dark:hover:text-cyan-200

  before:absolute before:inset-0 before:rounded-lg
  before:bg-cyan-500/0 before:opacity-0 before:transition-all before:duration-300
  hover:before:bg-cyan-500/5 hover:before:opacity-100

  shadow-[0_0_0px_rgba(6,182,212,0)]
  hover:shadow-[0_0_20px_rgba(6,182,212,0.25)]

  active:scale-[0.98]"
                      >
                        <IconPlus size={16} />
                        Add Plan
                      </button>
                    )}
            </div>
          )}
          {activeTab === 2 && (
            <Progress
              plans={schedule.plans}
              entries={schedule.metricEntries}
              onAddEntry={handleAddEntry}
              onDeleteEntry={handleDeleteEntry}
              onSetMetric={handleSetPlanMetric}
            />
          )}
          {activeTab === 3 && (
            <Settings onClearData={handleClearData} />
          )}
        </div>
        {activeTab === 0 && (
          <button
            type="button"
            onClick={() => { setViewMode((v) => (v === "card" ? "calendar" : "card")); setEditMode(false); }}
            aria-label={viewMode === "card" ? "Calendar view" : "Card view"}
            className="fixed bottom-[88px] right-4 z-20 flex h-12 w-12 items-center justify-center rounded-2xl border border-neutral-200/60 bg-white text-neutral-700 transition-all duration-200 active:scale-95 dark:border-white/[0.08] dark:bg-neutral-900 dark:text-neutral-300"
          >
            {viewMode === "card" ? <IconCalendar size={18} /> : <IconLayoutList size={18} />}
          </button>
        )}
      </div>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAddTask={() => setAddTaskModalOpen(true)}
      />
      <AddTaskModal
        isOpen={addTaskModalOpen}
        onClose={() => setAddTaskModalOpen(false)}
        onSave={handleAddNewTask}
        plans={schedule.plans}
      />
    </main>
  );
}
