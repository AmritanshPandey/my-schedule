"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ProgressChart from "@/components/ProgressChart";
import AddEntryModal from "@/components/AddEntryModal";
import AddTaskModal from "@/components/AddTaskModal";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import TimeSlotPicker from "@/components/TimeSlotPicker";
import {
  useScheduleDB,
  DAYS,
  DAY_LABELS,
  DayKey,
  MetricEntry,
  Plan,
  ProgressTracker,
  SummaryConfig,
  Task,
  categoryFromIcon,
} from "@/lib/useScheduleDB";
import {
  accentStyles,
  colorFromIcon,
  resolveAccentColor,
  timelineCardStyles,
} from "@/lib/colorSystem";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardList,
  IconEdit,
  IconLayoutList,
  IconPlus,
  IconTable,
  IconTrash,
  IconTrendingDown,
  IconTrendingUp,
  IconX,
} from "@tabler/icons-react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMELINE_START_HOUR = 4;
const TIMELINE_END_HOUR = 24;
const HOUR_HEIGHT = 112;
const TIMELINE_TOP_PADDING = 20;
const TIMELINE_BOTTOM_PADDING = 40;

const JS_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const WEEKDAY_ORDER: DayKey[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const WEEKDAY_SHORT: Record<DayKey, string> = {
  sunday: "Su",
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function inferUnit(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("calorie")) return "kcal";
  if (key.includes("protein") || key.includes("carb") || key.includes("fat")) return "g";
  if (key.includes("duration") || key.includes("time")) return "min";
  if (key.includes("weight")) return "kg";
  return "";
}

function inferBadgeClass(index: number): string {
  const cycle = [
    "bg-blue-500/10 text-blue-600 border-blue-500/25 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-400/35",
    "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-400/35",
    "bg-violet-500/10 text-violet-600 border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-400/35",
    "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35",
    "bg-pink-500/10 text-pink-600 border-pink-500/25 dark:bg-pink-500/15 dark:text-pink-400 dark:border-pink-400/35",
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
    planId: "",
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
  if (twentyFourHour) return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);
  return null;
}

function displayTimeToInputValue(value: string): string {
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const mins = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function inputValueToDisplayTime(value: string): string {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return value.trim();
  let hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? "PM" : "AM";
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
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

function formatPlanDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type CardSize = "xsmall" | "small" | "medium" | "large";

function computeCardSize(height: number, laneCount: number): CardSize {
  // Usable content = card height − 24px (py-0.5×2 + p-2.5×2 padding)
  // HOUR_HEIGHT = 112 → 30 min = 56px, 45 min = 84px, 60 min = 112px
  // xsmall: title only         — card < 60px  (< ~32 min)
  // small:  title + time       — card < 88px  (< ~47 min)
  // medium: title + time+dur   — card < 108px (< ~58 min)
  // large:  plan label + all   — card ≥ 108px (≥ 58 min)
  let size: CardSize;
  if (height < 60) size = "xsmall";
  else if (height < 88) size = "small";
  else if (height < 108) size = "medium";
  else size = "large";

  // Degrade one step per extra lane beyond 1
  if (laneCount >= 3) {
    if (size === "large") size = "small";
    else size = "xsmall";
  } else if (laneCount === 2) {
    if (size === "large") size = "medium";
    else if (size === "medium") size = "small";
    else size = "xsmall";
  }

  return size;
}

function sortTasksByTime(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const lm = parseTimeToMinutes(left.startTime);
    const rm = parseTimeToMinutes(right.startTime);
    if (lm === null && rm === null) return left.title.localeCompare(right.title);
    if (lm === null) return 1;
    if (rm === null) return -1;
    if (lm !== rm) return lm - rm;
    const le = parseTimeToMinutes(left.endTime) ?? lm;
    const re = parseTimeToMinutes(right.endTime) ?? rm;
    return le - re;
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

// ─── Sortable wrappers ────────────────────────────────────────────────────────

function SortableTaskCard({
  task,
  children,
}: {
  task: Task;
  children: (dragHandleProps: {
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef}>
      {children({
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: (listeners ?? {}) as Record<string, unknown>,
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScheduleApp() {
  const { schedule, setSchedule, ready } = useScheduleDB();
  const [todayKey, setTodayKey] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [entryTracker, setEntryTracker] = useState<ProgressTracker | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Omit<Task, "id">>(emptyTaskDraft());

  const [addingPlan, setAddingPlan] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanDescription, setNewPlanDescription] = useState("");
  const [newPlanStartDate, setNewPlanStartDate] = useState("");
  const [newPlanEndDate, setNewPlanEndDate] = useState("");
  const [newPlanIconName, setNewPlanIconName] = useState("brain");
  const [newPlanMetaFields, setNewPlanMetaFields] = useState<string[]>([]);
  const [newPlanMetaInput, setNewPlanMetaInput] = useState("");

  const [addingTracker, setAddingTracker] = useState(false);
  const [addingTrackerForPlanId, setAddingTrackerForPlanId] = useState<string | null>(null);
  const [newTrackerTitle, setNewTrackerTitle] = useState("");
  const [newTrackerUnit, setNewTrackerUnit] = useState("");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPlanDraft, setEditPlanDraft] = useState({ title: "", description: "", startDate: "", endDate: "" });
  const [editingTrackerId, setEditingTrackerId] = useState<string | null>(null);
  const [editTrackerDraft, setEditTrackerDraft] = useState({ title: "", unit: "" });

  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    const id = window.setInterval(() => setNowMinutes(getCurrentMinutes()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const id = window.setTimeout(() => setTodayKey(JS_DAYS[new Date().getDay()]), msUntilMidnight);
    return () => window.clearTimeout(id);
  }, [todayKey]);

  useEffect(() => {
    if (!ready || activeDay !== todayKey || editMode) return;
    const timeline = timelineScrollRef.current;
    if (!timeline) return;
    const timelineStartMinutes = TIMELINE_START_HOUR * 60;
    const timelineEndMinutes = TIMELINE_END_HOUR * 60;
    const clampedNow = clamp(getCurrentMinutes(), timelineStartMinutes, timelineEndMinutes);
    const currentTop =
      TIMELINE_TOP_PADDING + ((clampedNow - timelineStartMinutes) / 60) * HOUR_HEIGHT;
    const targetTop = clamp(
      currentTop - timeline.clientHeight * 0.35,
      0,
      timeline.scrollHeight - timeline.clientHeight
    );
    timeline.scrollTop = targetTop;
  }, [activeDay, editMode, ready]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleAddNewTask(task: Omit<Task, "id">, repeatDays: DayKey[] = [activeDay]) {
    const plan = schedule.plans.find((p) => p.id === task.planId);
    if (!plan) return;
    const linkedTask: Omit<Task, "id"> = {
      ...task,
      planId: plan.id,
      icon: plan.emoji,
      color: plan.color,
    };
    const targetDays = Array.from(new Set(repeatDays.length > 0 ? repeatDays : [activeDay]));
    setSchedule((prev) => ({
      ...prev,
      activities: targetDays.reduce(
        (activities, day) => ({
          ...activities,
          [day]: [...activities[day], { ...linkedTask, id: uid() }],
        }),
        { ...prev.activities }
      ),
    }));
  }

  function handleDeleteTask(taskId: string) {
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [activeDay]: prev.activities[activeDay].filter((t) => t.id !== taskId),
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
    const plan = schedule.plans.find((p) => p.id === editingTask.planId);
    if (!title || !startTime || !endTime || !plan) return;
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
                icon: plan.emoji,
                color: plan.color,
                planId: plan.id,
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
      description: newPlanDescription.trim() || undefined,
      startDate: newPlanStartDate || undefined,
      endDate: newPlanEndDate || undefined,
      category: categoryFromIcon(newPlanIconName),
      emoji: newPlanIconName,
      color: colorFromIcon(newPlanIconName),
      items: [],
      metaFields: newPlanMetaFields,
      summary: createSummaryFromMeta(newPlanMetaFields),
    };
    const trackers: ProgressTracker[] = newPlanMetaFields.map((field) => ({
      id: uid(),
      planId: plan.id,
      title: field,
      type: "number",
      unit: inferUnit(field),
    }));
    setSchedule((prev) => ({
      ...prev,
      plans: [...prev.plans, plan],
      progressTrackers: [...prev.progressTrackers, ...trackers],
    }));
    setNewPlanTitle("");
    setNewPlanDescription("");
    setNewPlanStartDate("");
    setNewPlanEndDate("");
    setNewPlanIconName("brain");
    setNewPlanMetaFields([]);
    setNewPlanMetaInput("");
    setAddingPlan(false);
  }

  function handleDeletePlan(planId: string) {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.filter((plan) => plan.id !== planId),
      activities: Object.fromEntries(
        DAYS.map((day) => [day, prev.activities[day].filter((t) => t.planId !== planId)])
      ) as typeof prev.activities,
      metricEntries: prev.metricEntries.filter((e) => e.planId !== planId),
      progressTrackers: prev.progressTrackers.filter((t) => t.planId !== planId),
    }));
    setSelectedPlanId((cur) => (cur === planId ? null : cur));
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

  function openAddPlan() {
    setActiveTab(1);
    setSelectedPlanId(null);
    setAddingPlan(true);
  }

  function handleAddTracker(planId: string) {
    const title = newTrackerTitle.trim();
    if (!title) return;
    const tracker: ProgressTracker = {
      id: uid(),
      planId,
      title,
      type: "number",
      unit: newTrackerUnit.trim() || undefined,
    };
    setSchedule((prev) => ({ ...prev, progressTrackers: [...prev.progressTrackers, tracker] }));
    setNewTrackerTitle("");
    setNewTrackerUnit("");
    setAddingTracker(false);
    setAddingTrackerForPlanId(null);
  }

  function handleDeleteTracker(trackerId: string) {
    setSchedule((prev) => ({
      ...prev,
      progressTrackers: prev.progressTrackers.filter((t) => t.id !== trackerId),
      metricEntries: prev.metricEntries.filter((e) => e.trackerId !== trackerId),
    }));
  }

  function handleSaveEditTracker(trackerId: string) {
    const title = editTrackerDraft.title.trim();
    if (!title) return;
    setSchedule((prev) => ({
      ...prev,
      progressTrackers: prev.progressTrackers.map((t) =>
        t.id === trackerId
          ? { ...t, title, unit: editTrackerDraft.unit.trim() || undefined }
          : t
      ),
    }));
    setEditingTrackerId(null);
  }

  function handleSaveEditPlan(planId: string) {
    const title = editPlanDraft.title.trim();
    if (!title) return;
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((p) =>
        p.id === planId
          ? {
              ...p,
              title,
              description: editPlanDraft.description.trim() || undefined,
              startDate: editPlanDraft.startDate || undefined,
              endDate: editPlanDraft.endDate || undefined,
            }
          : p
      ),
    }));
    setEditingPlanId(null);
  }

  function handleDeleteLinkedTask(task: Task, activeDays: DayKey[]) {
    const matchKey = `${task.title.trim().toLowerCase()}|${task.startTime}|${task.endTime}`;
    setSchedule((prev) => ({
      ...prev,
      activities: Object.fromEntries(
        DAYS.map((day) => [
          day,
          activeDays.includes(day)
            ? prev.activities[day].filter((t) => {
                const k = `${t.title.trim().toLowerCase()}|${t.startTime}|${t.endTime}`;
                return k !== matchKey || t.planId !== task.planId;
              })
            : prev.activities[day],
        ])
      ) as typeof prev.activities,
    }));
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const storedDayTasks = schedule.activities[activeDay];
  const dayTasks = sortTasksByTime(storedDayTasks);

  const timelineHours = Array.from(
    { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
    (_, i) => TIMELINE_START_HOUR + i
  );
  const timelineStartMinutes = TIMELINE_START_HOUR * 60;
  const timelineEndMinutes = TIMELINE_END_HOUR * 60;
  const timelineHeight =
    TIMELINE_TOP_PADDING +
    (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * HOUR_HEIGHT +
    TIMELINE_BOTTOM_PADDING;
  const showCurrentTime =
    activeDay === todayKey &&
    nowMinutes >= timelineStartMinutes &&
    nowMinutes <= timelineEndMinutes;
  const currentTimeTop =
    TIMELINE_TOP_PADDING + ((nowMinutes - timelineStartMinutes) / 60) * HOUR_HEIGHT;

  const weekDates = getWeekDates(weekOffset);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const weekLabel = weekDates[2].date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const selectedPlan = selectedPlanId
    ? schedule.plans.find((p) => p.id === selectedPlanId) ?? null
    : null;

  function getUniquePlanTasks(planId: string): Array<{ task: Task; activeDays: DayKey[] }> {
    const seen = new Map<string, { task: Task; activeDays: DayKey[] }>();
    for (const day of DAYS) {
      for (const task of schedule.activities[day]) {
        if (task.planId !== planId) continue;
        const key = `${task.title.trim().toLowerCase()}|${task.startTime}|${task.endTime}`;
        if (!seen.has(key)) seen.set(key, { task, activeDays: [day] });
        else seen.get(key)!.activeDays.push(day);
      }
    }
    return Array.from(seen.values());
  }

  function formatPlanRange(plan: Plan): string {
    if (!plan.startDate && !plan.endDate) return "No date range";
    if (plan.startDate && plan.endDate)
      return `${formatPlanDate(plan.startDate)} – ${formatPlanDate(plan.endDate)}`;
    if (plan.startDate) return `Starts ${formatPlanDate(plan.startDate)}`;
    return `Ends ${formatPlanDate(plan.endDate ?? "")}`;
  }

  function getTaskPresentation(task: Task) {
    const linkedPlan = schedule.plans.find((p) => p.id === task.planId) ?? null;
    return {
      linkedPlan,
      iconName: linkedPlan?.emoji ?? task.icon,
      color: linkedPlan?.color ?? task.color,
    };
  }

  function getTimelineTaskLayouts(tasks: Task[]) {
    const intervals = tasks
      .map((task) => {
        const start = parseTimeToMinutes(task.startTime) ?? timelineStartMinutes;
        const end = parseTimeToMinutes(task.endTime) ?? start + 30;
        const cs = clamp(start, timelineStartMinutes, timelineEndMinutes);
        const ce = clamp(Math.max(end, cs + 15), timelineStartMinutes, timelineEndMinutes);
        return {
          task,
          start: cs,
          end: ce,
          top: TIMELINE_TOP_PADDING + ((cs - timelineStartMinutes) / 60) * HOUR_HEIGHT,
          height: ((ce - cs) / 60) * HOUR_HEIGHT,
          lane: 0,
          laneCount: 1,
        };
      })
      .sort((a, b) => a.start - b.start || a.end - b.end || a.task.title.localeCompare(b.task.title));

    const layouts: typeof intervals = [];
    let cluster: typeof intervals = [];
    let laneEnds: number[] = [];
    let clusterEnd = -1;

    function finishCluster() {
      const laneCount = Math.max(1, laneEnds.length);
      cluster.forEach((l) => { l.laneCount = laneCount; layouts.push(l); });
      cluster = []; laneEnds = []; clusterEnd = -1;
    }

    intervals.forEach((layout) => {
      if (cluster.length > 0 && layout.start >= clusterEnd) finishCluster();
      const lane = laneEnds.findIndex((le) => le <= layout.start);
      layout.lane = lane === -1 ? laneEnds.length : lane;
      laneEnds[layout.lane] = layout.end;
      clusterEnd = Math.max(clusterEnd, layout.end);
      cluster.push(layout);
    });
    if (cluster.length > 0) finishCluster();
    return layouts;
  }

  function getTaskLaneStyle(layout: ReturnType<typeof getTimelineTaskLayouts>[number]) {
    const gap = layout.laneCount > 1 ? 5 : 0;
    const width = 100 / layout.laneCount;
    return {
      top: layout.top,
      height: layout.height,
      left: `calc(${layout.lane * width}% + ${layout.lane > 0 ? gap / 2 : 0}px)`,
      width: `calc(${width}% - ${layout.laneCount > 1 ? gap : 0}px)`,
    };
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <main className="min-h-screen bg-neutral-50 flex items-center justify-center dark:bg-neutral-950">
        <div className="h-5 w-5 rounded-full border-2 border-neutral-300 border-t-neutral-700 animate-spin dark:border-white/20 dark:border-t-white/60" />
      </main>
    );
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  function renderTimelineTaskCard(
    task: Task,
    cardClassName: string,
    cardSize: CardSize = "large"
  ) {
    const { linkedPlan, color } = getTaskPresentation(task);
    const tone = timelineCardStyles(color);
    const duration = formatTaskDuration(task.startTime, task.endTime);

    // xsmall: title only, centered
    if (cardSize === "xsmall") {
      return (
        <div className={`${cardClassName} ${tone.cardBg} ${tone.cardBorder} ${tone.shadow}`}>
          <div className="flex h-full items-center min-w-0">
            <span className={`text-[11px] font-semibold leading-none truncate ${tone.title}`}>
              {task.title}
            </span>
          </div>
        </div>
      );
    }

    // small: title + time, vertically centered as a group
    if (cardSize === "small") {
      return (
        <div className={`${cardClassName} ${tone.cardBg} ${tone.cardBorder} ${tone.shadow}`}>
          <div className="flex h-full flex-col justify-center gap-[3px] min-w-0">
            <span className={`text-[12px] font-semibold leading-tight truncate ${tone.title}`}>
              {task.title}
            </span>
            <span className={`text-[9px] font-medium ${tone.time}`}>
              {task.startTime} – {task.endTime}
            </span>
          </div>
        </div>
      );
    }

    // medium: title + time/duration, no plan label
    if (cardSize === "medium") {
      return (
        <div className={`${cardClassName} ${tone.cardBg} ${tone.cardBorder} ${tone.shadow}`}>
          <div className="flex h-full flex-col justify-between min-w-0">
            <h3 className={`text-[13px] font-semibold leading-snug line-clamp-2 ${tone.title}`}>
              {task.title}
            </h3>
            <p className={`text-[10px] font-medium shrink-0 ${tone.time}`}>
              {task.startTime} – {task.endTime}{duration && ` · ${duration}`}
            </p>
          </div>
        </div>
      );
    }

    // large: full layout — plan label → title → time + duration
    return (
      <div className={`${cardClassName} ${tone.cardBg} ${tone.cardBorder} ${tone.shadow}`}>
        <div className="flex flex-col h-full min-w-0">
          {linkedPlan && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500 truncate mb-1.5 shrink-0">
              {linkedPlan.title}
            </p>
          )}
          <h3 className={`text-[14px] font-semibold leading-snug flex-1 min-w-0 line-clamp-3 ${tone.title}`}>
            {task.title}
          </h3>
          <p className={`text-[10px] font-medium mt-auto pt-1.5 shrink-0 ${tone.time}`}>
            {task.startTime} – {task.endTime}{duration && ` · ${duration}`}
          </p>
        </div>
      </div>
    );
  }

  function renderListViewTask(
    task: Task,
    dragHandleProps?: { attributes: Record<string, unknown>; listeners: Record<string, unknown> }
  ) {
    if (editingTaskId === task.id) {
      return (
        <div className="rounded-2xl w-full min-w-0 border border-neutral-200/80 bg-white shadow-sm dark:border-white/[0.08] dark:bg-neutral-900">
          <div className="space-y-3 p-4">
            <p className="text-[13px] font-semibold text-neutral-900 dark:text-white">Edit time block</p>
            {schedule.plans.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Plan</p>
                <div className="flex flex-wrap gap-1.5">
                  {schedule.plans.map((plan) => {
                    const ic = SECTION_ICONS.find((i) => i.name === plan.emoji);
                    const PI = (ic ?? SECTION_ICONS[0]).icon;
                    const sel = editingTask.planId === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() =>
                          setEditingTask((prev) => ({ ...prev, planId: plan.id, icon: plan.emoji, color: plan.color }))
                        }
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                          sel
                            ? `${accentStyles(plan.color).iconSolid} shadow-sm`
                            : `${accentStyles(plan.color).tint} ${accentStyles(plan.color).text} hover:opacity-90`
                        }`}
                      >
                        <PI size={11} strokeWidth={2} />
                        {plan.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <input
                value={editingTask.title}
                onChange={(e) => setEditingTask((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Task title"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditingTask(task.id);
                  if (e.key === "Escape") cancelEditingTask();
                }}
                className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500"
              />
              <input
                value={editingTask.description}
                onChange={(e) => setEditingTask((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Description (optional)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEditingTask(task.id);
                  if (e.key === "Escape") cancelEditingTask();
                }}
                className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500"
              />
            </div>
            <TimeSlotPicker
              startTime={editingTask.startTime}
              endTime={editingTask.endTime}
              onStartChange={(startTime) => setEditingTask((prev) => ({ ...prev, startTime }))}
              onEndChange={(endTime) => setEditingTask((prev) => ({ ...prev, endTime }))}
              activeDay={activeDay}
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => saveEditingTask(task.id)}
                className="inline-flex flex-1 h-10 items-center justify-center gap-1.5 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
              >
                <IconCheck size={15} /> Save
              </button>
              <button
                type="button"
                onClick={cancelEditingTask}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-neutral-200 px-4 text-sm font-medium text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
              >
                <IconX size={15} /> Cancel
              </button>
            </div>
          </div>
        </div>
      );
    }

    const { linkedPlan, color } = getTaskPresentation(task);
    const tone = timelineCardStyles(color);
    const duration = formatTaskDuration(task.startTime, task.endTime);

    return (
      <div
        className={`flex flex-col gap-1 rounded-2xl border bg-white px-4 py-3.5 shadow-[0_1px_6px_rgba(0,0,0,0.04)] transition-all duration-200 dark:bg-neutral-900 ${tone.cardBorder} ${editMode && dragHandleProps ? "cursor-grab active:cursor-grabbing" : ""}`}
        {...(editMode && dragHandleProps ? { ...dragHandleProps.attributes, ...dragHandleProps.listeners } : {})}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {linkedPlan && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500 mb-1">
                {linkedPlan.title}
              </p>
            )}
            <p className="text-[17px] font-semibold leading-snug text-neutral-900 dark:text-white">
              {task.title}
            </p>
            <p className={`text-[12px] font-medium mt-1 ${tone.time}`}>
              {task.startTime} – {task.endTime}{duration && ` · ${duration}`}
            </p>
          </div>
          {editMode && (
            <div className="flex shrink-0 items-center gap-0.5 -mt-0.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); startEditingTask(task); }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              >
                <IconEdit size={15} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
              >
                <IconTrash size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderLinkedTaskCard(task: Task, activeDays: DayKey[]) {
    const { color } = getTaskPresentation(task);
    const tone = timelineCardStyles(color);
    const duration = formatTaskDuration(task.startTime, task.endTime);

    return (
      <div
        key={`${task.id}-${activeDays.join("")}`}
        className="flex items-center gap-3 px-1 py-3.5 border-b border-neutral-100 last:border-b-0 dark:border-white/[0.05]"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold leading-tight text-neutral-900 dark:text-white">
            {task.title}
          </p>
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <p className={`text-[14px] font-medium shrink-0 text-neutral-700 dark:text-neutral-400 ${tone.time}`}>
              {task.startTime} – {task.endTime}{duration && ` · ${duration}`}
            </p>
            <div className="flex items-center gap-[8px]">
              {WEEKDAY_ORDER.map((day) => {
                const isActive = activeDays.includes(day);
                return (
                  <span
                    key={day}
                    className={`text-[12px] font-bold px-1.5 py-1.5 rounded-[4px] transition-colors ${
                      isActive
                        ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                        : "text-neutral-500 dark:text-neutral-500"
                    }`}
                  >
                    {WEEKDAY_SHORT[day]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleDeleteLinkedTask(task, activeDays)}
          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-neutral-400 hover:text-rose-500 dark:text-neutral-600 dark:hover:text-rose-400 transition-colors"
        >
          <IconTrash size={20} />
        </button>
      </div>
    );
  }

  // ─── Add Plan Sheet ────────────────────────────────────────────────────────

  function renderAddPlanSheet() {
    return (
      <div className="space-y-4 p-5 pb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">New</p>
            <h2 className="text-[18px] font-semibold text-neutral-950 dark:text-white mt-0.5">Create Plan</h2>
          </div>
          <button
            type="button"
            onClick={() => setAddingPlan(false)}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5"
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="space-y-2.5">
          <input
            value={newPlanTitle}
            onChange={(e) => setNewPlanTitle(e.target.value)}
            placeholder="Plan title"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && newPlanTitle.trim()) handleAddPlan(); }}
            className="
            h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]
            "
          />
          <input
            value={newPlanDescription}
            onChange={(e) => setNewPlanDescription(e.target.value)}
            placeholder="Short description (optional)"
            className="
            h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]
            "
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Start date</p>
              <input
                type="date"
                value={newPlanStartDate}
                onChange={(e) => setNewPlanStartDate(e.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none focus:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">End date</p>
              <input
                type="date"
                value={newPlanEndDate}
                onChange={(e) => setNewPlanEndDate(e.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none focus:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Icon</p>
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
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl py-3 transition-all duration-150 ${
                    sel ? `${ic.solid} shadow-sm scale-[1.04]` : `${ic.tint} ${ic.text} hover:scale-[1.04]`
                  }`}
                >
                  <Icon size={18} strokeWidth={1.5} />
                  <span className={`text-[9px] font-semibold leading-none ${sel ? "text-white/80" : ""}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            Progress trackers <span className="normal-case font-normal text-neutral-400">(optional)</span>
          </p>
          <div className="flex gap-2">
            <input
              value={newPlanMetaInput}
              onChange={(e) => setNewPlanMetaInput(e.target.value)}
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
              placeholder="e.g. Weight, Running Distance…"
              className="
              h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]
              "
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
            >
              <IconPlus size={16} />
            </button>
          </div>
          {newPlanMetaFields.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {newPlanMetaFields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[12px] font-medium text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300"
                >
                  {field}
                  <button
                    type="button"
                    onClick={() => setNewPlanMetaFields((prev) => prev.filter((f) => f !== field))}
                    className="opacity-50 hover:opacity-100 hover:text-red-500 transition-opacity"
                  >
                    <IconX size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleAddPlan}
          disabled={!newPlanTitle.trim()}
          className="h-12 w-full rounded-2xl bg-neutral-950 text-white text-[15px] font-semibold transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100"
        >
          Create New Plan
        </button>
      </div>
    );
  }

  // ─── Plan list ─────────────────────────────────────────────────────────────

  function renderPlanList() {
    return (
      <div className="px-4 pt-5 pb-8">
        {/* Title section */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
              Stay on track
            </p>
            <h1 className="mt-1 text-[22px] font-semibold text-neutral-950 dark:text-white leading-tight">
              My Plans
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setAddingPlan(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 h-9 text-[12px] font-semibold text-neutral-700 transition-all hover:bg-neutral-50 active:scale-95 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5"
          >
            <IconPlus size={14} strokeWidth={2.5} />
            Add New Plan
          </button>
        </div>

        {/* Empty state */}
        {schedule.plans.length === 0 && (
          <div className="rounded-[28px] border border-dashed border-neutral-200 p-10 text-center dark:border-white/10">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.07] mx-auto">
              <IconClipboardList size={22} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <p className="text-[15px] font-semibold text-neutral-700 dark:text-neutral-300">No plans yet</p>
            <p className="mt-1 text-[13px] text-neutral-400 dark:text-neutral-500 max-w-[200px] mx-auto">
              Create your first plan to organize activities and track progress.
            </p>
          </div>
        )}

        {/* Plan cards */}
        <div className="space-y-3">
          {schedule.plans.map((plan) => {
            const uniqueTasks = getUniquePlanTasks(plan.id);
            const trackerCount = schedule.progressTrackers.filter(
              (t) => t.planId === plan.id
            ).length;
            const planAccent = accentStyles(plan.color);
            const planIconEntry = SECTION_ICONS.find((e) => e.name === plan.emoji) ?? SECTION_ICONS[0];
            const PlanIcon = planIconEntry.icon;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className="w-full rounded-[24px] border border-neutral-200 bg-white p-5 text-left shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all hover:border-neutral-300 hover:shadow-[0_4px_20px_rgba(0,0,0,0.07)] active:scale-[0.99] dark:border-white/10 dark:bg-neutral-900 dark:hover:border-white/20"
              >
                {/* Top row: icon + title */}
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center ${planAccent.tint} ${planAccent.icon}`}>
                    <PlanIcon size={18} strokeWidth={1.8} />
                  </div>
                  <h2 className="text-[17px] font-semibold text-neutral-950 dark:text-white leading-snug flex-1 min-w-0 truncate">
                    {plan.title}
                  </h2>
                </div>

                {/* Date range */}
                {(plan.startDate || plan.endDate) && (
                  <p className="mt-3 text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                    {formatPlanRange(plan)}
                  </p>
                )}

                {/* Description */}
                {plan.description && (
                  <p className="mt-2 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400 line-clamp-2">
                    {plan.description}
                  </p>
                )}

                {/* Divider */}
                <div className="mt-4 mb-3.5 border-t border-neutral-100 dark:border-white/[0.06]" />

                {/* Bottom: counts */}
                <div className="flex items-center gap-5">
                  <span className="text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                    {uniqueTasks.length} {uniqueTasks.length === 1 ? "activity" : "activities"}
                  </span>
                  {trackerCount > 0 && (
                    <span className="text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                      {trackerCount} {trackerCount === 1 ? "tracker" : "trackers"}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Plan detail ───────────────────────────────────────────────────────────

  function renderPlanDetail(plan: Plan) {
    const uniqueTasks = getUniquePlanTasks(plan.id);
    const trackers = schedule.progressTrackers.filter((t) => t.planId === plan.id);

    return (
      <div className="pb-32">
        {/* HERO */}
        <div className="px-4 pt-6 space-y-3">
          <h1 className="text-[40px] font-bold leading-tight text-neutral-950 dark:text-white">
            {plan.title}
          </h1>
          {(plan.startDate || plan.endDate) && (
            <p className="text-[16px] font-semibold text-neutral-500 dark:text-neutral-400">
              {formatPlanRange(plan)}
            </p>
          )}
          {plan.description && (
            <p className="text-[18px] leading-relaxed text-neutral-800 dark:text-neutral-200">
              {plan.description}
            </p>
          )}
        </div>

        {/* LINKED TASKS */}
        <section className="mt-8 px-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                Linked
              </p>
              <h2 className="text-[16px] font-semibold text-neutral-950 dark:text-white mt-0.5">
                Planned Tasks
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setAddTaskModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
            >
              <IconPlus size={16} strokeWidth={2} />
              Add Task
            </button>
          </div>

          <div className="rounded-[24px] border border-neutral-200 bg-white px-4 dark:border-white/[0.08] dark:bg-neutral-900">
            {uniqueTasks.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[14px] font-medium text-neutral-400 dark:text-neutral-500 max-w-[220px] mx-auto">
                  Link activities to this plan to keep everything connected.
                </p>
              </div>
            ) : (
              uniqueTasks.map(({ task, activeDays }) =>
                renderLinkedTaskCard(task, activeDays)
              )
            )}
          </div>
        </section>

        {/* PROGRESS TRACKING */}
        <section className="mt-8 px-4">
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                Plan Progress
              </p>
              <h2 className="text-[16px] font-semibold text-neutral-950 dark:text-white mt-0.5">
                Metrics and trends
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setAddingTrackerForPlanId(plan.id);
                setAddingTracker(true);
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
            >
              <IconPlus size={16} strokeWidth={2} />
              Add Tracker
            </button>
          </div>

          {trackers.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-neutral-200 py-10 text-center dark:border-white/[0.08]">
              <p className="text-[14px] font-medium text-neutral-400 dark:text-neutral-500">
                No progress trackers yet.
              </p>
              <button
                type="button"
                onClick={() => {
                  setAddingTrackerForPlanId(plan.id);
                  setAddingTracker(true);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-4 py-2 text-[13px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/[0.04] transition-colors"
              >
                <IconPlus size={16} strokeWidth={2} />
                Create Tracker
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {trackers.map((tracker) => {
                const entries = schedule.metricEntries
                  .filter((e) => e.trackerId === tracker.id)
                  .sort((a, b) => a.date.localeCompare(b.date));
                const lastTwo = entries.slice(-2);
                const trend =
                  lastTwo.length === 2 && lastTwo[0].value !== 0
                    ? ((lastTwo[1].value - lastTwo[0].value) / Math.abs(lastTwo[0].value)) * 100
                    : null;
                const isEditingThisTracker = editingTrackerId === tracker.id;

                return (
                  <div
                    key={tracker.id}
                    className="rounded-[24px] border border-neutral-200 bg-white overflow-hidden dark:border-white/[0.08] dark:bg-neutral-900"
                  >
                    {/* Tracker header */}
                    <div className="px-5 pt-5 pb-4">
                      {isEditingThisTracker ? (
                        <div className="space-y-2">
                          <input
                            value={editTrackerDraft.title}
                            onChange={(e) => setEditTrackerDraft((d) => ({ ...d, title: e.target.value }))}
                            placeholder="Tracker name"
                            autoFocus
                            className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                          />
                          <input
                            value={editTrackerDraft.unit}
                            onChange={(e) => setEditTrackerDraft((d) => ({ ...d, unit: e.target.value }))}
                            placeholder="Unit (e.g. kg, km, hr)"
                            className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] text-neutral-700 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300"
                          />
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEditTracker(tracker.id)}
                              className="inline-flex flex-1 h-9 items-center justify-center gap-1 rounded-xl bg-neutral-950 text-[13px] font-semibold text-white dark:bg-white dark:text-neutral-950"
                            >
                              <IconCheck size={16} /> Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTrackerId(null)}
                              className="inline-flex h-9 px-4 items-center gap-1 rounded-xl border border-neutral-200 text-[13px] font-medium text-neutral-500 dark:border-white/10 dark:text-neutral-400"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
                              Plan
                            </p>
                            <h3 className="text-[20px] font-semibold text-neutral-950 dark:text-white mt-0.5 leading-tight">
                              {tracker.title}
                              {tracker.unit && (
                                <span className="ml-1.5 text-[15px] font-normal text-neutral-400">
                                  ({tracker.unit})
                                </span>
                              )}
                            </h3>
                            {trend !== null && (
                              <div className="flex items-center gap-1 mt-1.5">
                                {trend >= 0 ? (
                                  <IconTrendingUp size={14} className="text-emerald-500 shrink-0" />
                                ) : (
                                  <IconTrendingDown size={14} className="text-rose-500 shrink-0" />
                                )}
                                <p className={`text-[12px] font-medium ${trend >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                  Trending {trend >= 0 ? "up" : "down"} by {Math.abs(trend).toFixed(1)}% from last entry
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0 -mt-0.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTrackerId(tracker.id);
                                setEditTrackerDraft({ title: tracker.title, unit: tracker.unit ?? "" });
                              }}
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
                            >
                              <IconEdit size={16} strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTracker(tracker.id)}
                              className="h-8 w-8 flex items-center justify-center rounded-lg text-neutral-400 hover:text-rose-500 dark:text-neutral-500 dark:hover:text-rose-400 transition-colors"
                            >
                              <IconTrash size={16} strokeWidth={2} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Chart */}
                    {!isEditingThisTracker && (
                      <div className="px-3 pb-3">
                        {entries.length > 0 ? (
                          <ProgressChart
                            entries={entries}
                            color={plan.color}
                            metric={{ name: tracker.title, unit: tracker.unit ?? "" }}
                          />
                        ) : (
                          <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] py-8 text-center text-[13px] text-neutral-400 dark:text-neutral-500">
                            No entries yet
                          </div>
                        )}
                      </div>
                    )}

                    {/* Recent entries */}
                    {!isEditingThisTracker && (
                      <div className="border-t border-neutral-100 dark:border-white/[0.06] px-5 pb-5">
                        <div className="flex items-center justify-between py-3.5">
                          <p className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                            Recent entries
                          </p>
                          <button
                            type="button"
                            onClick={() => setEntryTracker(tracker)}
                            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
                          >
                            <IconPlus size={12} strokeWidth={2} />
                            Add Entry
                          </button>
                        </div>
                        {entries.length === 0 ? (
                          <p className="text-[12px] text-neutral-400 dark:text-neutral-500 pb-1">
                            Tap Add Entry to start tracking.
                          </p>
                        ) : (
                          entries
                            .slice(-5)
                            .reverse()
                            .map((entry, index) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between py-2.5 border-b border-neutral-100 last:border-b-0 dark:border-white/[0.06]"
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-[11px] font-bold text-neutral-300 dark:text-neutral-700 w-4 text-center tabular-nums">
                                    {entries.length - index}
                                  </span>
                                  <p className="text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
                                    {formatEntryDate(entry.date)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[15px] font-semibold text-neutral-950 dark:text-white tabular-nums">
                                    {entry.value}
                                    {tracker.unit && (
                                      <span className="text-[11px] font-medium text-neutral-400 ml-1">
                                        {tracker.unit}
                                      </span>
                                    )}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEntry(entry.id)}
                                    className="h-6 w-6 flex items-center justify-center rounded-lg text-neutral-300 hover:text-rose-500 dark:text-neutral-700 dark:hover:text-rose-400 transition-colors"
                                  >
                                    <IconTrash size={16} strokeWidth={2} />
                                  </button>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ─── Timeline layouts ──────────────────────────────────────────────────────

  const timelineTaskLayouts = getTimelineTaskLayouts(dayTasks);

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {selectedPlan ? (
        <AppHeader
          back={{ label: "Plans", onBack: () => setSelectedPlanId(null) }}
          actions={[
            {
              icon: IconEdit,
              label: "Edit plan",
              onClick: () => {
                setEditingPlanId(selectedPlan.id);
                setEditPlanDraft({
                  title: selectedPlan.title,
                  description: selectedPlan.description ?? "",
                  startDate: selectedPlan.startDate ?? "",
                  endDate: selectedPlan.endDate ?? "",
                });
              },
            },
            {
              icon: IconTrash,
              label: "Delete plan",
              destructive: true,
              onClick: () => handleDeletePlan(selectedPlan.id),
            },
          ]}
        />
      ) : (
        <AppHeader />
      )}

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto pb-40">

        {/* ── Activity Tab ─────────────────────────────────────────────────── */}
        {activeTab === 0 && (
          <div>
            {/* Calendar */}
            <div className="px-4 pt-4">
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] dark:border-white/[0.08] dark:bg-neutral-900">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[16px] font-semibold text-neutral-900 dark:text-white">
                    {weekLabel}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => setWeekOffset((w) => w - 1)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.07] transition-colors"
                    >
                      <IconChevronLeft size={20} strokeWidth={2} />
                    </button>
                  
              
                    <button
                      type="button"
                      onClick={() => setWeekOffset((w) => w + 1)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.07] transition-colors"
                    >
                      <IconChevronRight size={20} strokeWidth={2} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDates.map(({ day, date }) => {
                    const isDateToday = date.getTime() === todayMidnight.getTime();
                    const isActive = day === activeDay;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setActiveDay(day)}
                        className={`flex flex-col items-center justify-center gap-3 w-full rounded-lg py-2 h-[64px] transition-all duration-200 ${
                          isActive
                            ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                            : isDateToday
                              ? "bg-neutral-200 text-neutral-700 dark:bg-white/10 dark:text-neutral-200"
                              : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <span
                          className={`text-[12px] font-medium leading-none ${
                            isActive ? "opacity-60" : "opacity-50"
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </span>
                        <span className="text-[14px] font-medium leading-none">{date.getDate()}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Title section */}
            <div className="flex items-center justify-between px-4 pt-5 pb-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
                  My Schedule
                </p>
                <h2 className="text-[16px] font-semibold text-neutral-950 dark:text-white leading-tight mt-0.5">
                  Today&apos;s Task
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setViewMode((v) => (v === "list" ? "timeline" : "list")); setEditMode(false); }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 h-9 text-[12px] font-semibold text-neutral-700 transition-all hover:bg-neutral-50 active:scale-95 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5"
                >
                  {viewMode === "timeline" ? (
                    <><IconLayoutList size={16} strokeWidth={2} /> List</>
                  ) : (
                    <><IconTable size={16} strokeWidth={2} /> Timeline</>
                  )}
                </button>
                {dayTasks.length > 0 && viewMode === "list" && (
                  <motion.button
                    type="button"
                    onClick={() => setEditMode((prev) => !prev)}
                    whileTap={{ scale: 0.95 }}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                      editMode
                        ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                        : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/5"
                    }`}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {editMode ? (
                        <motion.span
                          key="check"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15 }}
                        >
                          <IconCheck size={16} strokeWidth={2.5} />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="edit"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.15 }}
                        >
                          <IconEdit size={16} strokeWidth={2} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                )}
              </div>
            </div>

            {/* Task content */}
            <div className="px-4">
              <AnimatePresence mode="wait" initial={false}>
                {viewMode === "list" ? (
                  <motion.div
                    key="list"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {dayTasks.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-neutral-200 py-12 text-center text-[13px] text-neutral-400 dark:border-white/10 dark:text-neutral-500">
                        {schedule.plans.length === 0
                          ? "Create a plan first, then add activities."
                          : "Nothing scheduled — tap + to add your first activity."}
                      </div>
                    ) : editMode ? (
                      <DndContext sensors={sensors} onDragEnd={handleTasksDragEnd}>
                        <SortableContext items={dayTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                          <div className="flex flex-col gap-3 pb-4">
                            {dayTasks.map((task) => (
                              <SortableTaskCard key={task.id} task={task}>
                                {(dragHandleProps) => (
                                  <div className="w-full min-w-0 animate-panel-in">
                                    {renderListViewTask(task, dragHandleProps)}
                                  </div>
                                )}
                              </SortableTaskCard>
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="flex flex-col gap-3 pb-4">
                        {dayTasks.map((task) => (
                          <div key={task.id} className="animate-panel-in">
                            {renderListViewTask(task)}
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="timeline"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {dayTasks.length === 0 && (
                      <div className="mb-3 rounded-2xl border border-dashed border-neutral-200 py-8 text-center text-[13px] text-neutral-400 dark:border-white/10 dark:text-neutral-500">
                        Nothing scheduled — tap + to add your first activity.
                      </div>
                    )}
                    <div
                      ref={timelineScrollRef}
                      className="calendar-scrollbar-none relative flex max-h-[72vh] overflow-y-auto overflow-x-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-white/[0.06] dark:bg-neutral-900"
                    >
                      {/* Hour labels */}
                      <div
                        className="sticky left-0 z-20 w-[52px] shrink-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm"
                        style={{ height: timelineHeight }}
                      >
                        {timelineHours.map((hour, index) => (
                          <span
                            key={hour}
                            className="absolute right-2 text-[10px] font-medium text-neutral-400 dark:text-neutral-500 tabular-nums"
                            style={{
                              top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT - (index === 0 ? 0 : 9),
                            }}
                          >
                            {formatHourLabel(hour)}
                          </span>
                        ))}
                      </div>
                      {/* Grid + tasks */}
                      <div
                        className="relative min-w-0 flex-1 border-l border-neutral-100 dark:border-white/[0.04]"
                        style={{ height: timelineHeight }}
                      >
                        {/* Hour grid lines */}
                        <div className="absolute inset-0 pointer-events-none">
                          {timelineHours.map((hour, index) => (
                            <div
                              key={`grid-${hour}`}
                              className="absolute left-0 right-0 border-t border-neutral-100 dark:border-white/[0.04]"
                              style={{ top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT }}
                            />
                          ))}
                          {/* Half-hour tick lines */}
                          {timelineHours.slice(0, -1).map((hour, index) => (
                            <div
                              key={`half-${hour}`}
                              className="absolute right-0 h-px bg-neutral-100/70 dark:bg-white/[0.025]"
                              style={{
                                top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT + HOUR_HEIGHT / 2,
                                left: "10%",
                              }}
                            />
                          ))}
                        </div>
                        {/* Task cards */}
                        <div className="absolute inset-0">
                          {timelineTaskLayouts.map((layout) => (
                            <div
                              key={layout.task.id}
                              className="absolute min-w-0 px-1.5 py-0.5 animate-panel-in"
                              style={getTaskLaneStyle(layout)}
                            >
                              <div className="relative h-full min-h-[36px] rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.07)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.28)]">
                                {renderTimelineTaskCard(
                                  layout.task,
                                  "h-full rounded-2xl p-2.5 w-full min-w-0 border overflow-hidden",
                                  computeCardSize(layout.height, layout.laneCount)
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Current time indicator */}
                        {showCurrentTime && (
                          <div
                            className="pointer-events-none absolute left-0 right-0 z-30 flex -translate-y-1/2 items-center"
                            style={{ top: currentTimeTop }}
                          >
                            <div className="-ml-1 h-2 w-2 shrink-0 rounded-full bg-red-500 ring-[3px] ring-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                            <div className="h-px flex-1 bg-gradient-to-r from-red-400/80 to-red-400/0" />
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* ── Plan Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 1 && (
          selectedPlan ? renderPlanDetail(selectedPlan) : renderPlanList()
        )}
      </div>

      {/* ── Edit Plan Bottom Sheet ─────────────────────────────────────────── */}
      <AnimatePresence>
        {editingPlanId && (
          <motion.div
            key="edit-plan-sheet"
            className="fixed inset-0 z-50 flex items-end justify-center"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setEditingPlanId(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.9 }}
              className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-t-[32px] shadow-[0_-8px_40px_rgba(0,0,0,0.12)] max-h-[80vh] overflow-y-auto"
            >
              <div className="sticky top-0 z-10 flex justify-center pt-3 pb-1 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm rounded-t-[32px]">
                <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
              </div>
              <div className="space-y-4 p-5 pb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">Edit</p>
                    <h2 className="text-[18px] font-semibold text-neutral-950 dark:text-white mt-0.5">Plan Details</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingPlanId(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    <IconX size={16} />
                  </button>
                </div>
                <div className="space-y-2.5">
                  <input
                    value={editPlanDraft.title}
                    onChange={(e) => setEditPlanDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Plan title"
                    autoFocus
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500"
                  />
                  <input
                    value={editPlanDraft.description}
                    onChange={(e) => setEditPlanDraft((d) => ({ ...d, description: e.target.value }))}
                    placeholder="Short description (optional)"
                    className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Start date</p>
                      <input
                        type="date"
                        value={editPlanDraft.startDate}
                        onChange={(e) => setEditPlanDraft((d) => ({ ...d, startDate: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none focus:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                      />
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">End date</p>
                      <input
                        type="date"
                        value={editPlanDraft.endDate}
                        onChange={(e) => setEditPlanDraft((d) => ({ ...d, endDate: e.target.value }))}
                        className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none focus:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveEditPlan(editingPlanId)}
                  disabled={!editPlanDraft.title.trim()}
                  className="h-12 w-full rounded-2xl bg-neutral-950 text-white text-[15px] font-semibold transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add Tracker Bottom Sheet ────────────────────────────────────────── */}
      <AnimatePresence>
        {addingTracker && addingTrackerForPlanId && (
          <motion.div
            key="add-tracker-sheet"
            className="fixed inset-0 z-50 flex items-end justify-center"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => { setAddingTracker(false); setAddingTrackerForPlanId(null); }}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.9 }}
              className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-t-[32px] shadow-[0_-8px_40px_rgba(0,0,0,0.12)]"
            >
              <div className="sticky top-0 z-10 flex justify-center pt-3 pb-1 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm rounded-t-[32px]">
                <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
              </div>
              <div className="space-y-4 p-5 pb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">New</p>
                    <h2 className="text-[18px] font-semibold text-neutral-950 dark:text-white mt-0.5">Create Tracker</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setAddingTracker(false); setAddingTrackerForPlanId(null); }}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 hover:bg-neutral-50 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    <IconX size={16} />
                  </button>
                </div>
                <div className="space-y-2.5">
                  <input
                    value={newTrackerTitle}
                    onChange={(e) => setNewTrackerTitle(e.target.value)}
                    placeholder="Tracker name (e.g. Weight, Distance)"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter" && newTrackerTitle.trim()) handleAddTracker(addingTrackerForPlanId); }}
                    className="
                   h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]"
                  />
                  <input
                    value={newTrackerUnit}
                    onChange={(e) => setNewTrackerUnit(e.target.value)}
                    placeholder="Unit (e.g. kg, km, hr) — optional"
                    className="
                   h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[15px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/15 dark:focus:bg-white/[0.06]"
                  />
                </div>
                <div className="rounded-2xl bg-neutral-50 dark:bg-white/[0.04] px-4 py-3">
                  <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 mb-1.5">Examples</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[["Weight", "kg"], ["Distance", "km"], ["Study Hours", "hr"], ["Calories", "kcal"], ["Water", "ml"]].map(([name, unit]) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => { setNewTrackerTitle(name); setNewTrackerUnit(unit); }}
                        className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 transition-colors"
                      >
                        {name} / {unit}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAddTracker(addingTrackerForPlanId)}
                  disabled={!newTrackerTitle.trim()}
                  className="h-12 w-full rounded-2xl bg-neutral-950 text-white text-[15px] font-semibold transition-all hover:bg-neutral-800 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100"
                >
                  Create Tracker
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add Plan Bottom Sheet ───────────────────────────────────────────── */}
      <AnimatePresence>
        {addingPlan && (
          <motion.div
            key="add-plan-sheet"
            className="fixed inset-0 z-50 flex items-end justify-center"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setAddingPlan(false)}
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.9 }}
              className="relative w-full max-w-lg bg-white dark:bg-neutral-900 rounded-t-[32px] shadow-[0_-8px_40px_rgba(0,0,0,0.12)] max-h-[88vh] overflow-y-auto"
            >
              <div className="sticky top-0 z-10 flex justify-center pt-3 pb-1 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm rounded-t-[32px]">
                <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
              </div>
              {renderAddPlanSheet()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom Nav ─────────────────────────────────────────────────────── */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
        onCreateTask={() => setAddTaskModalOpen(true)}
        onCreatePlan={openAddPlan}
      />

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <AddTaskModal
        isOpen={addTaskModalOpen}
        onClose={() => setAddTaskModalOpen(false)}
        onSave={handleAddNewTask}
        plans={schedule.plans}
        activeDay={activeDay}
        initialPlanId={selectedPlanId}
      />

      <AddEntryModal
        isOpen={!!entryTracker}
        onClose={() => setEntryTracker(null)}
        onSave={(value, date) => {
          if (!entryTracker) return;
          handleAddEntry({
            planId: entryTracker.planId,
            trackerId: entryTracker.id,
            value,
            date,
          });
        }}
        metric={
          entryTracker
            ? { name: entryTracker.title, unit: entryTracker.unit ?? "" }
            : undefined
        }
      />
    </main>
  );
}
