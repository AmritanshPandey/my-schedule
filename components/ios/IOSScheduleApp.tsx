"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconClipboardData,
  IconClipboardList,
  IconClockHour3,
  IconEdit,
  IconFlame,
  IconNotes,
  IconPhoto,
  IconPlus,
  IconRepeat,
  IconSettings,
  IconTargetArrow,
  IconTrash,
} from "@tabler/icons-react";
import type { TaskSaveData } from "@/components/task/TaskSheet";
import type { MilestoneSaveData } from "@/components/plan/MilestoneSheet";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { CategoryDraft } from "@/components/category/CategorySheet";
import IOSBottomNav from "@/components/ios/IOSBottomNav";
import IOSTimelineRow from "@/components/ios/IOSTimelineRow";
import { useNowMinutes } from "@/lib/timeline/useNowMinutes";
import SignInPrompt from "@/components/auth/SignInPrompt";
import TodayTaskList from "@/components/today/TodayTaskList";
import { selectTodayTasks } from "@/lib/todayTasks";
import DayActionsSheet from "@/components/DayActionsSheet";
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
  type TaskTypeValue,
  resetStaleCompletions,
} from "@/lib/useScheduleDB";
import { useScheduleDB } from "@/lib/useScheduleDB";
import { accentStyles, categoryHex, resolveAccentColor } from "@/lib/colorSystem";
import { canDeleteCategory, categoryUsageCounts, ensureCategoryIn } from "@/lib/taskCategories";
import { taskIdentity, categoriesById } from "@/lib/taskIdentity";
import { constrainTaskToPlanWindow } from "@/lib/planTaskWindow";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { useReminders } from "@/lib/useReminders";
import { bootLog, isIOSSafeMode, isStandalonePWA } from "@/lib/iosSafeMode";
import { todayISO, localISODate, addDaysToISO, formatDate } from "@/lib/dateUtils";
import { quickAmountsForUnit } from "@/lib/quickAmounts";
import { sumEntriesForDate } from "@/lib/metricEntries";
import { createInboxNoteInput } from "@/lib/notes/dailyCapture";
import {
  applyTaskDelete,
  createTask,
  createTaskDeleteSnapshot,
  sortTasksByTime,
  getSlots,
  uid,
  updateTaskDays,
  updateTaskPerDay,
  swapDays,
  duplicateDay,
  setTaskException,
  clearTaskException,
  addSubtaskToTasks,
  type TaskDeleteScope,
} from "@/lib/taskMutations";
import { completionForDate, getTaskCheckableItems, getTaskSubtaskSummary, isTaskCompleted, isTaskResolved, isTrackedTask, markTaskMissed, snoozeTaskLater, toggleSlotComplete, toggleSubtaskComplete, toggleTaskFromCheckbox } from "@/lib/taskCompletion";
import { diffException, isTaskScheduledOn, resolveOccurrence } from "@/lib/taskOccurrence";
import { cascadeMilestoneDates, normalizeMilestoneTimeline } from "@/lib/roadmapDates";
import { toggleRitualCompletion, appendRitualLog, undoLastRitualLog, toggleRitualStep, removeRitualLog } from "@/lib/ritualCompletions";
import { MAX_RITUALS } from "@/lib/ritualColors";
import { deleteGoal } from "@/lib/goalMutations";
import { formatDisplayTime, inputToDisplayTime, minutesToInputTime, parseTimeToMinutes, toScheduleDayMinutes } from "@/lib/timeUtils";
import { computeTrend } from "@/lib/trendUtils";
import { getPlanCardStats } from "@/lib/planInsights";
import { calculateExecutionStreak } from "@/lib/consistency/calculateExecutionStreak";
import { calculateRitualStats, ritualScheduledOn } from "@/lib/consistency/calculateRitualStreak";
import { completedRitualIdsOn } from "@/lib/consistency/ritualDayStatus";
import { useAIEnabled } from "@/lib/ai/useAIEnabled";
import { computeExecutionTrend } from "@/lib/executionAnalytics";
import { selectNeedsAttention, type MissedTask } from "@/lib/needsAttention";
import NeedsAttentionCard from "@/components/NeedsAttentionCard";
import MissedTaskSheet from "@/components/MissedTaskSheet";
import { rescheduleMissedTaskOnce, acknowledgeMiss } from "@/lib/missedRecovery";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";
import CheckDraw from "@/components/ui/CheckDraw";
import Sparkline from "@/components/ui/Sparkline";
import TrendChange from "@/components/ui/TrendChange";
import type { CreateTaskFromNoteInput } from "@/components/notes/NotesView";
import { useCoachTour } from "@/lib/onboarding/useCoachTour";
import { TOUR_STEPS, type TourId } from "@/lib/onboarding/tours";

const IOSMotionBoundary = dynamic(() => import("@/components/ios/IOSMotionBoundary"), { ssr: false });
const TaskSheet = dynamic(() => import("@/components/task/TaskSheet").then((m) => ({ default: m.TaskSheet })), { ssr: false });
const AddPlanSheet = dynamic(() => import("@/components/plan/AddPlanSheet"), { ssr: false });
const EditPlanSheet = dynamic(() => import("@/components/plan/EditPlanSheet"), { ssr: false });
const PlanDetailView = dynamic(() => import("@/components/plan/PlanDetailView"), { ssr: false });
const GoalListSheet = dynamic(() => import("@/components/goal/GoalListSheet"), { ssr: false });
const RitualView = dynamic(() => import("@/components/activity/RitualView"), { ssr: false });
// Small hand-rolled SVG donut with no chart dependency — safe to load eagerly
// in the iOS shell (see the first-load guard in tests/core-logic.test.mjs).
const DayBreakdownCard = dynamic(() => import("@/components/DayBreakdownCard"), { ssr: false });
// Companion analytics — same hand-rolled, framer-free SVG/CSS as the donut, so
// they render on the Dashboard tab which has no LazyMotion ancestor.

const CompletionTrendCard = dynamic(() => import("@/components/analytics/CompletionTrendCard"), { ssr: false });
const SettingsView = dynamic(() => import("@/components/SettingsView").then((m) => ({ default: m.SettingsView })), { ssr: false });
const AIView = dynamic(() => import("@/components/AIView").then((m) => ({ default: m.AIView })), { ssr: false });
const DayWallpaperSheet = dynamic(() => import("@/components/DayWallpaperSheet"), { ssr: false });
const NotesView = dynamic(() => import("@/components/notes/NotesView"), { ssr: false });
const TaskDetailView = dynamic(() => import("@/components/activity/TaskDetailView"), { ssr: false });
const AddEntryModal = dynamic(() => import("@/components/AddEntryModal"), { ssr: false });
const RoutineDetailView = dynamic(() => import("@/components/activity/RoutineDetailView"), { ssr: false });
const RitualSheet = dynamic(() => import("@/components/activity/RitualSheet").then((m) => ({ default: m.RitualSheet })), { ssr: false });
const CoachMarks = dynamic(() => import("@/components/onboarding/CoachMarks"), { ssr: false });

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


function taskDurationMinutes(task: Task): number {
  const start = parseTimeToMinutes(task.startTime);
  const end = parseTimeToMinutes(task.endTime);
  if (start === null || end === null) return 0;
  const normalizedStart = toScheduleDayMinutes(start);
  let normalizedEnd = toScheduleDayMinutes(end);
  if (normalizedEnd <= normalizedStart) normalizedEnd += 24 * 60;
  return Math.max(0, normalizedEnd - normalizedStart);
}

