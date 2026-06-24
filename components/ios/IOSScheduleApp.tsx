"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  IconAlertCircle,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardData,
  IconEdit,
  IconListCheck,
  IconNotes,
  IconPlus,
  IconRepeat,
  IconSettings,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { TaskSaveData } from "@/components/task/TaskSheet";
import type { MilestoneSaveData } from "@/components/plan/MilestoneSheet";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import IOSBottomNav from "@/components/ios/IOSBottomNav";
import IOSLightTaskCard from "@/components/ios/IOSLightTaskCard";
import { useAuth } from "@/contexts/AuthProvider";
import {
  DAYS,
  DAY_LABELS,
  type DayKey,
  type MetricEntry,
  type Milestone,
  type Note,
  type Plan,
  type PlanCoachMessage,
  type ProgressTracker,
  type Ritual,
  type Schedule,
  type Task,
  resetStaleCompletions,
} from "@/lib/useScheduleDB";
import { useScheduleDB } from "@/lib/useScheduleDB";
import { bootLog, isStandalonePWA } from "@/lib/iosSafeMode";
import { todayISO, localISODate, addDaysToISO, formatDate } from "@/lib/dateUtils";
import {
  applyTaskDelete,
  createTask,
  createTaskDeleteSnapshot,
  restoreTaskDelete,
  sortTasksByTime,
  uid,
  updateTaskDays,
  setTaskException,
  clearTaskException,
  type TaskDeleteScope,
} from "@/lib/taskMutations";
import { completionForDate, isTaskCompleted, markTaskMissed, toggleSubtaskComplete, toggleTaskComplete } from "@/lib/taskCompletion";
import { diffException, isTaskScheduledOn, resolveOccurrence } from "@/lib/taskOccurrence";
import { cascadeMilestoneDates, normalizeMilestoneTimeline } from "@/lib/roadmapDates";
import { formatDuration } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";

const IOSMotionBoundary = dynamic(() => import("@/components/ios/IOSMotionBoundary"), { ssr: false });
const TaskSheet = dynamic(() => import("@/components/task/TaskSheet").then((m) => ({ default: m.TaskSheet })), { ssr: false });
const AddPlanSheet = dynamic(() => import("@/components/plan/AddPlanSheet"), { ssr: false });
const PlanDetailView = dynamic(() => import("@/components/plan/PlanDetailView"), { ssr: false });
const RitualView = dynamic(() => import("@/components/activity/RitualView"), { ssr: false });
const SettingsView = dynamic(() => import("@/components/SettingsView").then((m) => ({ default: m.SettingsView })), { ssr: false });
const NotesView = dynamic(() => import("@/components/notes/NotesView"), { ssr: false });
const SubtasksSheet = dynamic(() => import("@/components/activity/SubtasksSheet"), { ssr: false });
const AddEntryModal = dynamic(() => import("@/components/AddEntryModal"), { ssr: false });

const JS_DAYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

