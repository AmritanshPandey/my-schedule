"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AddEntryModal from "@/components/AddEntryModal";
import { TaskSheet, type TaskSaveData } from "@/components/task/TaskSheet";
import PlanDetailView from "@/components/plan/PlanDetailView";
import { PlanCard } from "@/components/plan/PlanCard";
import AppHeader from "@/components/AppHeader";
import { SettingsSheet } from "@/components/auth/SettingsSheet";
import BottomNav from "@/components/BottomNav";
import TimeSlotPicker from "@/components/TimeSlotPicker";
import {
  useScheduleDB,
  DAYS,
  DAY_LABELS,
  DayKey,
  MetricEntry,
  Milestone,
  Plan,
  ProgressTracker,
  SummaryConfig,
  Task,
  categoryFromIcon,
} from "@/lib/useScheduleDB";
import {
  colorFromIcon,
  timelineCardStyles,
} from "@/lib/colorSystem";
import { SECTION_ICONS, getIconPickerStyle } from "@/components/SectionIcons";
import {
  IconCheck,
  IconChevronLeft,
  IconCalendar,
  IconChevronRight,
  IconClipboardList,
  IconEdit,
  IconLayoutList,
  IconMinus,
  IconPlus,
  IconTable,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { ListTaskCard } from "@/components/activity/ListTaskCard";
import {
  toggleTaskComplete,
  toggleSubtaskComplete,
  isTaskCompleted,
  resolveTaskState,
} from "@/lib/taskCompletion";
import { createTask, updateTask, deleteTask, uid } from "@/lib/taskMutations";
import { applyTemplate } from "@/lib/templates";
import { TemplatesSheet } from "@/components/TemplatesSheet";
import type { Template } from "@/lib/templates";
import { parseTimeToMinutes, formatDuration } from "@/lib/timeUtils";
import { todayISO, daysBetween as daysBetweenUtil, formatDate } from "@/lib/dateUtils";
import { getPlanCardStats } from "@/lib/planInsights";
import { MainTitleSection, IconActionButton, CtaActionButton } from "@/components/ui/MainTitleSection";
import { cycleAccentColor } from "@/components/ui/Badge";

// ─── Constants ───────────────────────────────────────────────────────────────

const PLAN_DURATION_PRESETS: { label: string; days: number | null }[] = [
  { label: "15 days", days: 15 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
  { label: "Ongoing", days: null },
];

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}


const daysBetween = daysBetweenUtil;

const TIMELINE_START_HOUR = 4;
const TIMELINE_END_HOUR = 28; // extends to 4 AM next day for overnight tasks
const HOUR_HEIGHT = 112;
const TIMELINE_TOP_PADDING = 20;
const TIMELINE_BOTTOM_PADDING = 40;
const TIMELINE_START_MINUTES = TIMELINE_START_HOUR * 60;
const TIMELINE_END_MINUTES = TIMELINE_END_HOUR * 60;
const TIMELINE_HEIGHT =
  TIMELINE_TOP_PADDING +
  (TIMELINE_END_HOUR - TIMELINE_START_HOUR) * HOUR_HEIGHT +
  TIMELINE_BOTTOM_PADDING;
const TIMELINE_HOURS: number[] = Array.from(
  { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
  (_, i) => TIMELINE_START_HOUR + i
);

const JS_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;


// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPlanDate = formatDate;

function inferUnit(label: string): string {
  const key = label.toLowerCase();
  if (key.includes("calorie")) return "kcal";
  if (key.includes("protein") || key.includes("carb") || /\bfat\b/.test(key)) return "g";
  if (key.includes("duration") || key.includes("time")) return "min";
  if (key.includes("weight")) return "kg";
  return "";
}

function stableFieldHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function createSummaryFromMeta(metaFields: string[]): SummaryConfig[] {
  return metaFields.map((field) => ({
    label: field,
    metaKey: field,
    unit: inferUnit(field),
    colorClass: `accent-${cycleAccentColor(stableFieldHash(field))}`,
  }));
}

const formatTaskDuration = formatDuration;

function formatHourLabel(hour24: number): string {
  const normalizedHour = hour24 % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const hour = normalizedHour % 12 || 12;
  return `${hour} ${suffix}`;
}


function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type CardSize = "xsmall" | "small" | "medium" | "large";

function computeCardSize(height: number, laneCount: number): CardSize {
  // HOUR_HEIGHT = 112 → 30 min = 56px, 45 min = 84px, 60 min = 112px
  // xsmall: title only              — card < 58px  (< ~31 min)
  // small:  plan label + title      — card < 86px  (< ~46 min)
  // medium: plan+title+time+dur     — card < 112px (< 60 min)
  // large:  full layout, roomy      — card ≥ 112px (≥ 60 min)
  let size: CardSize;
  if (height < 58) size = "xsmall";
  else if (height < 86) size = "small";
  else if (height < 112) size = "medium";
  else size = "large";

  // Degrade by laneCount — medium height cards stay readable in multi-lane layouts
  if (laneCount >= 3) {
    if (size === "large") size = "small";
    else if (size === "medium") size = "small";
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
    if (lm === null && rm === null) {
      const lso = left.sortOrder ?? Infinity;
      const rso = right.sortOrder ?? Infinity;
      return lso !== rso ? lso - rso : left.title.localeCompare(right.title);
    }
    if (lm === null) return 1;
    if (rm === null) return -1;
    if (lm !== rm) return lm - rm;
    const le = parseTimeToMinutes(left.endTime) ?? lm;
    const re = parseTimeToMinutes(right.endTime) ?? rm;
    if (le !== re) return le - re;
    // Use sortOrder as stable tiebreaker for tasks with identical times
    const lso = left.sortOrder ?? Infinity;
    const rso = right.sortOrder ?? Infinity;
    return lso !== rso ? lso - rso : left.title.localeCompare(right.title);
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
  const { schedule, setSchedule, ready, clearData, isFirstLaunch } = useScheduleDB();
  const [todayKey, setTodayKey] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [taskSheetMode, setTaskSheetMode] = useState<"create" | "edit">("create");
  const [taskSheetTask, setTaskSheetTask] = useState<Task | null>(null);
  const [taskSheetPlanId, setTaskSheetPlanId] = useState<string | null>(null);

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [entryTracker, setEntryTracker] = useState<ProgressTracker | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "timeline">("timeline");

  const [addingPlan, setAddingPlan] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [newPlanDescription, setNewPlanDescription] = useState("");
  const [newPlanStartDate, setNewPlanStartDate] = useState("");
  const [newPlanEndDate, setNewPlanEndDate] = useState("");
  const [newPlanIconName, setNewPlanIconName] = useState("brain");
  const [newPlanMetaFields, setNewPlanMetaFields] = useState<string[]>([]);
  const [newPlanMetaInput, setNewPlanMetaInput] = useState("");

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPlanDraft, setEditPlanDraft] = useState({ title: "", description: "", startDate: "", endDate: "" });

  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const hasUserScrolledTimelineRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 12 } }));

  useEffect(() => {
    hasUserScrolledTimelineRef.current = false;
  }, [activeDay]);

  useEffect(() => {
    if (
      !ready ||
      activeTab !== 0 ||
      viewMode !== "timeline" ||
      activeDay !== todayKey ||
      editMode ||
      hasUserScrolledTimelineRef.current
    ) {
      return;
    }

    const id = requestAnimationFrame(() => {
      const timeline = timelineScrollRef.current;

      if (!timeline) return;

      const clampedNow = clamp(
        getCurrentMinutes(),
        TIMELINE_START_MINUTES,
        TIMELINE_END_MINUTES
      );

      const currentTop =
        TIMELINE_TOP_PADDING +
        ((clampedNow - TIMELINE_START_MINUTES) / 60) * HOUR_HEIGHT;

      const visibleCenterOffset = 140;

      const targetTop = clamp(
        currentTop - timeline.clientHeight / 2 + visibleCenterOffset,
        0,
        timeline.scrollHeight - timeline.clientHeight
      );

      isAutoScrollingRef.current = true;

      timeline.scrollTo({
        top: targetTop,
        behavior: "smooth",
      });

      window.setTimeout(() => {
        isAutoScrollingRef.current = false;
      }, 450);
    });

    return () => cancelAnimationFrame(id);
  }, [
    ready,
    activeTab,
    viewMode,
    activeDay,
    todayKey,
    editMode,
  ]);


  useEffect(() => {
    const id = window.setInterval(() => {
      setNowMinutes(getCurrentMinutes());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-open templates on true first launch (no stored data)
  useEffect(() => {
    if (ready && isFirstLaunch) {
      setActiveTab(1); // Plans tab
      setTemplatesOpen(true);
    }
  }, [ready, isFirstLaunch]);

  useEffect(() => {
    // On tab wake after sleep, todayKey may be stale — correct it immediately.
    const currentKey = JS_DAYS[new Date().getDay()];
    if (todayKey !== currentKey) {
      setTodayKey(currentKey);
      return; // effect re-fires with the corrected key
    }
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const id = window.setTimeout(() => setTodayKey(JS_DAYS[new Date().getDay()]), msUntilMidnight);
    return () => window.clearTimeout(id);
  }, [todayKey]);



  // ─── Handlers ──────────────────────────────────────────────────────────────

  // ── TaskSheet open/close helpers ──────────────────────────────────────────

  function openCreateSheet(initialPid?: string | null) {
    setTaskSheetPlanId(initialPid ?? null);
    setTaskSheetTask(null);
    setTaskSheetMode("create");
    setTaskSheetOpen(true);
  }

  function openEditSheet(task: Task) {
    setTaskSheetTask(task);
    setTaskSheetPlanId(task.planId);
    setTaskSheetMode("edit");
    setTaskSheetOpen(true);
  }

  function closeTaskSheet() {
    setTaskSheetOpen(false);
    setTaskSheetTask(null);
    setTaskSheetPlanId(null);
  }

  // ── Unified create + edit save handler ────────────────────────────────────

  function handleTaskSheetSave(data: TaskSaveData) {
    if (data.taskId) {
      // Edit mode
      setSchedule(updateTask(data.taskId, activeDay, data.taskDraft, data.planItems));
    } else {
      // Create mode
      setSchedule(createTask(data.taskDraft, data.repeatDays, data.planItems));
    }
    closeTaskSheet();
  }

  function handleDeleteTask(taskId: string) {
    setSchedule(deleteTask(taskId, activeDay));
  }

  const handleToggleTaskComplete = useCallback(
    (taskId: string, allSubtaskIds: string[]) => {
      setSchedule((prev) => ({
        ...prev,
        activities: {
          ...prev.activities,
          [activeDay]: prev.activities[activeDay].map((t) =>
            t.id === taskId ? { ...t, ...toggleTaskComplete(t, allSubtaskIds) } : t
          ),
        },
      }));
    },
    [activeDay, setSchedule]
  );

  const handleToggleSubtask = useCallback(
    (taskId: string, subtaskId: string) => {
      setSchedule((prev) => ({
        ...prev,
        activities: {
          ...prev.activities,
          [activeDay]: prev.activities[activeDay].map((t) => {
            if (t.id !== taskId) return t;
            const plan = prev.plans.find((p) => p.id === t.planId);
            const totalSubtasks = plan?.items.length ?? 0;
            return { ...t, ...toggleSubtaskComplete(t, subtaskId, totalSubtasks) };
          }),
        },
      }));
    },
    [activeDay, setSchedule]
  );

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

  function handleApplyTemplate(template: Template) {
    setSchedule(applyTemplate(template));
    setActiveTab(1); // Plans tab
  }

  function handleDeleteEntry(entryId: string) {
    setSchedule((prev) => ({
      ...prev,
      metricEntries: prev.metricEntries.filter((e) => e.id !== entryId),
    }));
  }

  function handleReorderTasks(activeId: string, overId: string) {
    setSchedule((prev) => {
      const sorted = sortTasksByTime(prev.activities[activeDay]);
      const activeIdx = sorted.findIndex((t) => t.id === activeId);
      const overIdx = sorted.findIndex((t) => t.id === overId);
      if (activeIdx === -1 || overIdx === -1) return prev;
      const reordered = arrayMove(sorted, activeIdx, overIdx);
      const updatedMap = new Map(reordered.map((t, i) => [t.id, { ...t, sortOrder: i * 1000 }]));
      return {
        ...prev,
        activities: {
          ...prev.activities,
          [activeDay]: prev.activities[activeDay].map((t) => updatedMap.get(t.id) ?? t),
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

  function handleDeleteTracker(trackerId: string) {
    setSchedule((prev) => ({
      ...prev,
      progressTrackers: prev.progressTrackers.filter((t) => t.id !== trackerId),
      metricEntries: prev.metricEntries.filter((e) => e.trackerId !== trackerId),
    }));
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

  // ─── Milestone handlers ──────────────────────────────────────────────────

  function handleAddMilestone(planId: string, data: Omit<Milestone, "id" | "planId">) {
    const ms: Milestone = { id: uid(), planId, ...data };
    setSchedule((prev) => ({ ...prev, milestones: [...(prev.milestones ?? []), ms] }));
  }

  function handleUpdateMilestone(id: string, data: Partial<Milestone>) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (prev.milestones ?? []).map((m) => (m.id === id ? { ...m, ...data } : m)),
    }));
  }

  function handleDeleteMilestone(id: string) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (prev.milestones ?? []).filter((m) => m.id !== id),
    }));
  }

  function handleCompleteMilestone(id: string) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (prev.milestones ?? []).map((m) =>
        m.id === id
          ? { ...m, completionStatus: "completed", completedDate: todayISO() }
          : m
      ),
    }));
  }

  // ─── Derived data ──────────────────────────────────────────────────────────

  const dayTasks = useMemo(
    () => sortTasksByTime(schedule.activities[activeDay]),
    [schedule.activities, activeDay]
  );

  // O(1) plan lookup — avoids .find() in every render loop iteration.
  const plansById = useMemo(() => {
    const m = new Map<string, Plan>();
    for (const p of schedule.plans) m.set(p.id, p);
    return m;
  }, [schedule.plans]);

  const dayProgress = useMemo(() => {
    const total = dayTasks.length;
    const done = dayTasks.filter((t) =>
      isTaskCompleted(t, plansById.get(t.planId)?.items.length ?? 0)
    ).length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [dayTasks, plansById]);

  const showCurrentTime =
    activeDay === todayKey &&
    nowMinutes >= TIMELINE_START_MINUTES &&
    nowMinutes <= TIMELINE_END_MINUTES;
  const currentTimeTop =
    TIMELINE_TOP_PADDING + ((nowMinutes - TIMELINE_START_MINUTES) / 60) * HOUR_HEIGHT;

  const { weekDates, weekLabel, todayMidnightTime } = useMemo(() => {
    const dates = getWeekDates(weekOffset);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return {
      weekDates: dates,
      weekLabel: dates[2].date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      todayMidnightTime: midnight.getTime(),
    };
    // todayKey ensures todayMidnightTime is refreshed when the date rolls over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, todayKey]);

  const selectedPlan = useMemo(
    () => (selectedPlanId ? plansById.get(selectedPlanId) ?? null : null),
    [selectedPlanId, plansById]
  );

  const getUniquePlanTasks = useCallback(
    (planId: string): Array<{ task: Task; activeDays: DayKey[] }> => {
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
    },
    [schedule.activities]
  );

  function formatPlanRange(plan: Plan): string {
    if (!plan.startDate && !plan.endDate) return "No date range";
    if (plan.startDate && plan.endDate)
      return `${formatPlanDate(plan.startDate)} – ${formatPlanDate(plan.endDate)}`;
    if (plan.startDate) return `Starts ${formatPlanDate(plan.startDate)}`;
    return `Ends ${formatPlanDate(plan.endDate ?? "")}`;
  }


  function getTaskPresentation(task: Task) {
    const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
    return {
      linkedPlan,
      iconName: linkedPlan?.emoji ?? task.icon,
      color: linkedPlan?.color ?? task.color,
    };
  }

  const timelineTaskLayouts = useMemo(() => {
    const intervals = dayTasks
      .map((task) => {
        const start = parseTimeToMinutes(task.startTime) ?? TIMELINE_START_MINUTES;
        let end = parseTimeToMinutes(task.endTime) ?? start + 30;
        const isOvernight = end <= start;
        if (isOvernight) end += 1440;
        const cs = clamp(start, TIMELINE_START_MINUTES, TIMELINE_END_MINUTES);
        const ce = clamp(Math.max(end, cs + 15), TIMELINE_START_MINUTES, TIMELINE_END_MINUTES);
        return {
          task,
          start: cs,
          end: ce,
          isOvernight,
          isTruncated: isOvernight && end > TIMELINE_END_MINUTES,
          top: TIMELINE_TOP_PADDING + ((cs - TIMELINE_START_MINUTES) / 60) * HOUR_HEIGHT,
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
  }, [dayTasks]);

  function getTaskLaneStyle(layout: typeof timelineTaskLayouts[number]) {
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
      <main className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center gap-3 dark:bg-neutral-950">
        <img src="/logo.svg" alt="PlanR" className="h-7 w-auto opacity-80 dark:hidden" />
        <img src="/logo-dark.svg" alt="PlanR" className="hidden h-7 w-auto opacity-80 dark:block" />
        <div className="h-1 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
          <div className="h-full w-1/3 rounded-full bg-neutral-700 dark:bg-white/60 animate-loading-bar" />
        </div>
      </main>
    );
  }

  const editPlanDuration = daysBetween(editPlanDraft.startDate, editPlanDraft.endDate);

  // ─── Render helpers ────────────────────────────────────────────────────────

  function renderTimelineTaskCard(
    task: Task,
    cardClassName: string,
    cardSize: CardSize = "large",
    isOvernight = false,
    isTruncated = false
  ) {
    const { linkedPlan, color } = getTaskPresentation(task);
    const tone = timelineCardStyles(color);
    const duration = formatTaskDuration(task.startTime, task.endTime);
    const totalSubtasks = linkedPlan?.items.length ?? 0;
    const allSubtaskIds = linkedPlan?.items.map((i) => i.id) ?? [];
    const taskState = resolveTaskState(task, totalSubtasks);
    const done = taskState === "completed";
    const partial = taskState === "partial";

    // Completed cards recede at card level — preserve color, just lower opacity
    const base = `${cardClassName} ${tone.cardBg} ${tone.accentBar} transition-all duration-300${done ? " opacity-70" : ""}`;
    const titleClass = `${tone.title}${done ? " line-through" : ""}`;

    // ── Completion checkbox (medium + large) ──────────────────────────────────
    const completionBtn = (cardSize === "large" || cardSize === "medium") ? (
      <motion.button
        type="button"
        whileTap={{ scale: 0.82 }}
        transition={{ type: "spring", stiffness: 500, damping: 25 }}
        onClick={(e) => { e.stopPropagation(); handleToggleTaskComplete(task.id, allSubtaskIds); }}
        aria-label={done ? "Mark incomplete" : "Mark complete"}
        className={`absolute top-2 right-2 z-10 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors duration-200 ${done || partial
          ? "border-transparent bg-green-500"
          : "border-neutral-500/50 bg-transparent dark:border-white/55"
          }`}
      >
        <AnimatePresence mode="wait" initial={false}>
          {done && (
            <motion.span
              key="check"
              initial={{ opacity: 0, scale: 0.4, rotate: -15 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ type: "spring", stiffness: 500, damping: 22 }}
            >
              <IconCheck size={10} strokeWidth={3} className="text-white" />
            </motion.span>
          )}
          {partial && (
            <motion.span
              key="partial"
              initial={{ opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.4 }}
              transition={{ duration: 0.15 }}
            >
              <IconMinus size={10} strokeWidth={3} className="text-white" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    ) : null;

    // ── xsmall: title only — tap card to toggle ────────────────────────────
    if (cardSize === "xsmall") {
      return (
        <div
          className={`${base} cursor-pointer`}
          onClick={() => handleToggleTaskComplete(task.id, allSubtaskIds)}
        >
          <div className="flex h-full items-center min-w-0">
            <span className={`text-[11px] font-semibold leading-none truncate ${titleClass}`}>
              {task.title}
            </span>
          </div>
        </div>
      );
    }

    // ── small: plan label + title — tap card to toggle ─────────────────────
    if (cardSize === "small") {
      return (
        <div
          className={`${base} cursor-pointer`}
          onClick={() => handleToggleTaskComplete(task.id, allSubtaskIds)}
        >
          <div className="flex h-full flex-col justify-center gap-[2px] min-w-0">
            {linkedPlan && (
              <p className={`text-[8px] font-semibold uppercase tracking-[0.08em] truncate shrink-0 leading-none ${tone.planLabel}`}>
                {linkedPlan.title}
              </p>
            )}
            <span className={`text-[11px] font-semibold leading-snug truncate ${titleClass}`}>
              {task.title}
            </span>
          </div>
        </div>
      );
    }

    // ── medium: plan label + title + time + duration ───────────────────────
    if (cardSize === "medium") {
      return (
        <div className={`${base} relative`}>
          {completionBtn}
          <div className="flex h-full flex-col min-w-0 pr-7">
            {linkedPlan && (
              <p className={`text-[9px] font-semibold uppercase tracking-[0.08em] truncate shrink-0 leading-none mb-0.5 ${tone.planLabel}`}>
                {linkedPlan.title}
              </p>
            )}
            <h3 className={`text-[12px] font-semibold leading-snug flex-1 min-w-0 line-clamp-2 ${titleClass}`}>
              {task.title}
            </h3>
            <div className="flex items-center gap-1 mt-auto flex-wrap">
              <span className={`text-[10px] font-medium shrink-0 ${tone.time}`}>
                {task.startTime}{isOvernight ? " →" : ` – ${task.endTime}`}
                {isTruncated && " ↓"}
              </span>
              {duration && (
                <span className={`shrink-0 inline-flex items-center rounded-full px-1.5 py-[1px] text-[9px] font-semibold ${tone.durationBadge}`}>
                  {duration}
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── large: plan label → title → time + duration pill ──────────────────
    return (
      <div className={`${base} relative`}>
        {completionBtn}
        <div className="flex flex-col h-full min-w-0 pr-7">
          {linkedPlan && (
            <p className={`text-[9px] font-semibold uppercase tracking-[0.09em] truncate shrink-0 leading-none mb-0.5 ${tone.planLabel}`}>
              {linkedPlan.title}
            </p>
          )}
          <h3 className={`text-[13px] font-semibold leading-snug flex-1 min-w-0 line-clamp-3 ${titleClass}`}>
            {task.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-auto pt-0.5 flex-wrap">
            <span className={`text-[11px] font-medium shrink-0 ${tone.time}`}>
              {task.startTime}{isOvernight ? " → next day" : ` – ${task.endTime}`}
              {isTruncated && " ↓"}
            </span>
            {duration && (
              <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-[2px] text-[10px] font-semibold ${tone.durationBadge}`}>
                {duration}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Add Plan Sheet ────────────────────────────────────────────────────────

  function renderAddPlanSheet() {
    const newPlanDuration = daysBetween(newPlanStartDate, newPlanEndDate);
    return (
      <div className="space-y-4 p-5 pb-8">
        <SheetHeader eyebrow="New" title="Create Plan" onClose={() => setAddingPlan(false)} />

        <div className="space-y-2.5">
          <Input
            value={newPlanTitle}
            onChange={(e) => setNewPlanTitle(e.target.value)}
            placeholder="Plan title"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && newPlanTitle.trim()) handleAddPlan(); }}
          />
          <Input
            value={newPlanDescription}
            onChange={(e) => setNewPlanDescription(e.target.value)}
            placeholder="Short description (optional)"
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
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                End date{newPlanDuration ? <span className="normal-case font-normal ml-1">({newPlanDuration} days)</span> : null}
              </p>
              <input
                type="date"
                value={newPlanEndDate}
                onChange={(e) => setNewPlanEndDate(e.target.value)}
                className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none focus:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
            </div>
          </div>

          {/* Duration presets */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Quick duration</p>
            <div className="flex gap-2 flex-wrap">
              {PLAN_DURATION_PRESETS.map(({ label, days }) => {
                const today = todayISO();
                const isActive = days !== null
                  ? newPlanStartDate === today && newPlanEndDate === addDaysISO(days)
                  : newPlanStartDate === today && !newPlanEndDate;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setNewPlanStartDate(today);
                      setNewPlanEndDate(days !== null ? addDaysISO(days) : "");
                    }}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-all ${isActive
                      ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:border-white/20"
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
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
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl py-3 transition-all duration-150 ${sel ? `${ic.solid} scale-[1.04]` : `${ic.tint} ${ic.text} hover:scale-[1.04]`
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
            <Input
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
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400 dark:hover:bg-white/5"
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

        <Button fullWidth onClick={handleAddPlan} disabled={!newPlanTitle.trim()}>
          Create New Plan
        </Button>
      </div>
    );
  }

  // ─── Plan list ─────────────────────────────────────────────────────────────

  function renderPlanList() {
    return (
      <div className="px-4 pt-5 pb-8">
        {/* Header */}
        <MainTitleSection
          label="Stay on track"
          title="My Plans"
          actions={
            <CtaActionButton
              label="Add New Plan"
              icon={<IconPlus size={14} strokeWidth={2.5} />}
              onClick={() => setAddingPlan(true)}
            />
          }
          className="mb-6"
        />

        {/* Empty state */}
        {schedule.plans.length === 0 && (
          <div className="rounded-[28px] border border-dashed border-neutral-200 p-8 text-center dark:border-white/10">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.07] mx-auto">
              <IconClipboardList size={22} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <p className="text-[15px] font-bold text-neutral-700 dark:text-neutral-300">No plans yet</p>
            <p className="mt-1 text-[13px] text-neutral-400 dark:text-neutral-500 max-w-[220px] mx-auto">
              Start from scratch or pick a template with tasks and milestones ready to go.
            </p>
            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2.5 text-[13px] font-bold text-white transition-opacity active:opacity-75 dark:bg-white dark:text-neutral-900"
            >
              Browse Templates
            </button>
          </div>
        )}

        {/* Plan cards */}
        <div className="space-y-3">
          {schedule.plans.length > 0 && (
            <button
              type="button"
              onClick={() => setTemplatesOpen(true)}
              className="w-full rounded-2xl border border-dashed border-neutral-200 py-3 text-[13px] font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20 dark:hover:text-neutral-300"
            >
              + Browse example templates
            </button>
          )}
          {schedule.plans.map((plan) => {
            const uniqueTasks = getUniquePlanTasks(plan.id);
            const trackerCount = schedule.progressTrackers.filter(
              (t) => t.planId === plan.id
            ).length;
            const planIconEntry =
              SECTION_ICONS.find((e) => e.name === plan.emoji) ?? SECTION_ICONS[0];
            const { dayState, consistency } = getPlanCardStats(
              plan,
              schedule.activities,
              todayKey
            );
            const dateRange =
              plan.startDate || plan.endDate ? formatPlanRange(plan) : null;

            return (
              <PlanCard
                key={plan.id}
                plan={plan}
                PlanIcon={planIconEntry.icon}
                taskCount={uniqueTasks.length}
                trackerCount={trackerCount}
                dayState={dayState}
                consistency={consistency}
                dateRange={dateRange}
                onSelect={() => setSelectedPlanId(plan.id)}
              />
            );
          })}
        </div>
      </div>
    );
  }

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
        <AppHeader onOpenSettings={() => setSettingsOpen(true)} />
      )}

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} onClearData={clearData} />
      <TemplatesSheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} onApply={handleApplyTemplate} />

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="max-w-lg mx-auto pb-40">

        {/* ── Tasks Tab ────────────────────────────────────────────────────── */}
        {activeTab === 0 && (
          <div>
            {/* Calendar */}
            <div className="px-4 pt-4">
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[16px] font-semibold text-neutral-900 dark:text-white">
                    {weekLabel}
                  </span>
                  <div className="flex items-center gap-1">
                    {weekOffset !== 0 && (
                      <button
                        type="button"
                        onClick={() => { setWeekOffset(0); setActiveDay(todayKey); }}
                        className="inline-flex h-7 items-center rounded-lg px-2 text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07] transition-colors"
                      >
                        Today
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setWeekOffset((w) => w - 1)}
                      aria-label="Previous week"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.07] transition-colors"
                    >
                      <IconChevronLeft size={20} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeekOffset((w) => w + 1)}
                      aria-label="Next week"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.07] transition-colors"
                    >
                      <IconChevronRight size={20} strokeWidth={2} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {weekDates.map(({ day, date }) => {
                    const isDateToday = date.getTime() === todayMidnightTime;
                    const isActive = day === activeDay;
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => setActiveDay(day)}
                        className={`flex flex-col items-center justify-center gap-3 w-full rounded-lg py-2 h-[64px] transition-all duration-200 ${isActive
                          ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                          : isDateToday
                            ? "bg-neutral-200 text-neutral-700 dark:bg-white/10 dark:text-neutral-200"
                            : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
                          }`}
                      >
                        <span
                          className={`text-[12px] font-medium leading-none ${isActive ? "opacity-60" : "opacity-50"
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
            <div className="px-4 pt-5 pb-5">
              <MainTitleSection
                label="My Schedule"
                title="Today's Tasks"
                progressMeta={
                  dayProgress.total > 0
                    ? dayProgress.done === dayProgress.total
                      ? "done"
                      : { done: dayProgress.done, total: dayProgress.total }
                    : undefined
                }
                progressBar={dayProgress.total > 0 ? { pct: dayProgress.pct } : undefined}
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => { setViewMode((v) => (v === "list" ? "timeline" : "list")); setEditMode(false); }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 h-9 text-[12px] font-semibold text-neutral-700 transition-all hover:bg-neutral-50 active:scale-95 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
                    >
                      {viewMode === "timeline" ? (
                        <>List <IconLayoutList size={16} strokeWidth={2} /></>
                      ) : (
                        <>Timeline <IconTable size={16} strokeWidth={2} /></>
                      )}
                    </button>
                    <IconActionButton
                      icon={<IconEdit size={16} strokeWidth={2} />}
                      saveIcon={<IconCheck size={16} strokeWidth={2.5} />}
                      saving={editMode}
                      onClick={() => setEditMode((prev) => !prev)}
                      show={dayTasks.length > 0 && viewMode === "list"}
                    />
                  </>
                }
              />
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
                      <div className="rounded-2xl border border-dashed border-neutral-200 py-10 text-center dark:border-white/10">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-white/[0.06] mx-auto mb-3">
                          <IconCalendar size={20} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
                        </div>
                        <p className="text-[14px] font-semibold text-neutral-600 dark:text-neutral-300">
                          {schedule.plans.length === 0 ? "No plans yet" : "Nothing scheduled"}
                        </p>
                        <p className="mt-1 text-[12px] text-neutral-400 dark:text-neutral-500">
                          {schedule.plans.length === 0
                            ? "Create a plan first, then add tasks."
                            : "Tap + to schedule your first task for this day."}
                        </p>
                      </div>
                    ) : editMode ? (
                      <DndContext sensors={sensors} onDragEnd={handleTasksDragEnd}>
                        <SortableContext items={dayTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                          <div className="flex flex-col gap-3 pb-4">
                            {dayTasks.map((task) => (
                              <SortableTaskCard key={task.id} task={task}>
                                {(dragHandleProps) => (
                                  <div
                                    className="w-full min-w-0 animate-panel-in cursor-grab active:cursor-grabbing"
                                    {...dragHandleProps.attributes}
                                    {...dragHandleProps.listeners}
                                  >
                                    <ListTaskCard
                                      task={task}
                                      linkedPlan={task.planId ? plansById.get(task.planId) ?? null : null}
                                      editMode
                                      onToggleComplete={handleToggleTaskComplete}
                                      onToggleSubtask={handleToggleSubtask}
                                      onEdit={() => openEditSheet(task)}
                                      onDelete={() => handleDeleteTask(task.id)}
                                    />
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
                            <ListTaskCard
                              task={task}
                              linkedPlan={task.planId ? plansById.get(task.planId) ?? null : null}
                              onToggleComplete={handleToggleTaskComplete}
                              onToggleSubtask={handleToggleSubtask}
                              onEdit={() => openEditSheet(task)}
                              onDelete={() => handleDeleteTask(task.id)}
                            />
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
                      <div className="mb-3 rounded-2xl border border-dashed border-neutral-200 py-8 text-center dark:border-white/10">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06] mx-auto mb-2">
                          <IconCalendar size={17} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
                        </div>
                        <p className="text-[13px] font-medium text-neutral-400 dark:text-neutral-500">
                          Nothing scheduled — tap + to add a task.
                        </p>
                      </div>
                    )}
                    {/* Google Calendar-style flat timeline */}
                    <div
                      ref={timelineScrollRef}
                      onScroll={() => {
                        if (isAutoScrollingRef.current) return;
                        hasUserScrolledTimelineRef.current = true;
                      }}
                      className="calendar-scrollbar-none relative flex h-[calc(100vh-290px)] overflow-y-auto overflow-x-hidden"
                    >
                      {/* Time column */}
                      <div
                        className="sticky left-0 z-20 w-[52px] shrink-0 bg-neutral-50 dark:bg-neutral-950"
                        style={{ height: TIMELINE_HEIGHT }}
                      >
                        {TIMELINE_HOURS.map((hour, index) => {
                          const isMidnight = hour === 24;
                          if (index === 0) return null; // skip first label
                          return (
                            <div
                              key={hour}
                              className="absolute right-0 pr-2 flex flex-col items-end"
                              style={{ top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT - 7 }}
                            >
                              {isMidnight ? (
                                <span className="text-[9px] font-bold text-neutral-300 dark:text-white/20 leading-none uppercase tracking-wide">
                                  tmrw
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 tabular-nums leading-none">
                                  {formatHourLabel(hour)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Grid + tasks */}
                      <div
                        className="relative min-w-0 flex-1 border-l border-neutral-200 dark:border-white/[0.08]"
                        style={{ height: TIMELINE_HEIGHT }}
                      >
                        {/* Grid lines */}
                        <div className="absolute inset-0 pointer-events-none">
                          {TIMELINE_HOURS.map((hour, index) => {
                            const isMidnight = hour === 24;
                            return (
                              <div key={`grid-${hour}`}>
                                {/* Hour line */}
                                <div
                                  className={`absolute left-0 right-0 ${isMidnight
                                    ? "border-t-2 border-neutral-200 dark:border-white/[0.12]"
                                    : "border-t border-neutral-100 dark:border-white/[0.05]"
                                    }`}
                                  style={{ top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT }}
                                />
                                {/* Half-hour dashed line */}
                                {index < TIMELINE_HOURS.length - 1 && (
                                  <div
                                    className="absolute left-0 right-0 border-t border-dashed border-neutral-100 dark:border-white/[0.03]"
                                    style={{ top: TIMELINE_TOP_PADDING + index * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Task cards */}
                        <div className="absolute inset-0">
                          {timelineTaskLayouts.map((layout) => (
                            <div
                              key={layout.task.id}
                              className="absolute min-w-0 px-1 py-[2px] animate-panel-in"
                              style={getTaskLaneStyle(layout)}
                            >
                              <div className="relative h-full min-h-[24px]">
                                {renderTimelineTaskCard(
                                  layout.task,
                                  "h-full rounded-xl px-2.5 py-2 w-full min-w-0 overflow-hidden",
                                  computeCardSize(layout.height, layout.laneCount),
                                  layout.isOvernight,
                                  layout.isTruncated
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Current time indicator */}
                        {showCurrentTime && (
                          <div
                            className="pointer-events-none absolute left-0 right-0 z-30 -translate-y-1/2 flex items-center"
                            style={{ top: currentTimeTop }}
                          >
                            <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 -ml-[5px]" />
                            <div className="h-[2px] flex-1 bg-red-500" />
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
          selectedPlan ? (
            <PlanDetailView
              plan={selectedPlan}
              schedule={schedule}
              milestones={schedule.milestones ?? []}
              onAddTask={(planId) => openCreateSheet(planId)}
              onEditTask={(task) => openEditSheet(task)}
              onDeleteLinkedTask={handleDeleteLinkedTask}
              onAddTracker={(planId, title, unit, goalDirection) => {
                setSchedule((prev) => ({
                  ...prev,
                  progressTrackers: [
                    ...prev.progressTrackers,
                    {
                      id: uid(),
                      planId,
                      title,
                      type: "number",
                      unit: unit || undefined,
                      goalDirection,
                    },
                  ],
                }));
              }}
              onUpdateTracker={(trackerId, data) => {
                setSchedule((prev) => ({
                  ...prev,
                  progressTrackers: prev.progressTrackers.map((t) =>
                    t.id === trackerId
                      ? { ...t, ...data, unit: data.unit || undefined }
                      : t
                  ),
                }));
              }}
              onDeleteTracker={handleDeleteTracker}
              onOpenAddEntry={(tracker) => setEntryTracker(tracker)}
              onDeleteEntry={handleDeleteEntry}
              onAddMilestone={(data) => handleAddMilestone(selectedPlan.id, data)}
              onUpdateMilestone={handleUpdateMilestone}
              onDeleteMilestone={handleDeleteMilestone}
              onCompleteMilestone={handleCompleteMilestone}
            />
          ) : renderPlanList()
        )}
      </div>

      {/* ── Edit Plan Bottom Sheet ─────────────────────────────────────────── */}
      <BottomSheet open={!!editingPlanId} onClose={() => setEditingPlanId(null)} maxHeight="80vh">
        <div className="space-y-4 p-5 pb-8">
          <SheetHeader eyebrow="Edit" title="Plan Details" onClose={() => setEditingPlanId(null)} />
          <div className="space-y-2.5">
            <Input
              value={editPlanDraft.title}
              onChange={(e) => setEditPlanDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="Plan title"
              autoFocus
            />
            <Input
              value={editPlanDraft.description}
              onChange={(e) => setEditPlanDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="Short description (optional)"
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
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  End date{editPlanDuration ? <span className="normal-case font-normal ml-1">({editPlanDuration} days)</span> : null}
                </p>
                <input
                  type="date"
                  value={editPlanDraft.endDate}
                  onChange={(e) => setEditPlanDraft((d) => ({ ...d, endDate: e.target.value }))}
                  className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-900 outline-none focus:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                />
              </div>
            </div>

            {/* Duration presets */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Quick duration</p>
              <div className="flex gap-2 flex-wrap">
                {PLAN_DURATION_PRESETS.map(({ label, days }) => {
                  const today = todayISO();
                  const isActive = days !== null
                    ? editPlanDraft.startDate === today && editPlanDraft.endDate === addDaysISO(days)
                    : editPlanDraft.startDate === today && !editPlanDraft.endDate;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setEditPlanDraft((d) => ({
                        ...d,
                        startDate: today,
                        endDate: days !== null ? addDaysISO(days) : "",
                      }))}
                      className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-all ${isActive
                        ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:border-white/20"
                        }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <Button
            fullWidth
            onClick={() => editingPlanId && handleSaveEditPlan(editingPlanId)}
            disabled={!editPlanDraft.title.trim()}
          >
            Save Changes
          </Button>
        </div>
      </BottomSheet>

      {/* ── Add Plan Bottom Sheet ───────────────────────────────────────────── */}
      <BottomSheet open={addingPlan} onClose={() => setAddingPlan(false)}>
        {renderAddPlanSheet()}
      </BottomSheet>

      {/* ── Bottom Nav ─────────────────────────────────────────────────────── */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
        onCreateTask={() => openCreateSheet()}
        onCreatePlan={openAddPlan}
      />

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      <TaskSheet
        mode={taskSheetMode}
        task={taskSheetTask}
        plans={schedule.plans}
        activeDay={activeDay}
        isOpen={taskSheetOpen}
        initialPlanId={taskSheetPlanId}
        onClose={closeTaskSheet}
        onSave={handleTaskSheetSave}
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