function formatMinutesBrief(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function quickTaskTimeRange(now = new Date()): { startTime: string; endTime: string } {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = Math.min(23 * 60 + 30, Math.ceil(current / 15) * 15);
  return {
    startTime: inputToDisplayTime(minutesToInputTime(start)),
    endTime: inputToDisplayTime(minutesToInputTime(start + 15)),
  };
}

function formatTrackerValue(entry: MetricEntry | null, tracker: ProgressTracker): string {
  if (!entry) return "No entries yet";
  const value = Number.isInteger(entry.value) ? String(entry.value) : entry.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${value}${tracker.unit ?? ""}`;
}

function IOSHeader({
  title,
  onBack,
  actions,
  onSettings,
  onNotes,
}: {
  title: string;
  onBack?: () => void;
  actions?: Array<{
    icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
    label: string;
    onClick: () => void;
    destructive?: boolean;
  }>;
  onSettings?: () => void;
  onNotes?: () => void;
}) {
  return (
    <header data-glass className="fixed inset-x-0 top-0 z-30 border-b border-neutral-200/80 bg-[#F3F4F1]/90 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+10px)] backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0E0E0E]/90">
      <div className="flex h-12 items-center justify-between gap-3">
        <div className="min-w-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-1.5 flex items-center gap-1 text-left"
            >
              <IconChevronLeft size={24} strokeWidth={1.5} className="shrink-0 text-neutral-950 dark:text-white" />
              <h1 className="truncate text-[16px] font-semibold leading-none text-neutral-950 dark:text-white">{title}</h1>
            </button>
          ) : (
            <h1 className="truncate text-[16px] font-semibold leading-none text-neutral-950 dark:text-white">{title}</h1>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions?.length ? (
            actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  aria-label={action.label}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                    action.destructive
                      ? "text-neutral-500 hover:bg-rose-500/10 hover:text-rose-500 dark:text-neutral-400 dark:hover:text-rose-400"
                      : "text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
                  }`}
                >
                  <Icon size={21} strokeWidth={2} />
                </button>
              );
            })
          ) : (
            <>
              {onNotes && (
                <button
                  type="button"
                  onClick={onNotes}
                  aria-label="Notes"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-200/70 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
                >
                  <IconNotes size={20} strokeWidth={2} />
                </button>
              )}
              {onSettings && (
                <button
                  type="button"
                  onClick={onSettings}
                  aria-label="Settings"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-200/70 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
                >
                  <IconSettings size={20} strokeWidth={2} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  detail,
  iconClass,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  value: number | string;
  label: string;
  detail: string;
  iconClass?: string;
}) {
  return (
    <div className={`${CARD} p-3`}>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon size={13} strokeWidth={2} className={iconClass ?? "text-neutral-400 dark:text-neutral-500"} />
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-neutral-400 dark:text-neutral-500">{label}</p>
      </div>
      <p className="truncate text-[24px] font-bold leading-none text-neutral-900 dark:text-white">{value}</p>
      <p className="mt-1 truncate text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{detail}</p>
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
      <p className="text-[16px] font-extrabold text-neutral-900 dark:text-white">{title}</p>
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
      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-5 dark:border-white/[0.10] dark:bg-neutral-900">
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
  bootLog(isIOSSafeMode() ? "IOS_SAFE_MODE_ENABLED" : "PHONE_SHELL_ENABLED");
  void isStandalonePWA();

  const { schedule, setSchedule, ready, clearData, clearProgress, restoreData } = useScheduleDB();
  useReminders(schedule, ready);
  const [todayKey, setTodayKey] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [dayActionsOpen, setDayActionsOpen] = useState(false);
  const [missedSheet, setMissedSheet] = useState<MissedTask | null>(null);
  // Today tab starts as a clean execution surface; editing affordances (per-card
  // pencil, day actions, wallpaper, add-task) are revealed only in edit mode.
  const [todayEditMode, setTodayEditMode] = useState(false);
  // Drives the timeline "in progress" ring on today's list. One 30s tick for the
  // whole Today list (the desktop isolates this to a leaf layer; the mobile list
  // is small enough to re-render).
  const nowMinutes = useNowMinutes();
  const [activeTab, setActiveTab] = useState(4);
  const aiEnabled = useAIEnabled();

  // Settings is the only way into the AI tab, and that link is gated on the
  // same value — but the AI screen carries its own master switch, so turning
  // AI off from there would otherwise leave the user sitting on it.
  useEffect(() => {
    if (!aiEnabled && activeTab === 7) setActiveTab(5);
  }, [aiEnabled, activeTab]);

  // A short, skippable coach-mark tour per tab — mirrors the desktop shell's
  // wiring in ScheduleApp.tsx. This is the mobile shell (see
  // ScheduleAppClient.tsx's shouldUseIOSAppShell fork), a completely separate
  // component tree, so it needs its own copy of this hook-up rather than
  // inheriting the desktop one. Overview (4) and Settings (5) intentionally
  // have no entry in TOUR_STEPS — see lib/onboarding/tours.ts.
  const activeTourId: TourId | null =
    activeTab === 0 ? "today" : activeTab === 1 ? "plans" : activeTab === 2 ? "routine" : null;
  const tour = useCoachTour(activeTourId ?? "none", { enabled: activeTourId !== null, delayMs: 1200 });

  const [iosSetupDismissed, setIosSetupDismissed] = useState(() => {
    try {
      return localStorage.getItem("planr-getting-started-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const dismissIosSetup = useCallback(() => {
    setIosSetupDismissed(true);
    try {
      localStorage.setItem("planr-getting-started-dismissed", "1");
    } catch {
      // storage unavailable — dismissal just won't persist
    }
  }, []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [taskSheetMode, setTaskSheetMode] = useState<"create" | "edit">("create");
  const [taskSheetTask, setTaskSheetTask] = useState<Task | null>(null);
  const [taskSheetPlanId, setTaskSheetPlanId] = useState<string | null>(null);
  const [taskSheetDateISO, setTaskSheetDateISO] = useState("");
  const [taskSheetInitialType, setTaskSheetInitialType] = useState<TaskTypeValue>("task");
  const [addingPlan, setAddingPlan] = useState(false);
  const [goalsSheetOpen, setGoalsSheetOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [ritualAddOpen, setRitualAddOpen] = useState(false);
  const [detailRitualId, setDetailRitualId] = useState<string | null>(null);
  const [editRitualId, setEditRitualId] = useState<string | null>(null);
  const detailRitual = detailRitualId ? (schedule.rituals ?? []).find((r) => r.id === detailRitualId) ?? null : null;
  const editingRitual = editRitualId ? (schedule.rituals ?? []).find((r) => r.id === editRitualId) ?? null : null;
  const [subtasksRef, setSubtasksRef] = useState<{ id: string; day: DayKey; dateISO: string } | null>(null);
  const [entryTracker, setEntryTracker] = useState<ProgressTracker | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [taskDeleteRequest, setTaskDeleteRequest] = useState<TaskDeleteRequest | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [initialNoteId, setInitialNoteId] = useState<string | null>(null);
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

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
  /** Persist a category created from inside the task sheet; returns its id. */
  const handleCreateCategory = useCallback((draft: CategoryDraft) => {
    const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setSchedule((prev) => ({ ...prev, categories: [...prev.categories, { id, ...draft }] }));
    return id;
  }, [setSchedule]);

  const categoryUsage = useMemo(() => categoryUsageCounts(schedule.activities), [schedule.activities]);
  const handleUpdateCategory = useCallback((id: string, draft: CategoryDraft) => {
    setSchedule((prev) => ({
      ...prev,
      categories: prev.categories.map((c) => (c.id === id ? { ...c, ...draft } : c)),
    }));
  }, [setSchedule]);

  // Refuses when the category is still in use — the picker disables the button
  // for the same reason, this is the guard behind it.
  const handleDeleteCategory = useCallback((id: string) => {
    setSchedule((prev) => {
      if (!canDeleteCategory(id, categoryUsageCounts(prev.activities))) return prev;
      return { ...prev, categories: prev.categories.filter((c) => c.id !== id) };
    });
  }, [setSchedule]);

  const categoryMap = useMemo(() => categoriesById(schedule.categories), [schedule.categories]);

  const taskEffectiveItemCount = useCallback(
    (task: Task) => {
      const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
      return getTaskSubtaskSummary(task, linkedPlan).totalCount;
    },
    [plansById]
  );
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
  // Shared with the desktop dashboard so the two cards can't drift again.
  const { tasks: todayTasks, done: todayDone } = useMemo(
    () => selectTodayTasks(schedule, todayISO(), todayKey),
    [schedule, todayKey]
  );
  const selectedPlan = selectedPlanId ? plansById.get(selectedPlanId) ?? null : null;
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

  // Counts cover tracked work only. dayTasksView keeps commitments — it drives
  // the rendered day list, which does show them. todayTasks is already
  // tracked-only (selectTodayTasks), so todayDone comes straight from it.
  const dayTracked = useMemo(() => dayTasksView.filter(isTrackedTask), [dayTasksView]);
  const dayDone = dayTracked.filter((task) => isTaskCompleted(task, taskEffectiveItemCount(task))).length;
  const todayOpenTasks = useMemo(
    () => todayTasks.filter((task) => !isTaskResolved(task, taskEffectiveItemCount(task))),
    [todayTasks, taskEffectiveItemCount]
  );
  const remainingPlannedMinutes = useMemo(
    () => todayOpenTasks.reduce((sum, task) => sum + taskDurationMinutes(task), 0),
    [todayOpenTasks]
  );
  const dashboardProgressPct = todayTasks.length > 0 ? Math.round((todayDone / todayTasks.length) * 100) : 0;
  const executionStreak = useMemo(() => calculateExecutionStreak(schedule, todayISO()), [schedule]);
  const missedThisWeek = useMemo(() => computeExecutionTrend(schedule).currentMissed, [schedule]);
  const needsAttention = useMemo(() => {
    // trackingType-aware — a half-logged quantity routine must still count as
    // unfinished here, or its at-risk warning is silently suppressed.
    const doneRitualIds = completedRitualIdsOn(
      schedule.rituals ?? [],
      schedule.ritualCompletions ?? [],
      todayISO(),
    );
    return selectNeedsAttention(schedule, todayISO(), todayKey, doneRitualIds);
  }, [schedule, todayKey]);
  // All routines with streak/adherence/dots (shared helper), due-today first then
  // most-at-risk — matches the desktop Routine Consistency card.
  const ritualConsistency = useMemo(() => {
    const completions = schedule.ritualCompletions ?? [];
    return (schedule.rituals ?? [])
      .map((ritual) => {
        const { streak, adherencePct, dots } = calculateRitualStats(ritual, completions, todayISO());
        return { ritual, streak, adherencePct, dots, dueToday: ritualScheduledOn(ritual, todayKey) };
      })
      .sort((a, b) =>
        a.dueToday !== b.dueToday ? (a.dueToday ? -1 : 1) : a.adherencePct - b.adherencePct,
      );
  }, [schedule.rituals, schedule.ritualCompletions, todayKey]);
	  const overviewTrackers = useMemo(() => {
	    const storedTrackers = schedule.progressTrackers ?? [];
    const fallbackTrackers: ProgressTracker[] = storedTrackers.length > 0
      ? []
      : schedule.plans.flatMap((plan) => {
        if (plan.metric) {
          return [{
            id: `${plan.id}-tracker-main`,
            planId: plan.id,
            title: plan.metric.name,
            type: "number" as const,
            unit: plan.metric.unit,
          }];
        }
        const fields = plan.metaFields?.length
          ? plan.metaFields.map((field) => ({ title: field, unit: "" }))
          : (plan.summary ?? []).map((field) => ({ title: field.label, unit: field.unit }));
        return fields.map((field) => ({
          id: `${plan.id}-tracker-${field.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          planId: plan.id,
          title: field.title,
          type: "number" as const,
          unit: field.unit,
        }));
      });

    return [...storedTrackers, ...fallbackTrackers]
      .map((tracker) => {
        const entries = (schedule.metricEntries ?? [])
          .filter((entry) => entry.trackerId === tracker.id)
          .map((entry, entryIndex) => ({ entry, entryIndex }))
          .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.entryIndex - b.entryIndex)
          .map((item) => item.entry);
        const latest = entries.at(-1) ?? null;
        const previous = entries.at(-2) ?? null;
        const trend = latest && previous
          ? computeTrend({
            previous: previous.value,
            current: latest.value,
            goalDirection: tracker.goalDirection ?? "increase_good",
          })
          : null;

        return {
          tracker,
          latest,
          plan: schedule.plans.find((plan) => plan.id === tracker.planId),
          // Chronological (oldest first) so the sparkline reads left-to-right.
          series: entries.slice(-8).map((entry) => entry.value),
          trend,
          hasEntries: entries.length > 0,
        };
      })
	      .sort((a, b) => Number(b.hasEntries) - Number(a.hasEntries) || (b.latest?.date ?? "").localeCompare(a.latest?.date ?? "") || a.tracker.title.localeCompare(b.tracker.title));
	  }, [schedule.metricEntries, schedule.plans, schedule.progressTrackers]);

  const overviewTrackerGroups = useMemo(() => {
    const groups: Array<{ key: string; plan?: Plan; trackers: typeof overviewTrackers }> = [];
    const byPlan = new Map<string, number>();
    for (const row of overviewTrackers) {
      const key = row.plan?.id ?? "__other__";
      let index = byPlan.get(key);
      if (index === undefined) {
        index = groups.length;
        byPlan.set(key, index);
        groups.push({ key, plan: row.plan, trackers: [] });
      }
      groups[index].trackers.push(row);
    }
    return groups;
  }, [overviewTrackers]);

  // Every plan: consistency is what this card reports, and every plan has a
  // consistency score with or without milestones. A milestone-less plan just
  // omits its milestone line rather than being dropped from the list.
  const overviewPlanConsistency = useMemo(() =>
    schedule.plans.map((plan) => {
      const milestones = (schedule.milestones ?? []).filter((milestone) => milestone.planId === plan.id);
      const { consistency } = getPlanCardStats(plan, schedule.activities, todayKey, schedule.preferences?.startDate);
      const milestonesDone = milestones.filter((milestone) => milestone.status === "completed").length;
      return { plan, consistency, milestonesTotal: milestones.length, milestonesDone };
    }),
    [schedule.activities, schedule.milestones, schedule.plans, todayKey]
  );

	  const openConfirm = useCallback((state: ConfirmState) => setConfirmState(state), []);

  function openCreateSheet(initialPlanId?: string | null, initialType: TaskTypeValue = "task") {
    setTaskSheetPlanId(initialPlanId ?? null);
    setTaskSheetTask(null);
    setTaskSheetMode("create");
    setTaskSheetDateISO("");
    setTaskSheetInitialType(initialType);
    setTaskSheetOpen(true);
  }

  // PWA app-shortcut actions (manifest "shortcuts" → /?action=…)
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (!action) return;
    if (action === "add-task") {
      setActiveTab(0);
      openCreateSheet();
    } else if (action === "log-tracker") {
      setActiveTab(4); // Overview — trackers with inline log buttons
    }
    params.delete("action");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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
    if (data.taskId) {
      if (data.perDaySlots) {
        setSchedule(updateTaskPerDay(data.taskId, data.taskDraft, data.perDaySlots, data.repeatDays, data.planItems));
      } else {
        setSchedule(updateTaskDays(data.taskId, data.taskDraft, data.repeatDays, data.planItems));
      }
    } else {
      setSchedule(createTask(data.taskDraft, data.repeatDays, data.planItems));
    }
    closeTaskSheet();
  }

  function handleToggleTaskComplete(taskId: string, allSubtaskIds: string[], day: DayKey = activeDay, dateISO?: string) {
    if (dateISO && dateISO !== todayISO()) return;
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        // A missed task un-marks rather than completing — shared with the
        // desktop shell so the two can't disagree on what a tap means.
        [day]: (prev.activities[day] ?? []).map((task) =>
          task.id === taskId ? { ...task, ...toggleTaskFromCheckbox(task, allSubtaskIds) } : task
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
          const linkedPlan = task.planId ? prev.plans.find((plan) => plan.id === task.planId) ?? null : null;
          const totalSubtasks = getTaskSubtaskSummary(task, linkedPlan).totalCount;
          return { ...task, ...toggleSubtaskComplete(task, subtaskId, totalSubtasks) };
        }),
      },
    }));
  }

  // Independent completion for one phase of a multi-slot task (same-day
  // multiple time blocks) — mirrors handleToggleSubtask, keyed by slot index.
  function handleToggleSlot(taskId: string, slotIndex: number, day: DayKey = activeDay, dateISO?: string) {
    if (dateISO && dateISO !== todayISO()) return;
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [day]: (prev.activities[day] ?? []).map((task) => {
          if (task.id !== taskId) return task;
          const linkedPlan = task.planId ? prev.plans.find((plan) => plan.id === task.planId) ?? null : null;
          const totalSubtasks = getTaskSubtaskSummary(task, linkedPlan).totalCount;
          return { ...task, ...toggleSlotComplete(task, slotIndex, totalSubtasks) };
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

  /**
   * Push a task to the next free slot later today. Ports the desktop handler
   * (ScheduleApp.handleSnoozeTaskLater) so both shells defer identically —
   * this shell previously offered no way to defer a task at all.
   */
  function handleSnoozeTaskLater(taskId: string, day: DayKey = activeDay, dateISO?: string) {
    // Only today is editable — deferring a past/future occurrence is meaningless.
    if (dateISO && dateISO !== todayISO()) return;
    const task = (schedule.activities[day] ?? []).find((t) => t.id === taskId);
    if (!task) return;
    const patch = snoozeTaskLater(task);
    // No room left later today — say so rather than silently doing nothing.
    if (!patch.startTime) {
      haptic("light");
      setToast("No room left today — try tomorrow");
      return;
    }
    haptic("medium");
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [day]: (prev.activities[day] ?? []).map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
      },
    }));
    setToast(`Moved to ${formatDisplayTime(patch.startTime)}`);
  }

  /** Mark this date's occurrence skipped (or restore it). Mirrors desktop. */
  function handleSkipOccurrence(taskId: string, dateISO?: string) {
    const date = dateISO ?? todayISO();
    const isSkipped = DAYS.some((day) =>
      (schedule.activities[day] ?? []).some((t) => t.id === taskId && t.exceptions?.[date]?.skipped)
    );
    haptic("medium");
    // `{ skipped: false }` un-skips while preserving any other per-date edits.
    setSchedule(setTaskException(taskId, date, { skipped: !isSkipped }));
    setToast(isSkipped ? "Restored this day" : "Skipped this day");
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

  function handleToggleRitualComplete(id: string, dateISO: string = todayISO()) {
    setSchedule((prev) => {
      const completions = prev.ritualCompletions ?? [];
      return {
        ...prev,
        ritualCompletions: toggleRitualCompletion(completions, id, dateISO),
      };
    });
  }

  function handleLogRitualAmount(ritualId: string, amount: number, dateISO: string) {
    setSchedule((prev) => ({
      ...prev,
      ritualCompletions: appendRitualLog(prev.ritualCompletions ?? [], ritualId, dateISO, amount),
    }));
  }

  function handleUndoRitualLog(ritualId: string, dateISO: string) {
    setSchedule((prev) => ({
      ...prev,
      ritualCompletions: undoLastRitualLog(prev.ritualCompletions ?? [], ritualId, dateISO),
    }));
  }

  function handleToggleRitualStep(ritualId: string, stepId: string, dateISO: string = todayISO()) {
    setSchedule((prev) => ({
      ...prev,
      ritualCompletions: toggleRitualStep(prev.ritualCompletions ?? [], ritualId, dateISO, stepId),
    }));
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

  function handleDeleteGoal(goalId: string) {
    const goal = schedule.goals?.find((item) => item.id === goalId);
    openConfirm({
      title: "Delete goal?",
      description: goal?.title
        ? `"${goal.title}" will be deleted. Linked plans are kept — they'll just no longer be tied to this goal.`
        : "This goal will be deleted. Linked plans are kept.",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: () => setSchedule((prev) => deleteGoal(prev, goalId)),
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

  const handleInitialNoteOpened = useCallback(() => setInitialNoteId(null), []);

  function openQuickNote() {
    const id = handleCreateNote(createInboxNoteInput());
    setSelectedPlanId(null);
    setInitialNoteId(id);
    setActiveTab(6);
  }

  function handleCreateTaskFromNote(input: CreateTaskFromNoteInput): string | undefined {
    const current = scheduleRef.current;
    const note = current.notes.find((item) => item.id === input.noteId);
    const linkedPlanId = note?.linkedTaskIds
      ?.map((taskId) => notesLinkableTasks.find((task) => task.id === taskId)?.planId)
      .find(Boolean);
    const plan = current.plans.find((item) => item.id === (input.planId ?? linkedPlanId)) ?? current.plans[0];
    if (!plan) {
      setToast("Create a plan first");
      return undefined;
    }
    const id = uid();
    setSchedule((prev) => {
      // The plan's icon is the best guess at what kind of work this is; it
      // creates the matching category if the user doesn't have one yet.
      const categoryDraft = [...prev.categories];
      const task: Task = {
        id,
        title: input.title,
        description: "Created from note",
        ...quickTaskTimeRange(),
        categoryId: ensureCategoryIn(categoryDraft, plan.emoji),
        planId: plan.id,
        ...constrainTaskToPlanWindow({}, plan),
        taskType: "task",
      };
      return {
        ...prev,
        categories: categoryDraft,
        activities: {
          ...prev.activities,
          [input.day]: [...(prev.activities[input.day] ?? []), task],
        },
      };
    });
    setToast("Added to Today");
    return id;
  }

  const notesLinkableTasks = useMemo(() => {
    const byId = new Map<string, Task>();
    for (const day of DAYS) for (const task of schedule.activities[day] ?? []) if (!byId.has(task.id)) byId.set(task.id, task);
    return Array.from(byId.values());
  }, [schedule.activities]);

  const renderTaskList = (tasks: Task[], day: DayKey, dateISO: string, emptyAction?: () => void, editMode = true) => {
    // A task scheduled at several times appears as its own entry at each time —
    // expand multi-slot tasks into per-slot rows and order the whole list
    // chronologically so slots interleave with other tasks by start time.
    const rows = tasks
      .flatMap((task) => {
        const slots = getSlots(task);
        return slots.length > 1
          ? slots.map((_, i) => ({ task, slotIndex: i as number | undefined }))
          : [{ task, slotIndex: undefined as number | undefined }];
      })
      .sort((a, b) => {
        const at = getSlots(a.task)[a.slotIndex ?? 0]?.startTime ?? "";
        const bt = getSlots(b.task)[b.slotIndex ?? 0]?.startTime ?? "";
        const am = parseTimeToMinutes(at);
        const bm = parseTimeToMinutes(bt);
        return toScheduleDayMinutes(am ?? 0) - toScheduleDayMinutes(bm ?? 0);
      });

    // Progress spine, today only: currentKey = the row whose slot window contains
    // "now" (the green pulsing ring); pastKeys = every row whose slot has already
    // elapsed. The connector fills emerald continuously up to now — including
    // held-time rows (Commute, Breakfast) that sit between completed tasks — so
    // the line reads as one connected progress bar instead of scattered green bits.
    const rowKeyOf = (task: Task, slotIndex?: number) =>
      slotIndex != null ? `${task.id}:${slotIndex}` : task.id;
    let currentKey: string | null = null;
    const pastKeys = new Set<string>();
    if (dateISO === todayISO()) {
      const nowSched = toScheduleDayMinutes(nowMinutes);
      for (const { task, slotIndex } of rows) {
        const s = getSlots(task)[slotIndex ?? 0];
        const sm = parseTimeToMinutes(s?.startTime ?? "");
        const em = parseTimeToMinutes(s?.endTime ?? "");
        if (sm == null || em == null) continue;
        const start = toScheduleDayMinutes(sm);
        let end = toScheduleDayMinutes(em);
        if (end <= start) end += 24 * 60; // spans midnight
        const key = rowKeyOf(task, slotIndex);
        if (nowSched >= end) pastKeys.add(key);
        if (currentKey == null && isTrackedTask(task) && nowSched >= start && nowSched < end) {
          const done = slotIndex != null
            ? (task.completedSlotIndices ?? []).includes(slotIndex)
            : !!task.completed;
          // Per-phase, not whole-task: otherwise the whole task's `missed`
          // flag (true once EVERY phase is missed) would still correctly gate
          // this, but reading it here instead of the phase's own flag is the
          // same "every block reads the same state" bug fixed elsewhere for
          // a repeated-same-day task with a mix of resolved/unresolved phases.
          const rowMissed = slotIndex != null
            ? (task.missedSlotIndices ?? []).includes(slotIndex)
            : !!task.missed;
          if (!done && !rowMissed) currentKey = key;
        }
      }
    }

    return (
      <div className="flex flex-col">
        {rows.length === 0 ? (
          <EmptyPanel
            icon={IconCalendar}
            title="Nothing scheduled"
            description="Add your first task for this day to start building your schedule."
            action={emptyAction ? { label: "Add Task", onClick: emptyAction } : undefined}
          />
        ) : (
          rows.map(({ task, slotIndex }, i) => {
            const rowKey = rowKeyOf(task, slotIndex);
            return (
              <IOSTimelineRow
                key={rowKey}
                task={task}
                slotIndex={slotIndex}
                isCurrent={rowKey === currentKey}
                isPast={pastKeys.has(rowKey)}
                isLast={i === rows.length - 1}
                isFirst={i === 0}
                linkedPlan={task.planId ? plansById.get(task.planId) ?? null : null}
                category={taskIdentity(task, categoryMap).category}
                readOnly={dateISO !== todayISO()}
                editMode={editMode}
                onToggleComplete={(id, ids) => handleToggleTaskComplete(id, ids, day, dateISO)}
                onMissed={(id, ids) => handleMarkTaskMissed(id, ids, day, dateISO)}
                onToggleSlot={(id, si) => handleToggleSlot(id, si, day, dateISO)}
                onEdit={() => openEditSheet(task, dateISO)}
                onOpenSubtasks={() => setSubtasksRef({ id: task.id, day, dateISO })}
              />
            );
          })
        )}
      </div>
    );
  };

  const content = (() => {
    if (!ready) {
      return (
        <div className="px-4 pt-6">
          <EmptyPanel icon={IconCalendar} title="Loading schedule" description="Preparing your local schedule and sync state." />
        </div>
      );
    }

    if (subtasksRef) {
      return (
        <IOSMotionBoundary>
          <ErrorBoundary section name="Task detail">
            <TaskDetailView
              task={subtasksTask}
              linkedPlan={subtasksTask?.planId ? plansById.get(subtasksTask.planId) ?? null : null}
              readOnly={subtasksRef.dateISO !== todayISO()}
              onClose={() => setSubtasksRef(null)}
              onToggleSubtask={(taskId, subtaskId) => handleToggleSubtask(taskId, subtaskId, subtasksRef.day, subtasksRef.dateISO)}
              onToggleComplete={(taskId, ids) => handleToggleTaskComplete(taskId, ids, subtasksRef.day, subtasksRef.dateISO)}
              onMissed={(taskId, ids) => handleMarkTaskMissed(taskId, ids, subtasksRef.day, subtasksRef.dateISO)}
              onSnooze={(taskId) => handleSnoozeTaskLater(taskId, subtasksRef.day, subtasksRef.dateISO)}
              onSkip={(taskId) => handleSkipOccurrence(taskId, subtasksRef.dateISO)}
              skipped={!!subtasksTask?.exceptions?.[subtasksRef.dateISO]?.skipped}
              canSkip={subtasksRef.dateISO >= todayISO()}
              onEdit={subtasksTask ? () => { openEditSheet(subtasksTask, subtasksRef.dateISO); setSubtasksRef(null); } : undefined}
              presentation="page"
            />
          </ErrorBoundary>
        </IOSMotionBoundary>
      );
    }

    if (activeTab === 4) {
      const setupSteps = [
        { label: "Create your first plan", tab: 1, done: schedule.plans.length > 0, Icon: IconClipboardList },
        { label: "Schedule today's tasks", tab: 0, done: Object.values(schedule.activities).some((a) => (a?.length ?? 0) > 0), Icon: IconCalendar },
        { label: "Build a daily routine", tab: 2, done: (schedule.rituals?.length ?? 0) > 0, Icon: IconRepeat },
      ];
      const setupDoneCount = setupSteps.filter((s) => s.done).length;
      const showSetup = !iosSetupDismissed && setupDoneCount < 2;
      const nextSetup = setupSteps.find((s) => !s.done) ?? setupSteps[0];

      return (
        <ErrorBoundary section name="Dashboard">
          <div data-testid="overview-dashboard" className="space-y-4 px-4 pt-5">
            {showSetup && (
              <section className="overflow-hidden rounded-2xl border border-emerald-600/40 bg-[#00A63E] p-4 text-neutral-950 dark:border-emerald-400/25 dark:bg-[#2FD46E]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.10em] text-neutral-950/60">Getting started</p>
                    <p className="mt-1 text-[19px] font-black leading-tight">Make your day trackable</p>
                  </div>
                  <span className="text-[12px] font-black tabular-nums text-neutral-950/70">{setupDoneCount}/3</span>
                </div>
                <div className="mt-3 mb-3.5 h-1.5 overflow-hidden rounded-full bg-neutral-950/15">
                  <div className="h-full rounded-full bg-neutral-950 transition-[width] duration-500" style={{ width: `${Math.max(8, (setupDoneCount / 3) * 100)}%` }} />
                </div>
                <div className="space-y-1.5">
                  {setupSteps.map(({ label, tab, done, Icon }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { haptic("light"); setActiveTab(tab); }}
                      className="flex w-full items-center gap-2.5 rounded-xl bg-neutral-950/5 px-3 py-2.5 text-left active:bg-neutral-950/10"
                    >
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${done ? "bg-neutral-950 text-white" : "bg-neutral-950/10 text-neutral-950"}`}>
                        {done ? <IconCheck size={15} strokeWidth={3} /> : <Icon size={15} strokeWidth={2.2} />}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-[14px] font-bold ${done ? "text-neutral-950/45 line-through" : "text-neutral-950"}`}>{label}</span>
                      {!done && <IconChevronRight size={16} strokeWidth={2.4} className="shrink-0 text-neutral-950/40" />}
                    </button>
                  ))}
                </div>
                <div className="mt-3.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => { haptic("light"); setActiveTab(nextSetup.tab); }}
                    className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-neutral-950 text-[14px] font-black text-white active:bg-neutral-800"
                  >
                    {nextSetup.tab === 1 ? "Create plan" : nextSetup.tab === 0 ? "Schedule tasks" : "Add routine"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { haptic("light"); dismissIosSetup(); }}
                    className="flex min-h-[44px] items-center justify-center rounded-xl px-4 text-[13px] font-bold text-neutral-950/55 active:text-neutral-950"
                  >
                    Skip
                  </button>
                </div>
              </section>
            )}
            <section data-testid="overview-streak-card" className={`${CARD} p-4`}>
              <div className="flex items-center gap-3">
                <span
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${
                    executionStreak.atRisk
                      ? "bg-amber-500/12 text-amber-500 dark:bg-amber-400/12 dark:text-amber-400"
                      : "bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/12 dark:text-emerald-400"
                  }`}
                >
                  <IconFlame size={22} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[16px] font-bold leading-none text-neutral-950 dark:text-white">
                    {executionStreak.streak === 0 ? "No streak yet" : `${executionStreak.streak}-day streak`}
                  </p>
                  <p className="mt-1.5 truncate text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                    {executionStreak.atRisk
                      ? "Complete one thing to keep it alive."
                      : executionStreak.milestone
                        ? "New milestone — keep the run going."
                        : executionStreak.streak === 0
                          ? "Finish a task or ritual to start."
                          : "You showed up. Keep the run going."}
                  </p>
                </div>
                {executionStreak.streak > 0 && (
                  <span className={`shrink-0 text-[24px] font-semibold tabular-nums leading-none ${
                    executionStreak.atRisk ? "text-amber-500 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                  }`}>
                    {executionStreak.streak}
                  </span>
                )}
              </div>
            </section>

            {/* Recently missed / overdue — renders nothing when all clear. */}
            <NeedsAttentionCard data={needsAttention} onNavigate={setActiveTab} onHandleMissed={setMissedSheet} />

            <TodayTaskList
              tasks={todayTasks}
              done={todayDone}
              total={todayTasks.length}
              plans={schedule.plans}
              taskSummary={(task) => getTaskSubtaskSummary(task, task.planId ? plansById.get(task.planId) ?? null : null)}
              taskCheckableIds={(task) => getTaskCheckableItems(task, task.planId ? plansById.get(task.planId) ?? null : null).map((item) => item.id)}
              onMarkDone={(taskId, subtaskIds) => handleToggleTaskComplete(taskId, subtaskIds, todayKey, todayISO())}
              onToggleSlot={(taskId, slotIndex) => handleToggleSlot(taskId, slotIndex, todayKey, todayISO())}
              onMissed={(taskId, subtaskIds) => handleMarkTaskMissed(taskId, subtaskIds, todayKey, todayISO())}
              onOpenSubtasks={(taskId) => setSubtasksRef({ id: taskId, day: todayKey, dateISO: todayISO() })}
            />

            <section data-testid="overview-tracking-card" className={`${CARD} p-4`}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                  <IconTargetArrow size={16} strokeWidth={2.2} />
                  <h2 className="text-[13px] font-extrabold">Active Tracking</h2>
                </div>
                <button type="button" onClick={() => setActiveTab(1)} className="text-[12px] font-bold text-neutral-400 dark:text-neutral-500">
                  Plans
                </button>
              </div>
              {overviewTrackers.length === 0 ? (
                <div className="rounded-2xl bg-neutral-50 p-3 dark:bg-white/[0.04]">
                  <p className="text-[14px] font-extrabold text-neutral-950 dark:text-white">No trackers yet</p>
                  <p className="mt-0.5 text-[12px] font-semibold leading-snug text-neutral-500 dark:text-neutral-400">
                    Add a progress tracker in any plan and it will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {overviewTrackerGroups.map((group) => (
                    <div key={group.key} className="rounded-2xl border border-neutral-200/80 bg-neutral-50/70 px-3 dark:border-white/[0.07] dark:bg-white/[0.025]">
                      <div className="flex items-center justify-between gap-3 border-b border-neutral-200/70 py-2.5 dark:border-white/[0.06]">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${group.plan ? accentStyles(group.plan.color).dot : "bg-neutral-400 dark:bg-neutral-500"}`} />
                          <p className="truncate text-[11px] font-extrabold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                            {group.plan?.title ?? "Other"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] font-bold tabular-nums text-neutral-400 dark:text-neutral-500">
                          {group.trackers.length}
                        </span>
                      </div>
                      <div className="divide-y divide-neutral-200/70 dark:divide-white/[0.06]">
                        {group.trackers.map(({ tracker, latest, series, trend }) => {
                          const trendColorClass = trend?.state === "positive"
                            ? "text-emerald-500 dark:text-emerald-400"
                            : trend?.state === "negative"
                              ? "text-rose-500 dark:text-rose-400"
                              : "text-neutral-300 dark:text-neutral-600";
                          return (
                            <div key={tracker.id} className="flex items-center gap-3 py-3 first:pt-3 last:pb-3">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[16px] font-semibold text-neutral-950 dark:text-white">{tracker.title}</p>
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <p className="truncate text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">
                                    {formatTrackerValue(latest, tracker)}
                                  </p>
                                  {trend && <TrendChange direction={trend.direction} state={trend.state} pct={trend.pct} />}
                                </div>
                              </div>
                              <Sparkline values={series} className={trendColorClass} />
                              <button
                                type="button"
                                onClick={() => {
                                  haptic("light");
                                  setEntryTracker(tracker);
                                }}
                                aria-label={`Log ${tracker.title}`}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-white transition-transform active:scale-95 dark:bg-white dark:text-neutral-950"
                              >
                                <IconPlus size={21} strokeWidth={2.2} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="grid grid-cols-3 gap-2.5">
              <div data-testid="overview-week-card">
                <StatTile
                  icon={IconClockHour3}
                  value={`${dashboardProgressPct}%`}
                  label="This Week"
                  detail={`${todayDone}/${todayTasks.length} done`}
                />
              </div>
              <div data-testid="overview-progress-card">
                <StatTile
                  icon={IconClipboardData}
                  value={formatMinutesBrief(remainingPlannedMinutes)}
                  label="Weekly Progress"
                  detail={todayOpenTasks.length > 0 ? `${todayOpenTasks.length} open` : "Clear"}
                />
              </div>
              <div data-testid="overview-missed-card">
                <StatTile
                  icon={IconAlertTriangle}
                  iconClass="text-rose-500 dark:text-rose-400"
                  value={missedThisWeek}
                  label="Missed"
                  detail={missedThisWeek === 0 ? "none this week" : "this week"}
                />
              </div>
            </div>

            <DayBreakdownCard
              activities={schedule.activities}
              categories={schedule.categories}
              todayKey={todayKey}
              todayISO={todayISO()}
              preferences={schedule.preferences}
            />

            {DAYS.some((d) => (schedule.activities[d] ?? []).length > 0) && (
              <CompletionTrendCard schedule={schedule} />
            )}

            {overviewPlanConsistency.length > 0 && (
              <section data-testid="overview-plan-card" className={`${CARD} p-4`}>
                <div className="mb-2 flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                  <IconClipboardList size={16} strokeWidth={2.2} />
                  <h2 className="text-[13px] font-extrabold">Plan Consistency</h2>
                </div>
                {/* Mirrors the desktop card: the percentage counts days, the
                    milestone line counts milestones. Naming the unit once is
                    what stops "0/5 milestones" beside "50%" reading as a bug. */}
                <p className="mb-3 text-[12px] text-neutral-500 dark:text-neutral-400">
                  % of days you&rsquo;ve completed at least one task
                </p>
                <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                  {overviewPlanConsistency.slice(0, 5).map(({ plan, consistency, milestonesTotal, milestonesDone }) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => {
                        haptic("light");
                        setSelectedPlanId(plan.id);
                        setActiveTab(1);
                      }}
                      className="grid w-full grid-cols-[minmax(0,1fr)_72px] items-center gap-3 py-3 first:pt-1 last:pb-0 text-left"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-semibold text-neutral-950 dark:text-white">{plan.title}</p>
                        {/* Omitted entirely when the plan has no milestones —
                            "0/0 milestones" reports nothing. */}
                        {milestonesTotal > 0 && (
                          <p className="mt-0.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                            {milestonesDone} of {milestonesTotal} milestones
                          </p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-right text-[12px] font-black tabular-nums text-neutral-700 dark:text-neutral-300">{consistency}%</p>
                        <span className="block h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/[0.10]">
                          <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, consistency))}%` }} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section data-testid="overview-routine-card" className={`${CARD} p-4`}>
              <div className="mb-2 flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                <IconRepeat size={16} strokeWidth={2.2} />
                <h2 className="text-[13px] font-extrabold">Routine Consistency</h2>
              </div>
              {ritualConsistency.length === 0 ? (
                <p className="py-2 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">No routines yet.</p>
              ) : (
                <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                  {ritualConsistency.map(({ ritual, streak, adherencePct, dots, dueToday }) => (
                    <div key={ritual.id} className={`flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-0 ${dueToday ? "" : "opacity-70"}`}>
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-semibold text-neutral-950 dark:text-white">
                          {ritual.title}
                          {ritual.time && <span className="ml-1.5 text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">{formatDisplayTime(ritual.time)}</span>}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2.5">
                          {streak > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-500 dark:text-rose-400">
                              <IconFlame size={12} strokeWidth={2} />
                              {streak}d
                            </span>
                          )}
                          <span className="text-[12px] font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">{adherencePct}% · 30d</span>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {dots.map((on, i) => (
                          <span key={i} className={`h-2 w-2 rounded-full ${on ? "bg-emerald-500" : "bg-neutral-200 dark:bg-white/[0.10]"}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </ErrorBoundary>
      );
    }

    if (activeTab === 0) {
      return (
        <ErrorBoundary section name="Today list">
          <div className="space-y-5 px-4 pt-5" data-tour="today-timeline">
            <div className="bg-white py-4 rounded-2xl dark:bg-neutral-950">
              <div className="mb-3 flex items-center justify-between px-4">
                <span className="text-[20px] font-bold text-neutral-900 dark:text-white">{weekLabel}</span>
                <div className="flex items-center">
                  <button type="button" onClick={() => { setWeekOffset(0); setActiveDay(todayKey); }} className="text-[14px] font-bold text-emerald-600 dark:text-emerald-400">
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
              <div className="grid grid-cols-7 px-2">
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

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[20px] font-semibold text-neutral-950 dark:text-white">
                  {activeDay === todayKey
                    ? "Today's Task"
                    : new Date(activeDateISO + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" })}
                </h2>
                <p className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{dayDone}/{dayTracked.length} done</p>
              </div>
              <div className="flex items-center gap-2">
                {todayEditMode && (
                  <>
                    <button
                      type="button"
                      aria-label="Lock screen wallpaper"
                      onClick={() => { haptic("light"); setWallpaperOpen(true); }}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-white/[0.08] dark:text-neutral-300"
                    >
                      <IconPhoto size={24} strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      aria-label="Add task"
                      onClick={() => openCreateSheet()}
                      className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-white/[0.08] dark:text-neutral-300"
                    >
                      <IconPlus size={24} strokeWidth={2} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { haptic("light"); setTodayEditMode((v) => !v); }}
                  aria-pressed={todayEditMode}
                  aria-label={todayEditMode ? "Done editing" : "Edit day"}
                  className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                    todayEditMode
                      ? "bg-neutral-200 text-neutral-900 dark:bg-white/[0.18] dark:text-white"
                      : "bg-neutral-100 text-neutral-600 dark:bg-white/[0.08] dark:text-neutral-300"
                  }`}
                >
                  {todayEditMode ? <IconCheck size={24} strokeWidth={2} /> : <IconEdit size={24} strokeWidth={2} />}
                </button>
              </div>
            </div>
            <SignInPrompt />
            {renderTaskList(dayTasksView, activeDay, activeDateISO, () => openCreateSheet(), todayEditMode)}
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
                // IOSHeader above already shows the title and the edit/delete
                // menu. This shell also serves iPads, where the view's own
                // lg: header would otherwise render a second copy of both.
                hideHeader
                onDeletePlan={handleDeletePlan}
                onEditPlan={(planId) => setEditingPlanId(planId)}
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
          <div className="space-y-3 px-4 pt-5" data-tour="plans-list">
            {schedule.plans.length === 0 ? (
              <EmptyPanel icon={IconClipboardData} title="No plans yet" description="Create a plan first, then add tasks to schedule your day." action={{ label: "Create Plan", onClick: () => setAddingPlan(true) }} />
            ) : (
              schedule.plans.map((plan) => {
                const taskCount = DAYS.reduce((sum, day) => sum + schedule.activities[day].filter((task) => task.planId === plan.id).length, 0);
                const range = plan.startDate || plan.endDate
                  ? `${plan.startDate ? formatDate(plan.startDate) : "Anytime"}${plan.endDate ? ` - ${formatDate(plan.endDate)}` : ""}`
                  : "No date range";
                const PlanIcon = (SECTION_ICONS.find((entry) => entry.name === plan.emoji) ?? SECTION_ICONS[0]).icon;
                const planHex = categoryHex(resolveAccentColor(plan.color, plan.emoji));
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className="w-full rounded-2xl border border-neutral-200 bg-white p-4 text-left dark:border-white/[0.08] dark:bg-neutral-900"
                  >
                    <div className="mb-3 flex items-start gap-3">
                      <span
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
                        style={{ backgroundColor: `${planHex}1F`, color: planHex }}
                      >
                        <PlanIcon size={24} strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16px] font-semibold text-neutral-950 dark:text-white">{plan.title}</p>
                        <p className="mt-1 truncate text-[14px] font-medium text-neutral-500 dark:text-neutral-400">{range}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-bold text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-300">{taskCount} tasks</span>
                    </div>
                    {plan.description && <p className="line-clamp-2 text-[12px] font-normal leading-snug text-neutral-500 dark:text-neutral-400">{plan.description}</p>}
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
            <div data-tour="routine-view">
              <RitualView
                rituals={schedule.rituals ?? []}
                ritualCompletions={schedule.ritualCompletions ?? []}
                onToggleComplete={handleToggleRitualComplete}
                onLogAmount={handleLogRitualAmount}
                onUndoLastLog={handleUndoRitualLog}
                onOpenDetail={(ritual) => setDetailRitualId(ritual.id)}
                onAdd={handleAddRitual}
                onUpdate={handleUpdateRitual}
                onDelete={handleDeleteRitual}
                addOpen={ritualAddOpen}
                onAddOpenChange={setRitualAddOpen}
              />
            </div>
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
              setSchedule={setSchedule}
              onClearData={clearData}
              onClearProgress={clearProgress}
              onRestoreData={restoreData}
              onUpdatePreferences={(patch) => setSchedule((prev) => ({ ...prev, preferences: { ...prev.preferences, ...patch } }))}
              onClose={() => setActiveTab(4)}
              onOpenAI={() => setActiveTab(7)}
            />
          </ErrorBoundary>
        </IOSMotionBoundary>
      );
    }

    if (activeTab === 7) {
      return (
        <IOSMotionBoundary>
          <ErrorBoundary section name="AI">
            <AIView onClose={() => setActiveTab(5)} />
          </ErrorBoundary>
        </IOSMotionBoundary>
      );
    }

    if (activeTab === 6) {
      return (
        <IOSMotionBoundary>
          <ErrorBoundary section name="Notes">
            <div className="h-full">
              <NotesView
                notes={schedule.notes}
                onCreate={handleCreateNote}
                onUpdate={handleUpdateNote}
                onDelete={handleDeleteNote}
                onClose={() => setActiveTab(4)}
                tasks={notesLinkableTasks}
                plans={schedule.plans}
                onCreateTaskFromNote={handleCreateTaskFromNote}
                initialEditingId={initialNoteId}
                onInitialEditingHandled={handleInitialNoteOpened}
                todayDateISO={todayISO()}
                disableMotion
                onOpenTask={(taskId) => {
                  const task = notesLinkableTasks.find((item) => item.id === taskId);
                  if (task) openEditSheet(task);
                }}
              />
            </div>
          </ErrorBoundary>
        </IOSMotionBoundary>
      );
    }

    return null;
  })();

  // shrink-0 on <main>: it is a flex child of <body> (via a display:contents
  // wrapper). Without it, when the day's content is taller than one screen the
  // flex column shrinks <main> back to its min-height (100dvh), so its
  // bg-[#F3F4F1] only paints the first screenful and the taller content
  // overflows onto the body's lighter bg — a two-tone band mid-list.
  return (
    <main className="min-h-dvh shrink-0 bg-[#F3F4F1] text-neutral-900 dark:bg-[#0E0E0E] dark:text-white">
      {!subtasksRef && activeTab !== 6 && (
        <IOSHeader
          title={selectedPlan ? selectedPlan.title : activeTab === 0 ? "Today" : activeTab === 1 ? "Plans" : activeTab === 2 ? "Routine" : activeTab === 5 ? "Settings" : activeTab === 6 ? "Notes" : "Dashboard"}
          onBack={selectedPlan ? () => setSelectedPlanId(null) : undefined}
          actions={
            selectedPlan
              ? [
                  {
                    icon: IconTrash,
                    label: "Delete plan",
                    destructive: true,
                    onClick: () => {
                      haptic("light");
                      handleDeletePlan(selectedPlan.id);
                    },
                  },
                  {
                    icon: IconEdit,
                    label: "Edit plan",
                    onClick: () => {
                      haptic("light");
                      setEditingPlanId(selectedPlan.id);
                    },
                  },
                ]
              : activeTab === 1
              ? [
                  {
                    icon: IconTargetArrow,
                    label: "Goals",
                    onClick: () => {
                      haptic("light");
                      setGoalsSheetOpen(true);
                    },
                  },
                ]
              : undefined
          }
          onSettings={() => { setSelectedPlanId(null); setActiveTab(5); }}
          onNotes={() => { setSelectedPlanId(null); setActiveTab(6); }}
        />
      )}
      <div className={subtasksRef || activeTab === 6 ? "h-dvh bg-white pt-[env(safe-area-inset-top)] dark:bg-neutral-950" : "pb-36 pt-[calc(env(safe-area-inset-top)+76px)]"}>{content}</div>

      <DayActionsSheet
        open={dayActionsOpen}
        sourceDay={activeDay}
        onClose={() => setDayActionsOpen(false)}
        onSwap={(target) => setSchedule(swapDays(activeDay, target))}
        onDuplicate={(targets) => setSchedule(duplicateDay(activeDay, targets))}
      />

      {missedSheet && (
        <IOSMotionBoundary>
          <MissedTaskSheet
            missed={missedSheet}
            onClose={() => setMissedSheet(null)}
            onReschedule={(m, dateISO, startMinutes) =>
              setSchedule((prev) => rescheduleMissedTaskOnce(prev, m.task, m.dateISO, dateISO, startMinutes))
            }
            onDismiss={(m) => setSchedule((prev) => acknowledgeMiss(prev, m.task.id, m.dateISO))}
          />
        </IOSMotionBoundary>
      )}

      {activeTab !== 6 && !subtasksRef && !taskSheetOpen && (
        <IOSBottomNav
          activeTab={activeTab}
          onTabChange={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
          onCreateTask={() => openCreateSheet()}
          onCreatePlan={() => { setActiveTab(1); setSelectedPlanId(null); setAddingPlan(true); }}
          onCreateRitual={() => {
            setActiveTab(2);
            if ((schedule.rituals ?? []).length < MAX_RITUALS) setRitualAddOpen(true);
            else setToast(`You can have up to ${MAX_RITUALS} routines`);
          }}
          onCreateNote={openQuickNote}
        />
      )}

      {/* ── Per-tab guided tour — short, skippable, once per device ─────────
          CoachMarks uses framer-motion's `m.*` primitives, which render
          inert (frozen at their `initial` style — opacity: 0 here) without a
          LazyMotion ancestor. The desktop shell has one wrapping its whole
          tree; this shell only wraps individual sections, so it needs its
          own boundary here. */}
      {activeTourId && (
        <IOSMotionBoundary>
          <CoachMarks open={tour.open} steps={TOUR_STEPS[activeTourId]} onFinish={tour.finish} />
        </IOSMotionBoundary>
      )}

      {wallpaperOpen && (
        <IOSMotionBoundary>
          <DayWallpaperSheet
            open={wallpaperOpen}
            onClose={() => setWallpaperOpen(false)}
            schedule={schedule}
            todayKey={todayKey}
          />
        </IOSMotionBoundary>
      )}

      {(taskSheetOpen || addingPlan || editingPlanId || entryTracker || goalsSheetOpen) && (
        <IOSMotionBoundary>
          <TaskSheet
            mode={taskSheetMode}
            task={taskSheetTask}
            plans={schedule.plans}
          categories={schedule.categories}
          onCreateCategory={handleCreateCategory}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          categoryUsage={categoryUsage}
            activeDay={activeDay}
            activeDays={taskSheetActiveDays}
            activities={schedule.activities}
            preferences={schedule.preferences}
            isOpen={taskSheetOpen}
            initialPlanId={taskSheetPlanId}
            initialTaskType={taskSheetInitialType}
            occurrenceDateISO={taskSheetDateISO}
            canEditOccurrence={!!taskSheetDateISO && taskSheetDateISO >= todayISO()}
            presentation="page"
            onClose={closeTaskSheet}
            onSave={handleTaskSheetSave}
            onDelete={taskSheetTask ? () => { requestDeleteTask(taskSheetTask.id, activeDay); closeTaskSheet(); } : undefined}
            onResetOccurrence={taskSheetTask && taskSheetDateISO ? () => setSchedule(clearTaskException(taskSheetTask.id, taskSheetDateISO)) : undefined}
            onCopySubtaskToTasks={(entry, targetTaskIds) => {
              setSchedule(addSubtaskToTasks(targetTaskIds, entry));
              setToast(`Subtask copied to ${targetTaskIds.length} task${targetTaskIds.length === 1 ? "" : "s"}`);
            }}
          />
          <AddPlanSheet open={addingPlan} onClose={() => setAddingPlan(false)} setSchedule={setSchedule} goals={schedule.goals ?? []} />
          {editingPlanId && (
            <EditPlanSheet
              planId={editingPlanId}
              plan={plansById.get(editingPlanId) ?? null}
              setSchedule={setSchedule}
              onClose={() => setEditingPlanId(null)}
              goals={schedule.goals ?? []}
            />
          )}
          <GoalListSheet
            open={goalsSheetOpen}
            onClose={() => setGoalsSheetOpen(false)}
            schedule={schedule}
            setSchedule={setSchedule}
            onDeleteGoal={handleDeleteGoal}
          />
          <AddEntryModal
            isOpen={!!entryTracker}
            onClose={() => setEntryTracker(null)}
            metric={entryTracker ? { name: entryTracker.title, unit: entryTracker.unit ?? "" } : undefined}
            quickAmounts={entryTracker ? quickAmountsForUnit(entryTracker.unit) : undefined}
            todayTotal={entryTracker ? sumEntriesForDate(schedule.metricEntries, entryTracker.id, todayISO()) : undefined}
            onSave={(value, date) => {
              if (!entryTracker) return;
              const entry: MetricEntry = { id: uid(), planId: entryTracker.planId, trackerId: entryTracker.id, value, date };
              setSchedule((prev) => ({
                ...prev,
                progressTrackers: prev.progressTrackers.some((tracker) => tracker.id === entryTracker.id)
                  ? prev.progressTrackers
                  : [...prev.progressTrackers, entryTracker],
                metricEntries: [...prev.metricEntries, entry],
              }));
            }}
          />
        </IOSMotionBoundary>
      )}

      {detailRitual && (
        <div
          className="fixed inset-0 z-50 bg-[#F5F5F5] dark:bg-[#0E0E0E]"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <RoutineDetailView
            ritual={detailRitual}
            ritualCompletions={schedule.ritualCompletions ?? []}
            onBack={() => setDetailRitualId(null)}
            onToggleCheckbox={() => handleToggleRitualComplete(detailRitual.id)}
            onLogAmount={(amount) => handleLogRitualAmount(detailRitual.id, amount, todayISO())}
            onUndoLastLog={() => handleUndoRitualLog(detailRitual.id, todayISO())}
            onRemoveLog={(entryId) => setSchedule((prev) => ({ ...prev, ritualCompletions: removeRitualLog(prev.ritualCompletions ?? [], entryId) }))}
            onToggleStep={(stepId) => handleToggleRitualStep(detailRitual.id, stepId)}
            onEdit={() => { setEditRitualId(detailRitual.id); setDetailRitualId(null); }}
            onDelete={() => { setDetailRitualId(null); handleDeleteRitual(detailRitual.id); }}
          />
        </div>
      )}

      <RitualSheet
        open={!!editingRitual}
        onClose={() => setEditRitualId(null)}
        initial={editingRitual ?? undefined}
        onSave={(data) => { if (editingRitual) handleUpdateRitual(editingRitual.id, data); setEditRitualId(null); }}
        onDelete={() => { if (editingRitual) handleDeleteRitual(editingRitual.id); setEditRitualId(null); }}
      />

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
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 rounded-full border border-neutral-800 bg-neutral-900 px-5 py-2.5 text-[14px] font-semibold text-white dark:border-white/[0.10] dark:bg-white dark:text-neutral-900">
          {toast}
        </div>
      )}
    </main>
  );
}