type ConfirmState = {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

type TaskDeleteRequest = {
  taskId: string;
  sourceDay: DayKey;
};

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

function statLabel(done: number, total: number): string {
  return total > 0 ? `${done}/${total} done` : "None";
}

function IOSHeader({
  title,
  subtitle,
  backLabel,
  onBack,
  onSettings,
  onNotes,
}: {
  title: string;
  subtitle: string;
  backLabel?: string;
  onBack?: () => void;
  onSettings: () => void;
  onNotes: () => void;
}) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 border-b border-neutral-200/80 bg-neutral-50/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur dark:border-white/[0.07] dark:bg-neutral-950/95">
      <div className="flex h-12 items-center justify-between gap-3">
        <div className="min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-0.5 flex items-center gap-1 text-[13px] font-bold text-neutral-500 dark:text-neutral-400"
            >
              <IconChevronLeft size={16} strokeWidth={2.2} />
              {backLabel}
            </button>
          ) : (
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">{subtitle}</p>
          )}
          <h1 className="truncate text-[22px] font-black leading-none text-neutral-950 dark:text-white">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onNotes}
            aria-label="Notes"
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400"
          >
            <IconNotes size={20} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onSettings}
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400"
          >
            <IconSettings size={20} strokeWidth={2} />
          </button>
        </div>
      </div>
    </header>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  value: number | string;
  label: string;
}) {
  return (
    <div className="h-[98px] rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon size={12} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500" />
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">{label}</p>
      </div>
      <p className="truncate text-[28px] font-black leading-none text-neutral-900 dark:text-white">{value}</p>
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-200 bg-white px-5 py-8 text-center dark:border-white/[0.10] dark:bg-neutral-900">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
        <Icon size={19} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
      </div>
      <p className="text-[15px] font-extrabold text-neutral-900 dark:text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-[260px] text-[13px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">{description}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-neutral-950 px-4 text-[13px] font-bold text-white dark:bg-white dark:text-neutral-950"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function ConfirmOverlay({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 px-3 pb-3">
      <div className="w-full rounded-3xl border border-neutral-200 bg-white p-5 shadow-2xl dark:border-white/[0.10] dark:bg-neutral-900">
        <div className="mb-4 flex items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${state.destructive ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" : "bg-neutral-100 text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-300"}`}>
            <IconAlertCircle size={18} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <p className="text-[17px] font-black text-neutral-950 dark:text-white">{state.title}</p>
            <p className="mt-1 text-[14px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">{state.description}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-full border border-neutral-200 text-[14px] font-bold text-neutral-600 dark:border-white/[0.10] dark:text-neutral-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              state.onConfirm();
              onClose();
            }}
            className={`h-11 rounded-full text-[14px] font-bold text-white ${state.destructive ? "bg-rose-600" : "bg-neutral-950 dark:bg-white dark:text-neutral-950"}`}
          >
            {state.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IOSScheduleApp() {
  bootLog("APP_BOOT_START");
  bootLog("IOS_SAFE_MODE_ENABLED");
  void isStandalonePWA();

  const { user, isGuest, authLoading } = useAuth();
  const { schedule, setSchedule, ready, clearData, clearProgress } = useScheduleDB();
  const [todayKey, setTodayKey] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeTab, setActiveTab] = useState(4);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [taskSheetMode, setTaskSheetMode] = useState<"create" | "edit">("create");
  const [taskSheetTask, setTaskSheetTask] = useState<Task | null>(null);
  const [taskSheetPlanId, setTaskSheetPlanId] = useState<string | null>(null);
  const [taskSheetDateISO, setTaskSheetDateISO] = useState("");
  const [taskSheetInitialType, setTaskSheetInitialType] = useState<"task" | "session">("task");
  const [addingPlan, setAddingPlan] = useState(false);
  const [ritualAddOpen, setRitualAddOpen] = useState(false);
  const [subtasksRef, setSubtasksRef] = useState<{ id: string; day: DayKey; dateISO: string } | null>(null);
  const [entryTracker, setEntryTracker] = useState<ProgressTracker | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [taskDeleteRequest, setTaskDeleteRequest] = useState<TaskDeleteRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  const authLabel = authLoading ? "Auth checking" : isGuest ? "Guest mode" : user?.displayName || user?.email || "Signed in";

  useEffect(() => {
    bootLog("TIMELINE_SKIPPED_ON_IOS");
  }, []);

  useEffect(() => {
    if (!ready) return;
    bootLog("DASHBOARD_READY");
    bootLog("APP_BOOT_COMPLETE");
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    setSchedule((prev) => resetStaleCompletions(prev, todayISO()));
  }, [todayKey, ready, setSchedule]);

  useEffect(() => {
    const currentKey = JS_DAYS[new Date().getDay()];
    if (todayKey !== currentKey) {
      setTodayKey(currentKey);
      return;
    }
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const id = window.setTimeout(() => setTodayKey(JS_DAYS[new Date().getDay()]), msUntilMidnight);
    return () => window.clearTimeout(id);
  }, [todayKey]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const plansById = useMemo(() => new Map(schedule.plans.map((plan) => [plan.id, plan])), [schedule.plans]);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset, todayKey]);
  const weekLabel = weekDates[2].date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const activeDateISO = useMemo(() => {
    const found = weekDates.find((item) => item.day === activeDay);
    return found ? localISODate(found.date) : todayISO();
  }, [activeDay, weekDates]);
  const isViewingToday = activeDateISO === todayISO();

  const dayTasks = useMemo(() => sortTasksByTime(schedule.activities[activeDay] ?? []), [schedule.activities, activeDay]);
  const dayTasksView = useMemo(
    () =>
      dayTasks
        .filter((task) => isTaskScheduledOn(task, activeDateISO, true))
        .map((task) => {
          const resolved = resolveOccurrence(task, activeDateISO);
          return isViewingToday ? resolved : { ...resolved, ...completionForDate(task, activeDateISO) };
        }),
    [activeDateISO, dayTasks, isViewingToday]
  );
  const todayTasks = useMemo(
    () =>
      sortTasksByTime(schedule.activities[todayKey] ?? [])
        .filter((task) => isTaskScheduledOn(task, todayISO(), true))
        .map((task) => resolveOccurrence(task, todayISO())),
    [schedule.activities, todayKey]
  );
  const selectedPlan = selectedPlanId ? plansById.get(selectedPlanId) ?? null : null;
  const completedRitualIds = useMemo(() => {
    const today = todayISO();
    return new Set((schedule.ritualCompletions ?? []).filter((item) => item.date === today).map((item) => item.ritualId));
  }, [schedule.ritualCompletions, todayKey]);
  const taskSheetActiveDays = useMemo(() => {
    if (taskSheetMode !== "edit" || !taskSheetTask) return [activeDay];
    const days = DAYS.filter((day) => schedule.activities[day].some((task) => task.id === taskSheetTask.id));
    return days.length > 0 ? days : [activeDay];
  }, [activeDay, schedule.activities, taskSheetMode, taskSheetTask]);
  const subtasksTask = useMemo(() => {
    if (!subtasksRef) return null;
    const task = schedule.activities[subtasksRef.day]?.find((item) => item.id === subtasksRef.id) ?? null;
    if (!task) return null;
    const resolved = resolveOccurrence(task, subtasksRef.dateISO);
    return subtasksRef.dateISO === todayISO() ? resolved : { ...resolved, ...completionForDate(task, subtasksRef.dateISO) };
  }, [schedule.activities, subtasksRef]);
  const taskDeleteDetails = useMemo(() => {
    if (!taskDeleteRequest) return null;
    const activeDays = DAYS.filter((day) => schedule.activities[day].some((task) => task.id === taskDeleteRequest.taskId));
    const sourceDay = activeDays.includes(taskDeleteRequest.sourceDay) ? taskDeleteRequest.sourceDay : activeDays[0] ?? taskDeleteRequest.sourceDay;
    const task = schedule.activities[sourceDay]?.find((item) => item.id === taskDeleteRequest.taskId) ?? null;
    if (!task) return null;
    return { task, activeDays, sourceDay };
  }, [schedule.activities, taskDeleteRequest]);
  const ritualWeekHistory = useMemo(() => {
    const today = todayISO();
    const rituals = schedule.rituals ?? [];
    const completions = schedule.ritualCompletions ?? [];
    const labels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDaysToISO(today, i - 6);
      const jsDay = new Date(`${date}T00:00:00`).getDay();
      const dayKey = JS_DAYS[jsDay];
      const dueCount = rituals.filter((ritual) => !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(dayKey)).length;
      const completedCount = completions.filter((item) => item.date === date).length;
      return { date, label: labels[jsDay], isToday: date === today, completedCount, dueCount };
    });
  }, [schedule.rituals, schedule.ritualCompletions, todayKey]);

  const dayDone = dayTasksView.filter((task) => isTaskCompleted(task, task.subtasks?.length ?? 0)).length;
  const todayDone = todayTasks.filter((task) => isTaskCompleted(task, task.subtasks?.length ?? 0)).length;

  const openConfirm = useCallback((state: ConfirmState) => setConfirmState(state), []);

  function openCreateSheet(initialPlanId?: string | null, initialType: "task" | "session" = "task") {
    setTaskSheetPlanId(initialPlanId ?? null);
    setTaskSheetTask(null);
    setTaskSheetMode("create");
    setTaskSheetDateISO("");
    setTaskSheetInitialType(initialType);
    setTaskSheetOpen(true);
  }

  const openEditSheet = useCallback((task: Task, dateISO?: string) => {
    const template = DAYS.flatMap((day) => scheduleRef.current.activities[day] ?? []).find((item) => item.id === task.id) ?? task;
    setTaskSheetTask(template);
    setTaskSheetPlanId(template.planId);
    setTaskSheetDateISO(dateISO ?? activeDateISO);
    setTaskSheetInitialType(template.taskType ?? "task");
    setTaskSheetMode("edit");
    setTaskSheetOpen(true);
  }, [activeDateISO]);

  function closeTaskSheet() {
    setTaskSheetOpen(false);
    setTaskSheetTask(null);
    setTaskSheetPlanId(null);
    setTaskSheetDateISO("");
  }

  function handleTaskSheetSave(data: TaskSaveData) {
    if (data.taskId && data.scope === "occurrence" && taskSheetDateISO && taskSheetTask) {
      const patch = diffException(taskSheetTask, {
        title: data.taskDraft.title,
        startTime: data.taskDraft.startTime,
        endTime: data.taskDraft.endTime,
        description: data.taskDraft.description,
      });
      if (Object.keys(patch).length > 0) setSchedule(setTaskException(data.taskId, taskSheetDateISO, patch));
      closeTaskSheet();
      return;
    }
    if (data.taskId) setSchedule(updateTaskDays(data.taskId, data.taskDraft, data.repeatDays, data.planItems));
    else setSchedule(createTask(data.taskDraft, data.repeatDays, data.planItems));
    closeTaskSheet();
  }

  function handleToggleTaskComplete(taskId: string, allSubtaskIds: string[], day: DayKey = activeDay, dateISO?: string) {
    if (dateISO && dateISO !== todayISO()) return;
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [day]: (prev.activities[day] ?? []).map((task) =>
          task.id === taskId ? { ...task, ...toggleTaskComplete(task, allSubtaskIds) } : task
        ),
      },
    }));
  }

  function handleToggleSubtask(taskId: string, subtaskId: string, day: DayKey = activeDay, dateISO?: string) {
    if (dateISO && dateISO !== todayISO()) return;
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [day]: (prev.activities[day] ?? []).map((task) => {
          if (task.id !== taskId) return task;
          return { ...task, ...toggleSubtaskComplete(task, subtaskId, task.subtasks?.length ?? 0) };
        }),
      },
    }));
  }

  function handleMarkTaskMissed(taskId: string, allSubtaskIds: string[], day: DayKey = activeDay, dateISO?: string) {
    if (dateISO && dateISO !== todayISO()) return;
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [day]: (prev.activities[day] ?? []).map((task) =>
          task.id === taskId ? { ...task, ...markTaskMissed(task, allSubtaskIds) } : task
        ),
      },
    }));
  }

  function requestDeleteTask(taskId: string, sourceDay: DayKey = activeDay) {
    setTaskDeleteRequest({ taskId, sourceDay });
  }

  function performTaskDelete(scope: TaskDeleteScope) {
    if (!taskDeleteDetails) return;
    const snapshot = createTaskDeleteSnapshot(schedule, taskDeleteDetails.task.id, taskDeleteDetails.sourceDay, scope);
    setSchedule(applyTaskDelete(snapshot));
    setTaskDeleteRequest(null);
    setToast(`Deleted "${taskDeleteDetails.task.title}"`);
  }

  function handleAddRitual(data: Omit<Ritual, "id">) {
    setSchedule((prev) => ({
      ...prev,
      rituals: [...(prev.rituals ?? []), { ...data, id: uid() }],
    }));
  }

  function handleUpdateRitual(id: string, data: Omit<Ritual, "id">) {
    setSchedule((prev) => ({
      ...prev,
      rituals: (prev.rituals ?? []).map((ritual) => (ritual.id === id ? { ...ritual, ...data, id } : ritual)),
    }));
  }

  function handleDeleteRitual(id: string) {
    const ritual = (schedule.rituals ?? []).find((item) => item.id === id);
    openConfirm({
      title: "Delete routine?",
      description: ritual?.title ? `"${ritual.title}" will be removed from your daily practice.` : "This routine will be removed from your daily practice.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () =>
        setSchedule((prev) => ({
          ...prev,
          rituals: (prev.rituals ?? []).filter((item) => item.id !== id),
          ritualCompletions: (prev.ritualCompletions ?? []).filter((item) => item.ritualId !== id),
        })),
    });
  }

  function handleToggleRitualComplete(id: string) {
    const today = todayISO();
    setSchedule((prev) => {
      const completions = prev.ritualCompletions ?? [];
      const exists = completions.some((item) => item.ritualId === id && item.date === today);
      return {
        ...prev,
        ritualCompletions: exists
          ? completions.filter((item) => !(item.ritualId === id && item.date === today))
          : [...completions, { ritualId: id, date: today }],
      };
    });
  }

  function handleDeletePlan(planId: string) {
    const plan = schedule.plans.find((item) => item.id === planId);
    openConfirm({
      title: "Delete plan?",
      description: plan?.title ? `"${plan.title}" and its linked tasks, trackers, and entries will be deleted.` : "This plan and linked data will be deleted.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () => {
        setSchedule((prev) => ({
          ...prev,
          plans: prev.plans.filter((item) => item.id !== planId),
          activities: Object.fromEntries(DAYS.map((day) => [day, prev.activities[day].filter((task) => task.planId !== planId)])) as Schedule["activities"],
          metricEntries: prev.metricEntries.filter((item) => item.planId !== planId),
          progressTrackers: prev.progressTrackers.filter((item) => item.planId !== planId),
          milestones: prev.milestones.filter((item) => item.planId !== planId),
        }));
        setSelectedPlanId((current) => (current === planId ? null : current));
      },
    });
  }

  function handleDeleteLinkedTask(task: Task, activeDays: DayKey[]) {
    requestDeleteTask(task.id, activeDays[0] ?? activeDay);
  }

  function handleAddMilestone(planId: string, data: MilestoneSaveData) {
    const now = new Date().toISOString();
    const milestone: Milestone = {
      ...data,
      id: data.id ?? uid(),
      planId,
      linkedActivities: data.linkedActivities ?? [],
      linkedTrackers: data.linkedTrackers ?? [],
      createdAt: now,
      updatedAt: now,
    };
    setSchedule((prev) => {
      const plan = prev.plans.find((item) => item.id === planId);
      const other = (prev.milestones ?? []).filter((item) => item.planId !== planId);
      const own = [...(prev.milestones ?? []).filter((item) => item.planId === planId), milestone];
      return { ...prev, milestones: [...other, ...normalizeMilestoneTimeline(own, own.length === 1 ? milestone.startDate : plan?.startDate)] };
    });
  }

  function handleUpdateMilestone(id: string, data: Partial<Milestone>) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (() => {
        const existing = (prev.milestones ?? []).find((item) => item.id === id);
        if (!existing) return prev.milestones ?? [];
        const other = (prev.milestones ?? []).filter((item) => item.planId !== existing.planId);
        const own = (prev.milestones ?? []).filter((item) => item.planId === existing.planId);
        return [...other, ...cascadeMilestoneDates(own, id, { ...data, updatedAt: new Date().toISOString() })];
      })(),
    }));
  }

  function handleDeleteMilestone(id: string) {
    const milestone = (schedule.milestones ?? []).find((item) => item.id === id);
    openConfirm({
      title: "Delete milestone?",
      description: milestone?.title ? `"${milestone.title}" will be removed from the roadmap.` : "This milestone will be removed from the roadmap.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () =>
        setSchedule((prev) => {
          const existing = (prev.milestones ?? []).find((item) => item.id === id);
          if (!existing) return prev;
          const plan = prev.plans.find((item) => item.id === existing.planId);
          const other = (prev.milestones ?? []).filter((item) => item.planId !== existing.planId);
          const own = (prev.milestones ?? []).filter((item) => item.planId === existing.planId && item.id !== id);
          return { ...prev, milestones: [...other, ...normalizeMilestoneTimeline(own, plan?.startDate)] };
        }),
    });
  }

  function handleCompleteMilestone(id: string) {
    setSchedule((prev) => {
      const existing = (prev.milestones ?? []).find((item) => item.id === id);
      if (!existing) return prev;
      const plan = prev.plans.find((item) => item.id === existing.planId);
      const other = (prev.milestones ?? []).filter((item) => item.planId !== existing.planId);
      const own = (prev.milestones ?? []).filter((item) => item.planId === existing.planId).map((item) =>
        item.id === id
          ? { ...item, status: "completed" as const, actualCompletedDate: todayISO(), completionStatus: "completed" as const, completedDate: todayISO(), updatedAt: new Date().toISOString() }
          : item
      );
      return { ...prev, milestones: [...other, ...normalizeMilestoneTimeline(own, plan?.startDate)] };
    });
  }

  function handleCreateNote(input: Partial<Pick<Note, "title" | "body" | "tags">> = {}) {
    const now = new Date().toISOString();
    const note: Note = { id: uid(), title: input.title ?? "", body: input.body ?? "", tags: input.tags ?? [], createdAt: now, updatedAt: now };
    setSchedule((prev) => ({ ...prev, notes: [note, ...(prev.notes ?? [])] }));
    return note.id;
  }

  function handleUpdateNote(id: string, patch: Partial<Pick<Note, "title" | "body" | "pinned" | "tags" | "linkedTaskIds">>) {
    setSchedule((prev) => ({ ...prev, notes: (prev.notes ?? []).map((note) => (note.id === id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note)) }));
  }

  function handleDeleteNote(id: string) {
    setSchedule((prev) => ({ ...prev, notes: (prev.notes ?? []).filter((note) => note.id !== id) }));
  }

  const notesLinkableTasks = useMemo(() => {
    const byId = new Map<string, Task>();
    for (const day of DAYS) for (const task of schedule.activities[day] ?? []) if (!byId.has(task.id)) byId.set(task.id, task);
    return Array.from(byId.values());
  }, [schedule.activities]);

  const renderTaskList = (tasks: Task[], day: DayKey, dateISO: string, emptyAction?: () => void) => (
    <div className="flex flex-col gap-3">
      {tasks.length === 0 ? (
        <EmptyPanel
          icon={IconCalendar}
          title="Nothing scheduled"
          description="Add your first task for this day to start building your schedule."
          action={emptyAction ? { label: "Add Task", onClick: emptyAction } : undefined}
        />
      ) : (
        tasks.map((task) => (
          <IOSLightTaskCard
            key={task.id}
            task={task}
            linkedPlan={task.planId ? plansById.get(task.planId) ?? null : null}
            readOnly={dateISO !== todayISO()}
            onToggleComplete={(id, ids) => handleToggleTaskComplete(id, ids, day, dateISO)}
            onEdit={() => openEditSheet(task, dateISO)}
            onOpenSubtasks={() => setSubtasksRef({ id: task.id, day, dateISO })}
          />
        ))
      )}
    </div>
  );

  const content = (() => {
    if (!ready) {
      return (
        <div className="px-4 pt-6">
          <EmptyPanel icon={IconCalendar} title="Loading schedule" description="Preparing your local schedule and sync state." />
        </div>
      );
    }

    if (activeTab === 4) {
      return (
        <ErrorBoundary section name="Dashboard">
          <div className="space-y-5 px-4 pt-5">
            <div className="grid grid-cols-3 gap-2.5">
              <StatTile icon={IconListCheck} value={todayTasks.length} label={statLabel(todayDone, todayTasks.length)} />
              <StatTile icon={IconClipboardData} value={schedule.plans.length} label="Plans" />
              <StatTile icon={IconRepeat} value={schedule.rituals?.length ?? 0} label="Habits" />
            </div>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[16px] font-extrabold text-neutral-950 dark:text-white">Today's tasks</h2>
                <button type="button" onClick={() => setActiveTab(0)} className="text-[13px] font-bold text-neutral-500 dark:text-neutral-400">
                  Open
                </button>
              </div>
              {renderTaskList(todayTasks, todayKey, todayISO(), () => openCreateSheet())}
            </section>
          </div>
        </ErrorBoundary>
      );
    }

    if (activeTab === 0) {
      return (
        <ErrorBoundary section name="Today list">
          <div className="space-y-5 px-4 pt-5">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[20px] font-bold text-neutral-900 dark:text-white">{weekLabel}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => { setWeekOffset(0); setActiveDay(todayKey); }} className="mr-1 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                    Today
                  </button>
                  <button type="button" onClick={() => setWeekOffset((offset) => offset - 1)} aria-label="Previous week" className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400">
                    <IconChevronLeft size={16} strokeWidth={2} />
                  </button>
                  <button type="button" onClick={() => setWeekOffset((offset) => offset + 1)} aria-label="Next week" className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 dark:text-neutral-400">
                    <IconChevronRight size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0.5 border-b border-neutral-200/80 pb-3 dark:border-white/[0.06]">
                {weekDates.map(({ day, date }) => {
                  const isActive = day === activeDay;
                  const isToday = localISODate(date) === todayISO();
                  return (
                    <button key={day} type="button" onClick={() => setActiveDay(day)} className={`flex flex-col items-center gap-2 rounded-[14px] py-3 ${isActive ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950" : ""}`}>
                      <span className={`text-[11px] font-semibold leading-none ${isActive ? "opacity-60" : isToday ? "text-rose-500" : "text-neutral-400 dark:text-neutral-500"}`}>{DAY_LABELS[day]}</span>
                      <span className={`text-[18px] font-bold leading-none tabular-nums ${!isActive && isToday ? "text-rose-500" : ""}`}>{date.getDate()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-3 text-[13px] font-semibold text-neutral-500 dark:border-white/[0.08] dark:bg-neutral-900 dark:text-neutral-400">
              Timeline editor is paused on iOS safe mode. Desktop keeps the full drag timeline.
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[22px] font-black text-neutral-950 dark:text-white">{activeDay === todayKey ? "Today's Task" : DAY_LABELS[activeDay]}</h2>
                <p className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">{dayDone}/{dayTasksView.length} done</p>
              </div>
              <button type="button" onClick={() => openCreateSheet()} className="inline-flex h-10 items-center gap-1 rounded-full bg-neutral-950 px-4 text-[13px] font-bold text-white dark:bg-white dark:text-neutral-950">
                <IconPlus size={16} strokeWidth={2.4} />
                Task
              </button>
            </div>
            {renderTaskList(dayTasksView, activeDay, activeDateISO, () => openCreateSheet())}
          </div>
        </ErrorBoundary>
      );
    }

    if (activeTab === 1) {
      if (selectedPlan) {
        return (
          <IOSMotionBoundary>
            <ErrorBoundary section name="Plans">
              <PlanDetailView
                plan={selectedPlan}
                schedule={schedule}
                milestones={schedule.milestones ?? []}
                onDeletePlan={handleDeletePlan}
                onAddTask={(planId) => openCreateSheet(planId)}
                onEditTask={(task) => openEditSheet(task)}
                onDeleteLinkedTask={handleDeleteLinkedTask}
                onAddTracker={(planId, title, unit, goalDirection, id, goalValue) => {
                  setSchedule((prev) => ({
                    ...prev,
                    progressTrackers: [...prev.progressTrackers, { id: id ?? uid(), planId, title, type: "number", unit: unit || undefined, goalDirection, goalValue }],
                  }));
                }}
                onUpdateTracker={(trackerId, data) => {
                  setSchedule((prev) => ({
                    ...prev,
                    progressTrackers: prev.progressTrackers.map((tracker) => (tracker.id === trackerId ? { ...tracker, ...data, unit: data.unit || undefined } : tracker)),
                  }));
                }}
                onDeleteTracker={(trackerId) => {
                  setSchedule((prev) => ({
                    ...prev,
                    progressTrackers: prev.progressTrackers.filter((tracker) => tracker.id !== trackerId),
                    metricEntries: prev.metricEntries.filter((entry) => entry.trackerId !== trackerId),
                  }));
                }}
                onOpenAddEntry={(tracker) => setEntryTracker(tracker)}
                onDeleteEntry={(entryId) => setSchedule((prev) => ({ ...prev, metricEntries: prev.metricEntries.filter((entry) => entry.id !== entryId) }))}
                onAddMilestone={(data) => handleAddMilestone(selectedPlan.id, data)}
                onUpdateMilestone={handleUpdateMilestone}
                onDeleteMilestone={handleDeleteMilestone}
                onCompleteMilestone={handleCompleteMilestone}
                onLinkTrackerToMilestone={(milestoneId, trackerId) => {
                  setSchedule((prev) => ({
                    ...prev,
                    milestones: (prev.milestones ?? []).map((milestone) =>
                      milestone.id === milestoneId ? { ...milestone, linkedTrackers: [...new Set([...(milestone.linkedTrackers ?? []), trackerId])] } : milestone
                    ),
                  }));
                }}
                onUpdateCoachMessages={(planId: string, messages: PlanCoachMessage[]) => {
                  setSchedule((prev) => ({ ...prev, plans: prev.plans.map((plan) => (plan.id === planId ? { ...plan, coachMessages: messages } : plan)) }));
                }}
              />
            </ErrorBoundary>
          </IOSMotionBoundary>
        );
      }
      return (
        <ErrorBoundary section name="Plans">
          <div className="space-y-3 px-4 pt-5">
            {schedule.plans.length === 0 ? (
              <EmptyPanel icon={IconClipboardData} title="No plans yet" description="Create a plan first, then add tasks to schedule your day." action={{ label: "Create Plan", onClick: () => setAddingPlan(true) }} />
            ) : (
              schedule.plans.map((plan) => {
                const taskCount = DAYS.reduce((sum, day) => sum + schedule.activities[day].filter((task) => task.planId === plan.id).length, 0);
                const range = plan.startDate || plan.endDate
                  ? `${plan.startDate ? formatDate(plan.startDate) : "Anytime"}${plan.endDate ? ` - ${formatDate(plan.endDate)}` : ""}`
                  : "No date range";
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-left dark:border-white/[0.08] dark:bg-neutral-900"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[17px] font-black text-neutral-950 dark:text-white">{plan.title}</p>
                        <p className="mt-1 truncate text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">{range}</p>
                      </div>
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-bold text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-300">{taskCount} tasks</span>
                    </div>
                    {plan.description && <p className="line-clamp-2 text-[13px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">{plan.description}</p>}
                  </button>
                );
              })
            )}
          </div>
        </ErrorBoundary>
      );
    }

    if (activeTab === 2) {
      return (
        <IOSMotionBoundary>
          <ErrorBoundary section name="Routine">
            <RitualView
              rituals={schedule.rituals ?? []}
              completedIds={completedRitualIds}
              ritualCompletions={schedule.ritualCompletions ?? []}
              onToggleComplete={handleToggleRitualComplete}
              onAdd={handleAddRitual}
              onUpdate={handleUpdateRitual}
              onDelete={handleDeleteRitual}
              onReorder={(reordered) => setSchedule((prev) => ({ ...prev, rituals: reordered }))}
              addOpen={ritualAddOpen}
              onAddOpenChange={setRitualAddOpen}
              weekHistory={ritualWeekHistory}
            />
          </ErrorBoundary>
        </IOSMotionBoundary>
      );
    }

    if (activeTab === 5) {
      return (
        <IOSMotionBoundary>
          <ErrorBoundary section name="Settings">
            <SettingsView
              schedule={schedule}
              onClearData={clearData}
              onClearProgress={clearProgress}
              onUpdatePreferences={(patch) => setSchedule((prev) => ({ ...prev, preferences: { ...prev.preferences, ...patch } }))}
              onClose={() => setActiveTab(4)}
            />
          </ErrorBoundary>
        </IOSMotionBoundary>
      );
    }

    if (activeTab === 6) {
      return (
        <IOSMotionBoundary>
          <ErrorBoundary section name="Notes">
            <NotesView
              notes={schedule.notes}
              onCreate={handleCreateNote}
              onUpdate={handleUpdateNote}
              onDelete={handleDeleteNote}
              onClose={() => setActiveTab(4)}
              tasks={notesLinkableTasks}
              plans={schedule.plans}
              onOpenTask={(taskId) => {
                const task = notesLinkableTasks.find((item) => item.id === taskId);
                if (task) openEditSheet(task);
              }}
            />
          </ErrorBoundary>
        </IOSMotionBoundary>
      );
    }

    return null;
  })();

  return (
    <main className="min-h-dvh bg-[#F5F5F5] text-neutral-900 dark:bg-[#111111] dark:text-white">
      <IOSHeader
        title={selectedPlan ? selectedPlan.title : activeTab === 0 ? "Today" : activeTab === 1 ? "Plans" : activeTab === 2 ? "Routine" : activeTab === 5 ? "Settings" : activeTab === 6 ? "Notes" : "Dashboard"}
        subtitle={authLabel}
        backLabel={selectedPlan ? "Plans" : undefined}
        onBack={selectedPlan ? () => setSelectedPlanId(null) : undefined}
        onSettings={() => { setSelectedPlanId(null); setActiveTab(5); }}
        onNotes={() => { setSelectedPlanId(null); setActiveTab(6); }}
      />
      <div className="pb-36 pt-[calc(env(safe-area-inset-top)+76px)]">{content}</div>

      {activeTab !== 6 && (
        <IOSBottomNav
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
          onCreateTask={() => openCreateSheet()}
          onCreatePlan={() => { setActiveTab(1); setSelectedPlanId(null); setAddingPlan(true); }}
          onCreateRitual={() => { setActiveTab(2); setRitualAddOpen(true); }}
        />
      )}

      {(taskSheetOpen || addingPlan || subtasksRef || entryTracker) && (
        <IOSMotionBoundary>
          <TaskSheet
            mode={taskSheetMode}
            task={taskSheetTask}
            plans={schedule.plans}
            activeDay={activeDay}
            activeDays={taskSheetActiveDays}
            isOpen={taskSheetOpen}
            initialPlanId={taskSheetPlanId}
            initialTaskType={taskSheetInitialType}
            occurrenceDateISO={taskSheetDateISO}
            canEditOccurrence={!!taskSheetDateISO && taskSheetDateISO >= todayISO()}
            onClose={closeTaskSheet}
            onSave={handleTaskSheetSave}
            onDelete={taskSheetTask ? () => { requestDeleteTask(taskSheetTask.id, activeDay); closeTaskSheet(); } : undefined}
            onResetOccurrence={taskSheetTask && taskSheetDateISO ? () => setSchedule(clearTaskException(taskSheetTask.id, taskSheetDateISO)) : undefined}
          />
          <AddPlanSheet open={addingPlan} onClose={() => setAddingPlan(false)} setSchedule={setSchedule} />
          <SubtasksSheet
            open={!!subtasksRef}
            task={subtasksTask}
            linkedPlan={subtasksTask?.planId ? plansById.get(subtasksTask.planId) ?? null : null}
            readOnly={subtasksRef?.dateISO !== todayISO()}
            onClose={() => setSubtasksRef(null)}
            onToggleSubtask={(taskId, subtaskId) => subtasksRef && handleToggleSubtask(taskId, subtaskId, subtasksRef.day, subtasksRef.dateISO)}
            onToggleComplete={(taskId, ids) => subtasksRef && handleToggleTaskComplete(taskId, ids, subtasksRef.day, subtasksRef.dateISO)}
            onMissed={(taskId, ids) => subtasksRef && handleMarkTaskMissed(taskId, ids, subtasksRef.day, subtasksRef.dateISO)}
            onEdit={subtasksTask ? () => { openEditSheet(subtasksTask, subtasksRef?.dateISO); setSubtasksRef(null); } : undefined}
          />
          <AddEntryModal
            isOpen={!!entryTracker}
            onClose={() => setEntryTracker(null)}
            metric={entryTracker ? { name: entryTracker.title, unit: entryTracker.unit ?? "" } : undefined}
            onSave={(value, date) => {
              if (!entryTracker) return;
              const entry: MetricEntry = { id: uid(), planId: entryTracker.planId, trackerId: entryTracker.id, value, date };
              setSchedule((prev) => ({ ...prev, metricEntries: [...prev.metricEntries, entry] }));
            }}
          />
        </IOSMotionBoundary>
      )}

      {taskDeleteDetails && (
        <ConfirmOverlay
          state={{
            title: "Delete task?",
            description: taskDeleteDetails.activeDays.length > 1
              ? `"${taskDeleteDetails.task.title}" appears on ${taskDeleteDetails.activeDays.length} days. Delete all copies?`
              : `"${taskDeleteDetails.task.title}" will be removed from this day.`,
            confirmLabel: taskDeleteDetails.activeDays.length > 1 ? "Delete all" : "Delete",
            destructive: true,
            onConfirm: () => performTaskDelete(taskDeleteDetails.activeDays.length > 1 ? "all" : "day"),
          }}
          onClose={() => setTaskDeleteRequest(null)}
        />
      )}
      {confirmState && <ConfirmOverlay state={confirmState} onClose={() => setConfirmState(null)} />}
      {toast && (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2.5 text-[14px] font-semibold text-white shadow-lg dark:bg-white dark:text-neutral-900">
          {toast}
        </div>
      )}
    </main>
  );
}
