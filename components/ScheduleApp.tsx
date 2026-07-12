"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import dynamic from "next/dynamic";
import AddEntryModal from "@/components/AddEntryModal";
import { TaskBlockCard } from "@/components/TaskBlockCard";
import Skeleton from "@/components/ui/Skeleton";
import type { TaskSaveData } from "@/components/task/TaskSheet";
import type { MilestoneSaveData } from "@/components/plan/MilestoneSheet";
import type { CreateTaskFromNoteInput } from "@/components/notes/NotesView";
import { PlanCard } from "@/components/plan/PlanCard";
import AppHeader from "@/components/AppHeader";
import BottomNav from "@/components/BottomNav";
import DesktopSidebar from "@/components/desktop/DesktopSidebar";
import { WeekGrid } from "@/components/desktop/WeekGrid";
import { checkOllamaConnection, OLLAMA_URL_KEY, OLLAMA_MODEL_KEY, DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL } from "@/lib/ai";
import type { AIActionResult } from "@/lib/ai";
import { AI_ENABLED } from "@/lib/featureFlags";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth } from "@/contexts/AuthProvider";
import { bootLog, isIOSSafeMode, isStandalonePWA } from "@/lib/iosSafeMode";

// ── Deferred heavy components (separate JS chunks, loaded on demand) ──────────
const AIAssistant = dynamic(() => import("@/components/ai/AIAssistant"), { ssr: false });
const TaskSheet = dynamic(() => import("@/components/task/TaskSheet").then(m => ({ default: m.TaskSheet })), { ssr: false });
const PlanDetailView = dynamic(() => import("@/components/plan/PlanDetailView"), { ssr: false });
const AIPlanCreatorSheet = dynamic(() => import("@/components/plan/AIPlanCreatorSheet"), { ssr: false });
const SettingsSheet = dynamic(() => import("@/components/auth/SettingsSheet").then(m => ({ default: m.SettingsSheet })), { ssr: false });
const SettingsView = dynamic(() => import("@/components/SettingsView").then(m => ({ default: m.SettingsView })), { ssr: false });
const AIOnboarding = dynamic(() => import("@/components/ai/AIOnboarding"), { ssr: false });
const NotesView = dynamic(() => import("@/components/notes/NotesView"), { ssr: false });
const TemplatesSheet = dynamic(() => import("@/components/TemplatesSheet").then(m => ({ default: m.TemplatesSheet })), { ssr: false });
const SessionSheet = dynamic(() => import("@/components/activity/SessionSheet"), { ssr: false });
const SubtasksSheet = dynamic(() => import("@/components/activity/SubtasksSheet"), { ssr: false });
const TaskDetailView = dynamic(() => import("@/components/activity/TaskDetailView"), { ssr: false });
const BulkImportSheet = dynamic(() => import("@/components/BulkImportSheet"), { ssr: false });
const DayWallpaperSheet = dynamic(() => import("@/components/DayWallpaperSheet"), { ssr: false });
const RitualView = dynamic(() => import("@/components/activity/RitualView"), { ssr: false });
const OverviewDashboard = dynamic(() => import("@/components/OverviewDashboard"), { ssr: false });
const TrackerQuickBar = dynamic(() => import("@/components/TrackerQuickBar"), { ssr: false });
import WhatNextCard from "@/components/WhatNextCard";
import StreakAlertChips from "@/components/StreakAlertChips";
import {
  useScheduleDB,
  DAYS,
  DAY_LABELS,
  DayKey,
  MetricEntry,
  Milestone,
  Note,
  Plan,
  PlanCoachMessage,
  ProgressTracker,
  Ritual,
  Schedule,
  StrategyAsset,
  SummaryConfig,
  Task,
  categoryFromIcon,
  resetStaleCompletions,
} from "@/lib/useScheduleDB";
import { useReminders } from "@/lib/useReminders";
import RitualOverlayLayer from "@/components/timeline/RitualOverlayLayer";
import RitualLegend from "@/components/timeline/RitualLegend";
import {
  colorFromIcon,
  resolveAccentColor,
  type AccentColor,
} from "@/lib/colorSystem";
import { SECTION_ICONS } from "@/components/SectionIcons";
import {
  IconChevronLeft,
  IconCalendar,
  IconChecklist,
  IconChevronRight,
  IconClipboardList,
  IconEdit,
  IconLayoutList,
  IconMinus,
  IconPhoto,
  IconPlus,
  IconSparkles,
  IconTable,
  IconTrash,
  IconX,
  IconClipboardData,
  IconStack2,
} from "@tabler/icons-react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import BottomSheet from "@/components/ui/BottomSheet";
import EmptyState from "@/components/ui/EmptyState";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Input from "@/components/ui/Input";
import { ListTaskCard } from "@/components/activity/ListTaskCard";
import TodayRitualsBar from "@/components/activity/TodayRitualsBar";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { CurrentTimeLayer } from "@/components/timeline/CurrentTimeLayer";
import { CurrentTaskHighlightLayer } from "@/components/timeline/CurrentTaskHighlightLayer";
import TimelineDraftCard from "@/components/timeline/TimelineDraftCard";
import { taskLaneStyle } from "@/lib/timeline/taskLaneStyle";
import {
  toggleTaskComplete,
  toggleSubtaskComplete,
  markTaskMissed,
  snoozeTaskLater,
  completionForDate,
  isTaskCompleted,
  isTaskResolved,
  resolveTaskState,
  getTaskCheckableItems,
  getTaskSubtaskSummary,
} from "@/lib/taskCompletion";
import {
  applyTaskDelete,
  createTask,
  createTaskDeleteSnapshot,
  restoreTaskDelete,
  uid,
  sortTasksByTime,
  updateTaskDays,
  setTaskException,
  clearTaskException,
  type TaskDeleteScope,
} from "@/lib/taskMutations";
import { isTaskScheduledOn, resolveOccurrence, diffException } from "@/lib/taskOccurrence";
import type { AIGeneratedTask } from "@/lib/aiActions";
import { applyScheduleRules } from "@/lib/scheduleRules";
import { resolveTimes as resolveParsedTimes } from "@/lib/scheduleParser";
import { applyTemplate } from "@/lib/templates";
import type { Template } from "@/lib/templates";
import { toggleRitualCompletion } from "@/lib/ritualCompletions";
import { parseTimeToMinutes, formatDuration } from "@/lib/timeUtils";
import {
  pointerToMinutes,
  snapMinutes,
  clampMinutes,
  minutesToDisplayTime,
  minutesToInputTime,
  getDurationLabel,
  DRAG_THRESHOLD_PX,
  LONG_PRESS_MS,
  DRAG_MIN_DURATION,
  DRAG_DEFAULT_DURATION,
} from "@/lib/timeline/dragTimeUtils";
import {
  buildTimelineGridMarks,
  getTimelineDisplayStartMinutes,
  mapMinutesToTimeline,
  TIMELINE_END_MINUTES,
} from "@/lib/timeline/displayWindow";
import { todayISO, daysBetween as daysBetweenUtil, formatDate, addDaysToISO, localISODate } from "@/lib/dateUtils";
import { getPlanCardStats } from "@/lib/planInsights";
import { MainTitleSection, IconActionButton, CtaActionButton } from "@/components/ui/MainTitleSection";
import ProgressBar from "@/components/ui/ProgressBar";
import { normalizeMilestoneTimeline, cascadeMilestoneDates } from "@/lib/roadmapDates";
import AddPlanSheet from "@/components/plan/AddPlanSheet";
import EditPlanSheet from "@/components/plan/EditPlanSheet";
import { haptic } from "@/lib/haptics";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";

// ─── Constants ───────────────────────────────────────────────────────────────

const daysBetween = daysBetweenUtil;

const HOUR_HEIGHT = 120;
const TIMELINE_TOP_PADDING = 16;
const TIMELINE_BOTTOM_PADDING = 48;
const RITUAL_LANE_WIDTH = 28;

const JS_DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function quickTaskTimeRange(now = new Date()): { startTime: string; endTime: string } {
  const current = now.getHours() * 60 + now.getMinutes();
  const start = Math.min(23 * 60 + 30, Math.ceil(current / 15) * 15);
  return {
    startTime: minutesToDisplayTime(start),
    endTime: minutesToDisplayTime(start + 15),
  };
}

function NoopPresence({ children }: { children: ReactNode; mode?: string; initial?: boolean }) {
  return <>{children}</>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatPlanDate = formatDate;

const formatTaskDuration = formatDuration;

function formatHourLabel(totalMinutes: number): string {
  const normalizedHour = Math.floor(totalMinutes / 60) % 24;
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const hour = normalizedHour % 12 || 12;
  return `${hour} ${suffix}`;
}

function IOSSafeDashboard({
  schedule,
  todayTasks,
  plansById,
  authLabel,
  onNavigate,
  onToggleTask,
  onToggleSubtask,
  onOpenSubtasks,
}: {
  schedule: Schedule;
  todayTasks: Task[];
  plansById: Map<string, Plan>;
  authLabel: string;
  onNavigate: (tab: number) => void;
  onToggleTask: (task: Task) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onOpenSubtasks: (task: Task) => void;
}) {
  const done = todayTasks.filter((task) => {
    const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
    return isTaskCompleted(task, getTaskSubtaskSummary(task, linkedPlan).totalCount);
  }).length;
  const total = todayTasks.length;
  const plans = schedule.plans.length;
  const rituals = schedule.rituals?.length ?? 0;

  return (
    <div className="px-4 pb-8 pt-5">
      <MainTitleSection
        label={authLabel}
        title="Dashboard"
        actions={
          <CtaActionButton
            label="Today"
            icon={<IconCalendar size={14} strokeWidth={2.5} />}
            onClick={() => onNavigate(0)}
          />
        }
        className="mb-5"
      />

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile icon={IconChecklist} value={total} label={`${done} done`} />
        <StatTile icon={IconClipboardData} value={plans} label="Plans" />
        <StatTile icon={IconStack2} value={rituals} label="Habits" />
      </div>

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold text-neutral-950 dark:text-white">Today's tasks</h2>
          <button
            type="button"
            onClick={() => onNavigate(0)}
            className="text-[13px] font-bold text-neutral-500 dark:text-neutral-400"
          >
            Open
          </button>
        </div>

        {todayTasks.length === 0 ? (
          <EmptyState
            icon={IconCalendar}
            title="No tasks today"
            description="Add tasks from the Today tab when you're ready."
            action={{ label: "Add Task", onClick: () => onNavigate(0) }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {todayTasks.map((task) => (
              <ListTaskCard
                key={task.id}
                task={task}
                linkedPlan={task.planId ? plansById.get(task.planId) ?? null : null}
                onToggleComplete={() => onToggleTask(task)}
                onToggleSubtask={onToggleSubtask}
                onEdit={() => onNavigate(0)}
                onDelete={() => onNavigate(0)}
                onOpenSubtasks={() => onOpenSubtasks(task)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatHalfHourLabel(totalMinutes: number): string {
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalizedMinutes / 60) % 12 || 12;
  const minute = normalizedMinutes % 60;
  return `${hour}:${minute.toString().padStart(2, "0")}`;
}


function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type CardSize = "xsmall" | "small" | "medium" | "large";

function computeCardSize(height: number, laneCount: number): CardSize {
  // HOUR_HEIGHT = 112 → 20min=37px, 30min=56px, 40min=75px, 60min=112px
  // xsmall: title chip only         — card < 37px  (< ~20 min)
  // small:  plan label + title      — card < 56px  (< ~30 min)
  // medium: plan+title+time         — card < 75px  (< ~40 min)
  // large:  full layout with gutter — card ≥ 75px  (≥ ~40 min)
  let size: CardSize;
  if (height < 32) size = "xsmall";
  else if (height < 48) size = "small";
  else if (height < 64) size = "medium";
  else size = "large";

  // Degrade for multi-lane layouts to preserve readability at narrower widths.
  // Floor at "small" (plan label + title stay legible) — never collapse an
  // overlapping card to a title-only "xsmall" chip just because it's narrow.
  if (laneCount >= 3) {
    // Cap at "small"; only genuinely tiny (<30min) blocks stay "xsmall".
    if (size !== "xsmall") size = "small";
  } else if (laneCount === 2) {
    // Drop the largest a step, but never go below "small".
    if (size === "large") size = "medium";
  }

  return size;
}

// Shape of one positioned timeline task (produced by the timelineTaskLayouts memo).
interface TimelineTaskLayout {
  task: Task;
  start: number;
  end: number;
  isOvernight: boolean;
  isTruncated: boolean;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
}

/**
 * One positioned task block on the timeline, memoized so a drag (which updates
 * dragCreate/dragMove on the parent every animation frame) doesn't re-render
 * every card — only the dragged card's `isBeingMoved` flips. Relies on the
 * parent passing a STABLE `layout` ref (the timelineTaskLayouts memo) and stable
 * callbacks (the toggle/edit/pointer handlers are useCallback'd).
 */
const TimelineTaskBlock = memo(function TimelineTaskBlock({
  layout,
  plan,
  isBeingMoved,
  isViewingToday,
  onPointerDown,
  onToggle,
  onOpenSubtasks,
}: {
  layout: TimelineTaskLayout;
  plan: Plan | null;
  isBeingMoved: boolean;
  isViewingToday: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, task: Task, start: number, end: number) => void;
  onToggle: (task: Task) => void;
  onOpenSubtasks: (task: Task) => void;
}) {
  const cardSize = computeCardSize(layout.height, layout.laneCount);
  return (
    <div
      data-task-block
      className={`absolute min-w-0 px-0.5 py-[2px] animate-panel-in touch-pan-y transition-opacity ${
        isBeingMoved ? "opacity-25 pointer-events-none" : ""
      }`}
      style={{ ...taskLaneStyle(layout), willChange: isBeingMoved ? "opacity" : undefined }}
      onPointerDown={isViewingToday ? (e) => onPointerDown(e, layout.task, layout.start, layout.end) : undefined}
    >
      <div className="relative h-full min-h-[20px]">
        <TaskBlockCard
          variant="grid"
          task={layout.task}
          plan={plan}
          state={resolveTaskState(layout.task, getTaskSubtaskSummary(layout.task, plan).totalCount)}
          duration={formatTaskDuration(layout.task.startTime, layout.task.endTime)}
          readOnly={!isViewingToday}
          minimal={cardSize === "xsmall"}
          compact={cardSize === "small" || cardSize === "medium"}
          narrow={cardSize === "small"}
          onToggle={() => onToggle(layout.task)}
          onOpenSubtasks={() => onOpenSubtasks(layout.task)}
          className="h-full w-full"
        />
      </div>
    </div>
  );
});


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

// ─── Stat tile ───────────────────────────────────────────────────────────────

function StatTile({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  value: number;
  label: string;
}) {
  return (
    <div className="h-[98px] rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon size={12} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          {label}
        </p>
      </div>
      <p className="text-[28px] font-black tabular-nums leading-none text-neutral-900 dark:text-white">{value}</p>
    </div>
  );
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

// ─── Week Summary (Review tab) ────────────────────────────────────────────────

type RitualWeekDay = { date: string; label: string; isToday: boolean; completedCount: number; dueCount: number };

function WeekSummary({
  schedule,
  todayKey,
  ritualWeekHistory,
}: {
  schedule: Schedule;
  todayKey: DayKey;
  ritualWeekHistory: RitualWeekDay[];
}) {
  const thisWeekDates = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const daysToMon = dow === 0 ? 6 : dow - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysToMon);
    monday.setHours(0, 0, 0, 0);
    return DAYS.map((day, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { day, date: d };
    });
  }, [todayKey]);

  const todayMidnight = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, [todayKey]);

  const dayStats = useMemo(
    () =>
      thisWeekDates.map(({ day, date }) => {
        const dateISO = localISODate(date);
        const isToday = day === todayKey;
        const tasks = (schedule.activities[day] ?? []).map((task) =>
          isToday ? task : { ...task, ...completionForDate(task, dateISO) }
        );
        const total = tasks.length;
        const done = tasks.filter((t) => {
          const linkedPlan = t.planId ? schedule.plans.find((plan) => plan.id === t.planId) ?? null : null;
          return isTaskCompleted(t, getTaskSubtaskSummary(t, linkedPlan).totalCount);
        }).length;
        return {
          day,
          label: DAY_LABELS[day],
          total,
          done,
          isPastOrToday: date <= todayMidnight,
          isToday,
        };
      }),
    [schedule.activities, thisWeekDates, todayMidnight, todayKey]
  );

  const trackedDays = dayStats.filter((d) => d.isPastOrToday);
  const totalDone = trackedDays.reduce((s, d) => s + d.done, 0);
  const totalScheduled = trackedDays.reduce((s, d) => s + d.total, 0);
  const weekPct = totalScheduled > 0 ? Math.round((totalDone / totalScheduled) * 100) : 0;

  const ritualDone = ritualWeekHistory.reduce((s, d) => s + d.completedCount, 0);
  const ritualDue = ritualWeekHistory.reduce((s, d) => s + d.dueCount, 0);
  const ritualPct = ritualDue > 0 ? Math.round((ritualDone / ritualDue) * 100) : 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 px-4 py-4 mb-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500 mb-3">
        This Week
      </p>

      {/* Day completion strip */}
      <div className="grid grid-cols-7 gap-1.5 mb-4">
        {dayStats.map(({ day, label, total, done, isPastOrToday, isToday }) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div key={day} className="flex flex-col items-center gap-1.5">
              <span className={`text-[9px] font-semibold leading-none ${
                isToday
                  ? "text-emerald-500 dark:text-emerald-400"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}>
                {label}
              </span>
              <div className="w-full h-[5px] rounded-full bg-neutral-100 dark:bg-white/[0.06] overflow-hidden">
                {total > 0 && isPastOrToday && (
                  <div
                    className={`h-full rounded-full ${
                      pct === 100
                        ? "bg-emerald-500"
                        : pct >= 50
                        ? "bg-amber-400"
                        : "bg-rose-400"
                    }`}
                    style={{ width: `${Math.max(pct, pct > 0 ? 10 : 0)}%` }}
                  />
                )}
              </div>
              <span className={`text-[9px] tabular-nums leading-none ${
                isToday
                  ? "font-bold text-neutral-700 dark:text-neutral-300"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}>
                {total > 0 && isPastOrToday ? `${done}/${total}` : "·"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] px-3 py-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 dark:text-neutral-500">
            Tasks done
          </p>
          <p className="text-[20px] font-extrabold tabular-nums leading-none text-neutral-950 dark:text-white">
            {weekPct}
            <span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">%</span>
          </p>
        </div>
        <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] px-3 py-2.5">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-400 dark:text-neutral-500">
            Habits done
          </p>
          <p className="text-[20px] font-extrabold tabular-nums leading-none text-neutral-950 dark:text-white">
            {ritualPct}
            <span className="text-[12px] font-semibold text-neutral-400 dark:text-neutral-500">%</span>
          </p>
        </div>
      </div>
    </div>
  );
}

type ToastState = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

type TaskDeleteRequest = {
  taskId: string;
  sourceDay: DayKey;
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScheduleApp() {
  const iosSafeMode = isIOSSafeMode();
  bootLog("APP_BOOT_START");
  if (iosSafeMode) {
    bootLog("IOS_SAFE_MODE_ENABLED");
    void isStandalonePWA();
  }
  const { user, isGuest, authLoading } = useAuth();
  const { schedule, setSchedule, ready, clearData, clearProgress, restoreData, isFirstLaunch } = useScheduleDB();
  useReminders(schedule, ready);
  const [todayKey, setTodayKey] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState(() => (iosSafeMode ? 4 : 0));
  const [whatNextDismissed, setWhatNextDismissed] = useState(false);

  const [toastState, setToastState] = useState<ToastState | null>(null);
  const toastMessage = toastState?.message ?? null;
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [taskSheetMode, setTaskSheetMode] = useState<"create" | "edit">("create");
  const [taskSheetTask, setTaskSheetTask] = useState<Task | null>(null);
  const [taskSheetPlanId, setTaskSheetPlanId] = useState<string | null>(null);
  // The specific date the edit sheet was opened on (enables "this day only").
  const [taskSheetDateISO, setTaskSheetDateISO] = useState<string>("");

  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [entryTracker, setEntryTracker] = useState<ProgressTracker | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "timeline">(() => (iosSafeMode ? "list" : "timeline"));
  const [calendarView, setCalendarView] = useState<import("@/components/desktop/WeekGrid").CalendarView>("7day");
  const [customDays, setCustomDays] = useState<DayKey[]>(["monday", "wednesday", "friday"]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  const [taskSheetInitialType, setTaskSheetInitialType] = useState<"task" | "session">("task");
  const [taskSheetInitialStartTime, setTaskSheetInitialStartTime] = useState("");
  const [taskSheetInitialEndTime, setTaskSheetInitialEndTime] = useState("");

  // ── Timeline drag-create state (ghost block during empty-area drag) ──────────
  const [dragCreate, setDragCreate] = useState<{ startMin: number; endMin: number } | null>(null);
  // ── Timeline drag-move state (preview block during task long-press drag) ─────
  const [dragMove, setDragMove] = useState<{
    taskId: string;
    durationMin: number;
    previewStartMin: number;
  } | null>(null);

  const [addingPlan, setAddingPlan] = useState(false);
  const [aiPlanCreating, setAiPlanCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInitialMessage, setAiInitialMessage] = useState("");

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [sessionTask, setSessionTask] = useState<Task | null>(null);
  // Task whose subtasks are shown in the bottom sheet — stored by id+day so the
  // sheet always reflects the live task (completion updates create new objects).
  const [subtasksRef, setSubtasksRef] = useState<{ id: string; day: DayKey; dateISO: string } | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const completedRitualIds = useMemo(() => {
    const today = todayISO();
    return new Set(
      (schedule.ritualCompletions ?? [])
        .filter((c) => c.date === today)
        .map((c) => c.ritualId)
    );
  }, [schedule.ritualCompletions, todayKey]);
  const [ritualAddOpen, setRitualAddOpen] = useState(false);
  const canAddRitual = (schedule.rituals ?? []).length < 8;
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [taskDeleteRequest, setTaskDeleteRequest] = useState<TaskDeleteRequest | null>(null);

  const [ollamaUrl, setOllamaUrl] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(OLLAMA_URL_KEY) ?? DEFAULT_OLLAMA_URL) : DEFAULT_OLLAMA_URL
  );
  const [ollamaModel, setOllamaModel] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(OLLAMA_MODEL_KEY) ?? DEFAULT_OLLAMA_MODEL) : DEFAULT_OLLAMA_MODEL
  );

  useEffect(() => {
    // AI is feature-flagged off — don't fire a localhost connection probe on
    // every app start (needless work; on iOS the mixed-content fetch is dead
    // weight). Re-enabling AI_ENABLED restores this automatically.
    if (!AI_ENABLED || iosSafeMode) return;
    if (typeof window === "undefined") return;
    let cancelled = false;

    async function syncInstalledModel() {
      try {
        const models = await checkOllamaConnection(ollamaUrl);
        if (cancelled || models.length === 0 || models.includes(ollamaModel)) return;
        localStorage.setItem(OLLAMA_MODEL_KEY, models[0]);
        setOllamaModel(models[0]);
      } catch {
        // Ollama may be offline; keep the saved model and let the status UI show it.
      }
    }

    void syncInstalledModel();
    return () => { cancelled = true; };
  }, [ollamaUrl, ollamaModel, iosSafeMode]);

  function openConfirm(
    copy: { title: string; description: string; confirmLabel?: string },
    fn: () => void,
  ) {
    setConfirmState({ ...copy, onConfirm: fn });
  }

  function setToastMessage(next: string | ToastState | null) {
    setToastState(typeof next === "string" ? { message: next } : next);
  }

  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const taskGridRef = useRef<HTMLDivElement | null>(null);
  // Current schedule + active date, mirrored to refs so the stable openEditSheet
  // callback can read the latest values (and resolve the underlying template).
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;
  const activeDateISORef = useRef("");
  // Mutable tracking for drag-create (no renders during drag)
  const createDragRef = useRef<{
    dragging: boolean;
    startClientY: number;
    startMin: number;
    pointerId: number;
    lastEndMin: number; // tracks current end during drag; avoids stale-closure in pointerup
  } | null>(null);
  // Mutable tracking for drag-move long-press
  const moveDragRef = useRef<{
    taskId: string;
    task: Task;
    durationMin: number;
    grabOffsetMin: number;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    dragging: boolean;
    startClientY: number;
    pointerId: number;
    currentPreviewStartMin: number; // tracks current position; avoids stale-closure in pointerup
    isCheckbox: boolean; // tap originated on the checkbox — don't open edit sheet
  } | null>(null);
  const hasUserScrolledTimelineRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 12 } }));

  const handleUpdateCoachMessages = useCallback((planId: string, messages: PlanCoachMessage[]) => {
    setSchedule((prev) => ({
      ...prev,
      plans: prev.plans.map((p) =>
        p.id === planId ? { ...p, coachMessages: messages } : p
      ),
    }));
  }, [setSchedule]);

  useEffect(() => {
    hasUserScrolledTimelineRef.current = false;
  }, [activeDay]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktopViewport(mq.matches);
    const handler = (event: MediaQueryListEvent) => setIsDesktopViewport(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!toastState) return;
    const t = setTimeout(() => setToastMessage(null), 2500);
    return () => clearTimeout(t);
  }, [toastState]);

  // Land on the Overview page on true first launch (no stored data)
  useEffect(() => {
    if (iosSafeMode) return;
    if (ready && isFirstLaunch) {
      setActiveTab(4); // Overview
    }
  }, [ready, isFirstLaunch, iosSafeMode]);

  useEffect(() => {
    if (!iosSafeMode) return;
    setViewMode("list");
    setEditMode(false);
    bootLog("TIMELINE_SKIPPED_ON_IOS");
  }, [iosSafeMode]);

  useEffect(() => {
    if (!ready) return;
    bootLog("DASHBOARD_READY");
    bootLog("APP_BOOT_COMPLETE");
  }, [ready]);

  // Reset "What's Next" dismissal whenever the user navigates to a new day
  useEffect(() => {
    setWhatNextDismissed(false);
  }, [activeDay]);

  // When the day rolls over (midnight / tab wake), clear yesterday's live task
  // completion so today starts fresh. History is preserved by the util, and it
  // returns the same reference when nothing changed (no needless re-render).
  useEffect(() => {
    if (!ready) return;
    setSchedule((prev) => resetStaleCompletions(prev, todayISO()));
  }, [todayKey, ready, setSchedule]);

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
    setTaskSheetInitialStartTime("");
    setTaskSheetInitialEndTime("");
    setTaskSheetPlanId(initialPid ?? null);
    setTaskSheetTask(null);
    setTaskSheetMode("create");
    setTaskSheetInitialType("task");
    setTaskSheetOpen(true);
  }

  // ── PWA app-shortcut actions (manifest "shortcuts" → /?action=…) ───────────
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
    // Clear the param so a refresh doesn't re-trigger the action.
    params.delete("action");
    const qs = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ── Timeline drag helpers ──────────────────────────────────────────────────

  function gridClientYToMinutes(clientY: number): number {
    const grid = taskGridRef.current;
    if (!grid) return timelineStartMinutes;
    return pointerToMinutes(clientY, grid, TIMELINE_TOP_PADDING, HOUR_HEIGHT, timelineStartMinutes);
  }

  function snapAndClamp(minutes: number): number {
    return clampMinutes(snapMinutes(minutes), timelineStartMinutes, timelineEndMinutes - DRAG_MIN_DURATION);
  }

  function minutesToTopPx(minutes: number): number {
    return TIMELINE_TOP_PADDING + ((minutes - timelineStartMinutes) / 60) * HOUR_HEIGHT;
  }

  function minutesToHeightPx(durationMin: number): number {
    return (durationMin / 60) * HOUR_HEIGHT;
  }

  /** Open create sheet pre-filled with a dragged time range. */
  function openCreateSheetWithTime(startMin: number, endMin: number, day: DayKey = activeDay) {
    setActiveDay(day);
    setTaskSheetInitialStartTime(minutesToInputTime(startMin));
    setTaskSheetInitialEndTime(minutesToInputTime(endMin));
    setTaskSheetPlanId(null);
    setTaskSheetTask(null);
    setTaskSheetMode("create");
    setTaskSheetInitialType("task");
    setTaskSheetOpen(true);
  }

  // ── Drag helpers — stable ref so document listeners are deps-free ───────────
  // Updated every render (after isViewingToday is derived) — see below.
  const dragHelpersRef = useRef<{
    gridClientYToMinutes: (clientY: number) => number;
    snapAndClamp: (minutes: number) => number;
    openCreateSheetWithTime: (startMin: number, endMin: number) => void;
    openEditSheet: (task: Task) => void;
    toggleTask: (task: Task) => void;
    setDragCreate: React.Dispatch<React.SetStateAction<{ startMin: number; endMin: number } | null>>;
    setDragMove: React.Dispatch<React.SetStateAction<{ taskId: string; durationMin: number; previewStartMin: number } | null>>;
    setSchedule: ReturnType<typeof useScheduleDB>["setSchedule"];
    activeDay: string;
    isViewingToday: boolean;
    timelineStartMinutes: number;
    timelineEndMinutes: number;
  }>(null as never);

  // ── Drag-create: pointerdown on empty grid ────────────────────────────────

  function handleGridPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-task-block]")) return;
    if (!dragHelpersRef.current.isViewingToday) return;
    const startMin = dragHelpersRef.current.snapAndClamp(
      dragHelpersRef.current.gridClientYToMinutes(e.clientY),
    );
    createDragRef.current = {
      dragging: false,
      startClientY: e.clientY,
      startMin,
      pointerId: e.pointerId,
      lastEndMin: Math.min(startMin + DRAG_DEFAULT_DURATION, timelineEndMinutes),
    };
    // Capture so pointermove/pointerup on this element get all events even if
    // the pointer leaves the grid bounds.
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  // ── Drag-move: pointerdown on task card ───────────────────────────────────

  // Stable identity (reads all live values through refs) so the memoized
  // TimelineTaskBlock doesn't re-render every frame during a drag.
  const handleTaskPointerDown = useCallback((
    e: React.PointerEvent<HTMLDivElement>,
    task: Task,
    layoutStart: number,
    layoutEnd: number,
  ) => {
    e.stopPropagation(); // prevent grid drag-create from firing
    if (!dragHelpersRef.current.isViewingToday) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const grabMin = dragHelpersRef.current.gridClientYToMinutes(e.clientY);
    const durationMin = layoutEnd - layoutStart;
    const grabOffsetMin = Math.max(0, Math.min(grabMin - layoutStart, durationMin));
    const pointerId = e.pointerId;

    // Do NOT capture the pointer here: capture (plus touch-action: none) blocks
    // native vertical scrolling over a card. Drag-move runs off document-level
    // pointer listeners gated by pointerId, so capture isn't needed; a vertical
    // scroll gesture cancels the long-press below and the day scrolls smoothly.

    moveDragRef.current = {
      taskId: task.id,
      task,
      durationMin,
      grabOffsetMin,
      longPressTimer: setTimeout(() => {
        if (!moveDragRef.current || moveDragRef.current.taskId !== task.id) return;
        moveDragRef.current.dragging = true;
        haptic("medium");
        dragHelpersRef.current.setDragMove({ taskId: task.id, durationMin, previewStartMin: layoutStart });
      }, LONG_PRESS_MS),
      dragging: false,
      startClientY: e.clientY,
      pointerId,
      currentPreviewStartMin: layoutStart,
      isCheckbox: !!(e.target as HTMLElement).closest("button[aria-label]"),
    };
  }, []);

  // ── Document-level handlers (installed once, read refs — no stale closures) ─

  useEffect(() => {
    if (iosSafeMode) return;
    // RAF-throttle state updates so React never receives more than one drag
    // state update per animation frame (prevents "Maximum update depth exceeded").
    let rafId: number | null = null;
    let pendingCreate: { startMin: number; endMin: number } | null = null;
    let pendingMoveStartMin: number | null = null;

    function flushDragState() {
      rafId = null;
      const h = dragHelpersRef.current;
      if (pendingCreate !== null) {
        h.setDragCreate(pendingCreate);
        pendingCreate = null;
      }
      if (pendingMoveStartMin !== null) {
        const min = pendingMoveStartMin;
        pendingMoveStartMin = null;
        h.setDragMove((prev) => (prev ? { ...prev, previewStartMin: min } : prev));
      }
    }

    function scheduleFlush() {
      if (rafId === null) rafId = requestAnimationFrame(flushDragState);
    }

    function clearPendingDragFrame() {
      pendingCreate = null;
      pendingMoveStartMin = null;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    function onPointerMove(e: PointerEvent) {
      const h = dragHelpersRef.current;

      // Drag-create
      if (createDragRef.current && createDragRef.current.pointerId === e.pointerId) {
        const { startClientY, startMin, dragging } = createDragRef.current;
        if (!dragging && Math.abs(e.clientY - startClientY) < DRAG_THRESHOLD_PX) return;
        if (!createDragRef.current.dragging) {
          createDragRef.current.dragging = true;
        }
        e.preventDefault(); // prevent scroll during drag-create
        const currentMin = h.gridClientYToMinutes(e.clientY);
        const endMin = Math.max(h.snapAndClamp(currentMin), startMin + DRAG_MIN_DURATION);
        createDragRef.current.lastEndMin = endMin;
        // Only schedule a flush if endMin changed (snapping to same slot → skip)
        if (pendingCreate?.endMin !== endMin || pendingCreate?.startMin !== startMin) {
          pendingCreate = { startMin, endMin };
          scheduleFlush();
        }
        return;
      }

      // Drag-move
      if (moveDragRef.current && moveDragRef.current.pointerId === e.pointerId) {
        const { dragging, startClientY, grabOffsetMin, durationMin, longPressTimer } =
          moveDragRef.current;
        if (!dragging) {
          // Cancel long-press if the user scrolls before 300ms threshold
          if (Math.abs(e.clientY - startClientY) > DRAG_THRESHOLD_PX) {
            if (longPressTimer) clearTimeout(longPressTimer);
            moveDragRef.current = null;
          }
          return;
        }
        e.preventDefault(); // prevent scroll during drag-move
        const currentMin = h.gridClientYToMinutes(e.clientY);
        const newStartMin = clampMinutes(
          snapMinutes(currentMin - grabOffsetMin),
          h.timelineStartMinutes,
          h.timelineEndMinutes - durationMin,
        );
        moveDragRef.current.currentPreviewStartMin = newStartMin;
        if (pendingMoveStartMin !== newStartMin) {
          pendingMoveStartMin = newStartMin;
          scheduleFlush();
        }
      }
    }

    function onPointerUp(e: PointerEvent) {
      const h = dragHelpersRef.current;

      // Drag-create commit
      if (createDragRef.current && createDragRef.current.pointerId === e.pointerId) {
        const { dragging, startMin, lastEndMin } = createDragRef.current;
        createDragRef.current = null;
        clearPendingDragFrame();
        h.setDragCreate(null);
        if (!h.isViewingToday) return;
        if (dragging) {
          h.openCreateSheetWithTime(startMin, lastEndMin);
        } else {
          // tap on empty space → quick-create with default duration
          h.openCreateSheetWithTime(
            startMin,
            Math.min(startMin + DRAG_DEFAULT_DURATION, timelineEndMinutes),
          );
        }
        return;
      }

      // Drag-move commit
      if (moveDragRef.current && moveDragRef.current.pointerId === e.pointerId) {
        const { longPressTimer, dragging, currentPreviewStartMin, durationMin, task, isCheckbox } =
          moveDragRef.current;
        if (longPressTimer) clearTimeout(longPressTimer);
        moveDragRef.current = null;
        clearPendingDragFrame();
        if (!dragging) {
          h.setDragMove(null);
          // Tap on the card body marks the task done (mobile timeline). Taps on
          // the checkbox / subtasks pill run their own handlers (isCheckbox =
          // any aria-labeled control), so they're skipped here to avoid double-firing.
          if (!isCheckbox) h.toggleTask(task);
          return;
        }
        e.preventDefault();
        const newStartMin = currentPreviewStartMin;
        const newEndMin = newStartMin + durationMin;
        const newStartTime = minutesToDisplayTime(newStartMin);
        const newEndTime = minutesToDisplayTime(newEndMin);
        const day = h.activeDay;
        h.setSchedule((prev) => {
          const acts = prev.activities as Record<string, Task[]>;
          return {
            ...prev,
            activities: {
              ...prev.activities,
              [day]: (acts[day] ?? []).map((t: Task) =>
                t.id !== task.id ? t : { ...t, startTime: newStartTime, endTime: newEndTime },
              ),
            },
          };
        });
        haptic("light");
        h.setDragMove(null);
      }
    }

    function onPointerCancel(e: PointerEvent) {
      if (createDragRef.current && createDragRef.current.pointerId === e.pointerId) {
        createDragRef.current = null;
        clearPendingDragFrame();
        dragHelpersRef.current.setDragCreate(null);
      }
      if (moveDragRef.current && moveDragRef.current.pointerId === e.pointerId) {
        if (moveDragRef.current.longPressTimer) clearTimeout(moveDragRef.current.longPressTimer);
        moveDragRef.current = null;
        clearPendingDragFrame();
        dragHelpersRef.current.setDragMove(null);
      }
    }

    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [iosSafeMode]); // handlers read all live values through refs

  // Stable identity (setters are stable) so the memoized TimelineTaskBlock holds.
  const openEditSheet = useCallback((task: Task, dateISO?: string) => {
    // The caller may pass a *resolved* occurrence (timeline); always edit the
    // underlying weekday template so "All days" starts from template values.
    const template =
      DAYS.flatMap((d) => scheduleRef.current.activities[d] ?? []).find((t) => t.id === task.id) ?? task;
    setTaskSheetTask(template);
    setTaskSheetPlanId(template.planId);
    setTaskSheetDateISO(dateISO ?? activeDateISORef.current);
    setTaskSheetMode("edit");
    setTaskSheetOpen(true);
  }, []);

  function closeTaskSheet() {
    createDragRef.current = null;
    moveDragRef.current = null;
    setDragCreate(null);
    setDragMove(null);
    setTaskSheetOpen(false);
    setTaskSheetTask(null);
    setTaskSheetPlanId(null);
    setTaskSheetInitialStartTime("");
    setTaskSheetInitialEndTime("");
  }

  // ── Unified create + edit save handler ────────────────────────────────────

  function handleTaskSheetSave(data: TaskSaveData) {
    // "This day only" — write a minimal per-date override instead of editing the
    // recurring template across every weekday copy.
    if (data.taskId && data.scope === "occurrence" && taskSheetDateISO && taskSheetTask) {
      const diff = diffException(taskSheetTask, {
        title: data.taskDraft.title,
        startTime: data.taskDraft.startTime,
        endTime: data.taskDraft.endTime,
        description: data.taskDraft.description,
      });
      if (Object.keys(diff).length > 0) {
        setSchedule(setTaskException(data.taskId, taskSheetDateISO, diff));
        const label = new Date(taskSheetDateISO + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
        setToastMessage(`Updated ${label} only`);
      }
      closeTaskSheet();
      return;
    }
    if (data.taskId) {
      // Edit mode
      setSchedule(updateTaskDays(data.taskId, data.taskDraft, data.repeatDays, data.planItems));
    } else {
      // Create mode
      setSchedule(createTask(data.taskDraft, data.repeatDays, data.planItems));
    }
    closeTaskSheet();
  }

  function requestDeleteTask(taskId: string, sourceDay: DayKey = activeDay) {
    haptic("light");
    setTaskDeleteRequest({ taskId, sourceDay });
  }

  const handleToggleTaskComplete = useCallback(
    (taskId: string, allSubtaskIds: string[], day: DayKey = activeDay, dateISO?: string) => {
      // Only today is editable — past/future days are read-only (history view).
      if (dateISO && dateISO !== todayISO()) return;
      haptic("medium");
      setSchedule((prev) => ({
        ...prev,
        activities: {
          ...prev.activities,
          [day]: (prev.activities[day] ?? []).map((t) => {
            if (t.id !== taskId) return t;
            // Tapping the checkbox of a "missed" task clears it back to
            // incomplete (un-miss) rather than completing it.
            if (t.missed) return { ...t, ...markTaskMissed(t, allSubtaskIds) };
            return { ...t, ...toggleTaskComplete(t, allSubtaskIds) };
          }),
        },
      }));
    },
    [activeDay, setSchedule]
  );

  const handleMarkTaskMissed = useCallback(
    (taskId: string, allSubtaskIds: string[], day: DayKey = activeDay, dateISO?: string) => {
      // Only today is editable — past/future days are read-only (history view).
      if (dateISO && dateISO !== todayISO()) return;
      haptic("medium");
      setSchedule((prev) => ({
        ...prev,
        activities: {
          ...prev.activities,
          [day]: (prev.activities[day] ?? []).map((t) =>
            t.id === taskId ? { ...t, ...markTaskMissed(t, allSubtaskIds) } : t
          ),
        },
      }));
    },
    [activeDay, setSchedule]
  );

  const handleSnoozeTaskLater = useCallback(
    (taskId: string, day: DayKey = activeDay, dateISO?: string) => {
      // Only today is editable — deferring a past/future occurrence is meaningless.
      if (dateISO && dateISO !== todayISO()) return;
      const task = (schedule.activities[day] ?? []).find((t) => t.id === taskId);
      if (!task) return;
      const patch = snoozeTaskLater(task);
      // No room left later today — tell the user instead of silently doing nothing.
      if (!patch.startTime) {
        haptic("light");
        setToastMessage("No room left today — try tomorrow");
        return;
      }
      haptic("medium");
      setSchedule((prev) => ({
        ...prev,
        activities: {
          ...prev.activities,
          [day]: (prev.activities[day] ?? []).map((t) =>
            t.id === taskId ? { ...t, ...patch } : t
          ),
        },
      }));
      setToastMessage(`Moved to ${patch.startTime}`);
    },
    [activeDay, schedule, setSchedule]
  );

  const handleSkipOccurrence = useCallback(
    (taskId: string, dateISO?: string) => {
      const date = dateISO ?? todayISO();
      const isSkipped = DAYS.some((day) =>
        (schedule.activities[day] ?? []).some((t) => t.id === taskId && t.exceptions?.[date]?.skipped)
      );
      haptic("medium");
      // `{ skipped: false }` un-skips while preserving any other per-date edits.
      setSchedule(setTaskException(taskId, date, { skipped: !isSkipped }));
      setToastMessage(isSkipped ? "Restored this day" : "Skipped this day");
    },
    [schedule, setSchedule]
  );

  const handleToggleSubtask = useCallback(
    (taskId: string, subtaskId: string, day: DayKey = activeDay, dateISO?: string) => {
      if (dateISO && dateISO !== todayISO()) return; // read-only past/future
      haptic("light");
      setSchedule((prev) => ({
        ...prev,
        activities: {
          ...prev.activities,
          [day]: (prev.activities[day] ?? []).map((t) => {
            if (t.id !== taskId) return t;
            const linkedPlan = t.planId ? prev.plans.find((plan) => plan.id === t.planId) ?? null : null;
            const totalSubtasks = getTaskSubtaskSummary(t, linkedPlan).totalCount;
            return { ...t, ...toggleSubtaskComplete(t, subtaskId, totalSubtasks) };
          }),
        },
      }));
    },
    [activeDay, setSchedule]
  );

  function handleBulkImport(result: import("@/lib/scheduleParser").ParseResult) {
    setSchedule((prev) => {
      // Create real plans from inline `# Plan` definitions; map temp ref → real plan.
      const refToPlan = new Map<string, Plan>();
      const newPlans: Plan[] = result.plans.map((p) => {
        const plan: Plan = {
          id: uid(),
          title: p.title,
          description: p.description,
          startDate: p.startDate,
          endDate: p.endDate,
          category: p.category,
          emoji: p.emoji,
          color: p.color,
          items: [],
          metaFields: [],
          summary: [],
        };
        refToPlan.set(p.ref, plan);
        return plan;
      });

      const activities = { ...prev.activities };
      for (const d of result.days) {
        const created: Task[] = d.tasks.map((t) => {
          const { startTime, endTime } = resolveParsedTimes(t);
          const plan =
            (t.planRef ? refToPlan.get(t.planRef) : null) ??
            prev.plans.find((p) => p.id === t.planId) ??
            prev.plans[0] ??
            null;
          const subtasks = t.subtasks?.map((s) => ({
            id: uid(),
            task: s.title,
            info: s.info,
            duration: s.duration,
          }));
          return {
            id: uid(),
            title: t.title,
            startTime,
            endTime,
            icon: t.icon,
            color: (plan?.color ?? "cyan") as AccentColor,
            planId: plan?.id ?? "",
            ...(subtasks !== undefined ? { subtasks } : {}),
          };
        });
        activities[d.day] = sortTasksByTime([...(activities[d.day] ?? []), ...created]);
      }
      return { ...prev, plans: [...prev.plans, ...newPlans], activities };
    });
    setToastMessage(result.plans.length > 0 ? "Plan & tasks imported" : "Tasks imported");
  }

  function handleAddRitual(data: Omit<Ritual, "id">) {
    setSchedule((prev) => ({
      ...prev,
      rituals: [...(prev.rituals ?? []), { ...data, id: uid() }],
    }));
  }

  function handleDeleteRitual(id: string) {
    const ritual = (schedule.rituals ?? []).find((r) => r.id === id);
    openConfirm(
      buildDeleteConfirmationCopy("routine", {
        name: ritual?.title,
        description: "This routine will be removed from your daily practice.",
      }),
      () => setSchedule((prev) => ({
        ...prev,
        rituals: (prev.rituals ?? []).filter((r) => r.id !== id),
        ritualCompletions: (prev.ritualCompletions ?? []).filter((c) => c.ritualId !== id),
      }))
    );
  }

  function handleUpdateRitual(id: string, data: Omit<Ritual, "id">) {
    setSchedule((prev) => ({
      ...prev,
      rituals: (prev.rituals ?? []).map((r) => r.id === id ? { ...r, ...data, id } : r),
    }));
  }

  function handleReorderRituals(reordered: Ritual[]) {
    setSchedule((prev) => ({ ...prev, rituals: reordered }));
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

  // ── Notes ───────────────────────────────────────────────────────────────────
  function handleCreateNote(input: Partial<Pick<Note, "title" | "body" | "tags">> = {}): string {
    const now = new Date().toISOString();
    const note: Note = {
      id: uid(),
      title: input.title ?? "",
      body: input.body ?? "",
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    setSchedule((prev) => ({ ...prev, notes: [note, ...(prev.notes ?? [])] }));
    return note.id;
  }

  function handleUpdateNote(id: string, patch: Partial<Pick<Note, "title" | "body" | "pinned" | "tags" | "linkedTaskIds">>) {
    setSchedule((prev) => ({
      ...prev,
      notes: (prev.notes ?? []).map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n
      ),
    }));
  }

  function handleDeleteNote(id: string) {
    setSchedule((prev) => ({ ...prev, notes: (prev.notes ?? []).filter((n) => n.id !== id) }));
  }

  function handleCreateTaskFromNote(input: CreateTaskFromNoteInput): string | undefined {
    const current = scheduleRef.current;
    const note = current.notes.find((item) => item.id === input.noteId);
    const linkedPlanId = note?.linkedTaskIds
      ?.map((taskId) => DAYS.flatMap((day) => current.activities[day] ?? []).find((task) => task.id === taskId)?.planId)
      .find(Boolean);
    const plan = current.plans.find((item) => item.id === (input.planId ?? linkedPlanId)) ?? current.plans[0];
    if (!plan) {
      setToastMessage("Create a plan first");
      return undefined;
    }
    const id = uid();
    const task: Task = {
      id,
      title: input.title,
      description: "Created from note",
      ...quickTaskTimeRange(),
      icon: plan.emoji,
      color: plan.color,
      planId: plan.id,
      taskType: "task",
    };
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [input.day]: [...(prev.activities[input.day] ?? []), task],
      },
    }));
    setToastMessage("Added to Today");
    return id;
  }

  // De-duplicated tasks (recurring tasks share an id across weekdays) for the
  // note→task link picker + chip titles.
  const notesLinkableTasks = useMemo(() => {
    const byId = new Map<string, Task>();
    for (const day of DAYS) {
      for (const task of schedule.activities[day] ?? []) {
        if (!byId.has(task.id)) byId.set(task.id, task);
      }
    }
    return Array.from(byId.values());
  }, [schedule.activities]);

  const handleOpenLinkedTask = useCallback((taskId: string) => {
    const task = DAYS.flatMap((d) => scheduleRef.current.activities[d] ?? []).find((t) => t.id === taskId);
    if (task) openEditSheet(task);
    else setToastMessage("That task no longer exists");
  }, [openEditSheet]);

  function handleAddGeneratedTasks(tasks: AIGeneratedTask[], planId: string, milestoneId?: string) {
    const plan = schedule.plans.find((p) => p.id === planId);
    if (!plan) return;

    // Rule engine: validate + resolve overlaps before committing to state
    const { valid, conflicts } = applyScheduleRules(tasks, schedule.activities);

    if (conflicts.length > 0) {
      const adjusted = conflicts.map((c) => `"${c.taskTitle}" moved to ${c.adjustedStart}`).join(", ");
      setToastMessage(`Adjusted ${conflicts.length} task${conflicts.length > 1 ? "s" : ""} to avoid overlaps: ${adjusted}`);
    }

    setSchedule((prev) => {
      const updatedActivities = { ...prev.activities };
      const newTaskIds: string[] = [];
      for (const t of valid) {
        const taskId = uid();
        newTaskIds.push(taskId);
        const task: Task = {
          id: taskId,
          title: t.title,
          startTime: t.startTime,
          endTime: t.endTime,
          icon: t.icon || plan.emoji,
          color: colorFromIcon(t.icon) ?? plan.color ?? "cyan",
          planId,
          subtasks: t.subtasks.map((s) => ({ id: uid(), task: s })),
        };
        updatedActivities[t.day] = [...(updatedActivities[t.day] ?? []), task];
      }
      const updatedMilestones = milestoneId
        ? (prev.milestones ?? []).map((m) =>
            m.id === milestoneId
              ? { ...m, linkedActivities: [...(m.linkedActivities ?? []), ...newTaskIds] }
              : m
          )
        : (prev.milestones ?? []);
      return { ...prev, activities: updatedActivities, milestones: updatedMilestones };
    });
  }

  function handleLinkTrackerToMilestone(milestoneId: string, trackerId: string) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (prev.milestones ?? []).map((m) =>
        m.id === milestoneId
          ? { ...m, linkedTrackers: [...new Set([...(m.linkedTrackers ?? []), trackerId])] }
          : m
      ),
    }));
  }

  function handleDeletePlan(planId: string) {
    const plan = schedule.plans.find((p) => p.id === planId);
    openConfirm(
      buildDeleteConfirmationCopy("plan", {
        name: plan?.title,
        description: "All tasks, trackers, and entries linked to this plan will also be deleted.",
      }),
      () => {
        setSchedule((prev) => ({
          ...prev,
          plans: prev.plans.filter((p) => p.id !== planId),
          activities: Object.fromEntries(
            DAYS.map((day) => [day, prev.activities[day].filter((t) => t.planId !== planId)])
          ) as typeof prev.activities,
          metricEntries: prev.metricEntries.filter((e) => e.planId !== planId),
          progressTrackers: prev.progressTrackers.filter((t) => t.planId !== planId),
          milestones: prev.milestones.filter((m) => m.planId !== planId),
        }));
        setSelectedPlanId((cur) => (cur === planId ? null : cur));
      }
    );
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
    openConfirm(
      buildDeleteConfirmationCopy("entry", {
        description: "The logged value will be permanently removed.",
      }),
      () => setSchedule((prev) => ({
        ...prev,
        metricEntries: prev.metricEntries.filter((e) => e.id !== entryId),
      }))
    );
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

  function createPlanFromAIAction(data: import("@/components/plan/AIPlanCreatorSheet").AIPlanCreatorData) {
    const planId = uid();
    const plan: Plan = {
      id: planId,
      title: data.title,
      description: data.description || undefined,
      startDate: data.startDate || undefined,
      endDate: data.endDate || undefined,
      category: categoryFromIcon(data.emoji),
      emoji: data.emoji,
      color: resolveAccentColor(data.color, data.emoji),
      items: [],
      metaFields: [],
      summary: [],
    };
    setSchedule((prev) => {
      const updatedActivities = { ...prev.activities };
      for (const t of data.tasks) {
        const task: Task = {
          id: uid(),
          title: t.title,
          startTime: t.startTime,
          endTime: t.endTime,
          icon: t.icon || plan.emoji,
          color: colorFromIcon(t.icon) ?? plan.color ?? "cyan",
          planId,
          subtasks: (t.subtasks ?? []).map((s) => ({ id: uid(), task: s })),
        };
        const day = t.day as DayKey;
        updatedActivities[day] = [...(updatedActivities[day] ?? []), task];
      }
      return { ...prev, plans: [...prev.plans, plan], activities: updatedActivities };
    });
    setSelectedPlanId(planId);
    return planId;
  }

  function handleCreateAIPlan(data: import("@/components/plan/AIPlanCreatorSheet").AIPlanCreatorData) {
    createPlanFromAIAction(data);
    setAiPlanCreating(false);
  }

  function handleApplyAction(action: AIActionResult) {
    if (action.type === "create_plan") {
      createPlanFromAIAction({
        title: action.payload.title,
        description: action.payload.description,
        emoji: action.payload.emoji,
        color: action.payload.color,
        startDate: action.payload.startDate,
        endDate: action.payload.endDate,
        tasks: action.payload.tasks ?? [],
      });
      setToastMessage(`Created plan "${action.payload.title}"`);
      return;
    }

    if (action.type === "create_ritual") {
      const ritual: Ritual = {
        id: uid(),
        title: action.payload.title,
        time: action.payload.time,
        duration: action.payload.duration,
        repeatDays: action.payload.repeatDays,
        color: action.payload.color,
        sortOrder: (schedule.rituals ?? []).length,
      };
      setSchedule((prev) => ({
        ...prev,
        rituals: [...(prev.rituals ?? []), ritual],
      }));
      setActiveTab(2);
      setToastMessage(`Added ritual "${action.payload.title}"`);
      return;
    }

    if (action.type === "create_strategy") {
      const strategy: StrategyAsset = {
        id: uid(),
        type: "html",
        title: action.payload.title,
        description: action.payload.description || undefined,
        htmlContent: action.payload.htmlContent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSchedule((prev) => ({
        ...prev,
        strategies: [...prev.strategies, strategy],
      }));
      setToastMessage(`Saved strategy "${action.payload.title}"`);
      return;
    }

    if (action.type === "suggest_milestones") {
      const milestones = action.payload.milestones;
      if (!milestones.length) return;
      const planId = selectedPlanId ?? schedule.plans[0]?.id;
      if (!planId) return;
      const now = new Date().toISOString();
      const today = todayISO();
      setSchedule((prev) => {
        const plan = prev.plans.find((p) => p.id === planId);
        const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== planId);
        const existing = (prev.milestones ?? []).filter((m) => m.planId === planId);
        const newMilestones = milestones.map((m, i) => ({
          id: uid(),
          planId,
          title: m.title,
          description: m.description || undefined,
          startDate: m.targetDate ?? today,
          plannedDurationDays: 14,
          plannedEndDate: m.targetDate ?? today,
          status: "upcoming" as const,
          linkedActivities: [],
          linkedTrackers: [],
          createdAt: now,
          updatedAt: now,
          targetDate: m.targetDate ?? today,
          estimatedDays: 14,
          completionStatus: "pending" as const,
          sortOrder: existing.length + i,
        }));
        return {
          ...prev,
          milestones: [
            ...otherMilestones,
            ...normalizeMilestoneTimeline([...existing, ...newMilestones], plan?.startDate),
          ],
        };
      });
      setToastMessage(`Added ${milestones.length} milestone${milestones.length > 1 ? "s" : ""} to roadmap`);
      setActiveTab(1);
      if (planId) setSelectedPlanId(planId);
    }
  }

  function handleDeleteTracker(trackerId: string) {
    const tracker = schedule.progressTrackers.find((t) => t.id === trackerId);
    openConfirm(
      buildDeleteConfirmationCopy("tracker", {
        name: tracker?.title,
        description: "All logged entries for this tracker will also be deleted.",
      }),
      () => setSchedule((prev) => ({
        ...prev,
        progressTrackers: prev.progressTrackers.filter((t) => t.id !== trackerId),
        metricEntries: prev.metricEntries.filter((e) => e.trackerId !== trackerId),
      }))
    );
  }

  function handleDeleteLinkedTask(task: Task, activeDays: DayKey[]) {
    requestDeleteTask(task.id, activeDays[0] ?? activeDay);
  }

  // ─── Milestone handlers ──────────────────────────────────────────────────

  function handleAddMilestone(planId: string, data: MilestoneSaveData) {
    const now = new Date().toISOString();
    const ms: Milestone = {
      ...data,
      id: data.id ?? uid(),
      planId,
      linkedActivities: data.linkedActivities ?? [],
      linkedTrackers: data.linkedTrackers ?? [],
      createdAt: now,
      updatedAt: now,
    };
    setSchedule((prev) => {
      const plan = prev.plans.find((p) => p.id === planId);
      const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== planId);
      const planMilestones = [...(prev.milestones ?? []).filter((m) => m.planId === planId), ms];
      const roadmapStartDate = planMilestones.length === 1 ? ms.startDate : plan?.startDate;
      return {
        ...prev,
        milestones: [
          ...otherMilestones,
          ...normalizeMilestoneTimeline(planMilestones, roadmapStartDate),
        ],
      };
    });
  }

  function handleUpdateMilestone(id: string, data: Partial<Milestone>) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (() => {
        const existing = (prev.milestones ?? []).find((m) => m.id === id);
        if (!existing) return prev.milestones ?? [];
        const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== existing.planId);
        const planMilestones = (prev.milestones ?? []).filter((m) => m.planId === existing.planId);
        // Apply the edit to this milestone and push the remaining ones so they
        // follow its (possibly new) date. Earlier milestones keep their dates.
        return [
          ...otherMilestones,
          ...cascadeMilestoneDates(planMilestones, id, { ...data, updatedAt: new Date().toISOString() }),
        ];
      })(),
    }));
  }

  function handleDeleteMilestone(id: string) {
    const milestone = (schedule.milestones ?? []).find((m) => m.id === id);
    openConfirm(
      buildDeleteConfirmationCopy("milestone", {
        name: milestone?.title,
        description: "This milestone will be permanently removed from the roadmap.",
      }),
      () => setSchedule((prev) => {
        const existing = (prev.milestones ?? []).find((m) => m.id === id);
        if (!existing) return prev;
        const plan = prev.plans.find((p) => p.id === existing.planId);
        const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== existing.planId);
        const planMilestones = (prev.milestones ?? []).filter(
          (m) => m.planId === existing.planId && m.id !== id
        );
        return {
          ...prev,
          milestones: [
            ...otherMilestones,
            ...normalizeMilestoneTimeline(planMilestones, plan?.startDate),
          ],
        };
      })
    );
  }

  function handleCompleteMilestone(id: string) {
    setSchedule((prev) => {
      const existing = (prev.milestones ?? []).find((m) => m.id === id);
      if (!existing) return prev;
      const plan = prev.plans.find((p) => p.id === existing.planId);
      const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== existing.planId);
      const completedAt = todayISO();
      const planMilestones = (prev.milestones ?? [])
        .filter((m) => m.planId === existing.planId)
        .map((m) =>
          m.id === id
            ? {
                ...m,
                status: "completed" as const,
                actualCompletedDate: completedAt,
                completionStatus: "completed" as const,
                completedDate: completedAt,
                updatedAt: new Date().toISOString(),
              }
            : m
        );
      return {
        ...prev,
        milestones: [
          ...otherMilestones,
          ...normalizeMilestoneTimeline(planMilestones, plan?.startDate),
        ],
      };
    });
  }

  // ─── Ritual week history ──────────────────────────────────────────────────

  const ritualWeekHistory = useMemo(() => {
    const today = todayISO();
    const rituals = schedule.rituals ?? [];
    const completions = schedule.ritualCompletions ?? [];
    const SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDaysToISO(today, i - 6);
      const jsDay = new Date(date + "T00:00:00").getDay();
      const dayKey = JS_DAYS[jsDay];
      const due = rituals.filter(
        (r) => !r.repeatDays || r.repeatDays.length === 0 || r.repeatDays.includes(dayKey)
      ).length;
      const done = completions.filter((c) => c.date === date).length;
      return { date, label: SHORT[jsDay], isToday: date === today, completedCount: done, dueCount: due };
    });
  }, [schedule.rituals, schedule.ritualCompletions, todayKey]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const dayTasks = useMemo(
    () => sortTasksByTime(schedule.activities[activeDay]),
    [schedule.activities, activeDay]
  );

  // Real calendar date of the selected weekday (current week ± weekOffset).
  const activeDateISO = useMemo(() => {
    const found = getWeekDates(weekOffset).find((d) => d.day === activeDay);
    return found ? localISODate(found.date) : todayISO();
  }, [weekOffset, activeDay, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  activeDateISORef.current = activeDateISO;
  const isViewingToday = activeDateISO === todayISO();

  // Resolve each weekday-template task to its occurrence on the selected date:
  // drop ones skipped for this date, apply per-date field overrides, and (for
  // days other than today) overlay completion from the dated history — the live
  // flag only holds today.
  const dayTasksView = useMemo(
    () =>
      dayTasks
        .filter((t) => isTaskScheduledOn(t, activeDateISO, true))
        .map((t) => {
          const resolved = resolveOccurrence(t, activeDateISO);
          return isViewingToday ? resolved : { ...resolved, ...completionForDate(t, activeDateISO) };
        }),
    [dayTasks, isViewingToday, activeDateISO]
  );

  const timelineStartMinutes = useMemo(
    () =>
      getTimelineDisplayStartMinutes({
        dayStartTime: schedule.preferences?.dayStartTime,
        tasks: dayTasksView,
      }),
    [dayTasksView, schedule.preferences?.dayStartTime]
  );
  const timelineEndMinutes = TIMELINE_END_MINUTES;
  const timelineHeight = useMemo(
    () =>
      TIMELINE_TOP_PADDING +
      ((timelineEndMinutes - timelineStartMinutes) / 60) * HOUR_HEIGHT +
      TIMELINE_BOTTOM_PADDING,
    [timelineEndMinutes, timelineStartMinutes]
  );
  const timelineMarks = useMemo(
    () => buildTimelineGridMarks(timelineStartMinutes, timelineEndMinutes),
    [timelineEndMinutes, timelineStartMinutes]
  );

  // Update drag helpers ref every render so document-level listeners always
  // have fresh values without needing to be re-registered.
  dragHelpersRef.current = {
    gridClientYToMinutes,
    snapAndClamp,
    openCreateSheetWithTime,
    openEditSheet,
    toggleTask: (task: Task) => {
      haptic("light");
      handleToggleTaskComplete(task.id, taskEffectiveItemIds(task), activeDay, activeDateISO);
    },
    setDragCreate,
    setDragMove,
    setSchedule,
    activeDay,
    isViewingToday,
    timelineStartMinutes,
    timelineEndMinutes,
  };

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
        timelineStartMinutes,
        timelineEndMinutes
      );

      const currentTop =
        TIMELINE_TOP_PADDING +
        ((clampedNow - timelineStartMinutes) / 60) * HOUR_HEIGHT;

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
    timelineEndMinutes,
    timelineStartMinutes,
  ]);

  const taskSheetActiveDays = useMemo(() => {
    if (taskSheetMode !== "edit" || !taskSheetTask) return [activeDay];

    const days = DAYS.filter((day) =>
      schedule.activities[day].some((task) => task.id === taskSheetTask.id)
    );

    return days.length > 0 ? days : [activeDay];
  }, [activeDay, schedule.activities, taskSheetMode, taskSheetTask]);

  // O(1) plan lookup — avoids .find() in every render loop iteration.
  const plansById = useMemo(() => {
    const m = new Map<string, Plan>();
    for (const p of schedule.plans) m.set(p.id, p);
    return m;
  }, [schedule.plans]);

  const taskEffectiveItemCount = useCallback(
    (task: Task) => {
      const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
      return getTaskSubtaskSummary(task, linkedPlan).totalCount;
    },
    [plansById]
  );
  const taskEffectiveItemIds = useCallback(
    (task: Task) => {
      const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
      return getTaskCheckableItems(task, linkedPlan).map((item) => item.id);
    },
    [plansById]
  );

  // Trackers to surface on Today tab — only plans with an active milestone, or plans with no milestones at all
  const activePlanTrackers = useMemo(() => {
    const activePlanIds = new Set(
      schedule.plans
        .filter((p) => {
          const planMilestones = schedule.milestones.filter((m) => m.planId === p.id);
          if (planMilestones.length === 0) return true; // no milestones → still show
          return planMilestones.some((m) => m.status === "active");
        })
        .map((p) => p.id)
    );
    return schedule.progressTrackers.filter((t) => activePlanIds.has(t.planId));
  }, [schedule.plans, schedule.milestones, schedule.progressTrackers]);

  const dayProgress = useMemo(() => {
    const total = dayTasksView.length;
    const done = dayTasksView.filter((t) =>
      isTaskCompleted(t, taskEffectiveItemCount(t))
    ).length;
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [dayTasksView, taskEffectiveItemCount]);

  // ── Today Command Center derived data ──────────────────────────────────────

  /** Reverse map: task ID → the Milestone it's linked to (if any) */
  const taskToMilestoneMap = useMemo(() => {
    const map = new Map<string, Milestone>();
    for (const m of schedule.milestones ?? []) {
      for (const taskId of m.linkedActivities ?? []) {
        map.set(taskId, m);
      }
    }
    return map;
  }, [schedule.milestones]);

  const taskDeleteDetails = useMemo(() => {
    if (!taskDeleteRequest) return null;
    const activeDays = DAYS.filter((day) =>
      schedule.activities[day].some((task) => task.id === taskDeleteRequest.taskId)
    );
    const sourceDay = activeDays.includes(taskDeleteRequest.sourceDay)
      ? taskDeleteRequest.sourceDay
      : activeDays[0] ?? taskDeleteRequest.sourceDay;
    const task =
      schedule.activities[sourceDay]?.find((item) => item.id === taskDeleteRequest.taskId) ??
      Object.values(schedule.activities).flat().find((item) => item.id === taskDeleteRequest.taskId) ??
      null;

    if (!task || activeDays.length === 0) return null;
    return { task, activeDays, sourceDay };
  }, [schedule.activities, taskDeleteRequest]);

  const taskDeleteCopy = useMemo(() => {
    if (!taskDeleteDetails) return null;
    return buildDeleteConfirmationCopy("task", {
      name: taskDeleteDetails.task.title,
      description: taskDeleteDetails.activeDays.length > 1
        ? `This task appears on ${taskDeleteDetails.activeDays.length} days. Choose what you want to delete.`
        : `This removes it from ${deleteDayLabel(taskDeleteDetails.sourceDay)}.`,
    });
  }, [taskDeleteDetails]);

  function deleteDayLabel(day: DayKey): string {
    return day.charAt(0).toUpperCase() + day.slice(1);
  }

  function performTaskDelete(scope: TaskDeleteScope) {
    if (!taskDeleteDetails) return;
    const snapshot = createTaskDeleteSnapshot(
      schedule,
      taskDeleteDetails.task.id,
      taskDeleteDetails.sourceDay,
      scope
    );
    setSchedule(applyTaskDelete(snapshot));
    setTaskDeleteRequest(null);
    haptic("medium");
    setToastMessage({
      message: `Deleted "${taskDeleteDetails.task.title}"`,
      actionLabel: "Undo",
      onAction: () => {
        setSchedule(restoreTaskDelete(snapshot));
        setToastMessage(null);
        haptic("light");
      },
    });
  }

  /** First unresolved task for today, sorted by time — drives What's Next card.
      Skips both completed and missed tasks. */
  const nextTask = useMemo(() => {
    if (activeDay !== todayKey) return null;
    return dayTasks.find((t) => !isTaskResolved(t, taskEffectiveItemCount(t))) ?? null;
  }, [dayTasks, activeDay, todayKey, taskEffectiveItemCount]);

  /** Rituals due on the active day (for summary line) */
  const todayDueRituals = useMemo(
    () =>
      (schedule.rituals ?? []).filter(
        (r) =>
          !r.repeatDays || r.repeatDays.length === 0 || r.repeatDays.includes(activeDay as DayKey)
      ),
    [schedule.rituals, activeDay]
  );
  const todayRitualsTotal = todayDueRituals.length;
  const todayRitualsDone = useMemo(
    () => todayDueRituals.filter((r) => completedRitualIds.has(r.id)).length,
    [todayDueRituals, completedRitualIds]
  );

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

  function navigateByDays(days: number) {
    const activeIndex = DAYS.indexOf(activeDay);
    const targetIndex = activeIndex + days;

    if (targetIndex < 0) {
      setWeekOffset((offset) => offset - 1);
      setActiveDay(DAYS[7 + targetIndex] as DayKey);
    } else if (targetIndex >= 7) {
      setWeekOffset((offset) => offset + 1);
      setActiveDay(DAYS[targetIndex - 7] as DayKey);
    } else {
      setActiveDay(DAYS[targetIndex] as DayKey);
    }
  }

  const visibleDates = useMemo(() => {
    if (calendarView === "7day") return weekDates;
    if (calendarView === "1day") {
      const selectedDate = weekDates.find(({ day }) => day === activeDay);
      return selectedDate ? [selectedDate] : weekDates.slice(0, 1);
    }
    if (calendarView === "3day") {
      const activeIndex = weekDates.findIndex(({ day }) => day === activeDay);
      const startIndex = Math.max(0, Math.min(4, activeIndex - 1));
      return weekDates.slice(startIndex, startIndex + 3);
    }
    return weekDates.filter(({ day }) => customDays.includes(day));
  }, [activeDay, calendarView, customDays, weekDates]);


  const selectedPlan = useMemo(
    () => (selectedPlanId ? plansById.get(selectedPlanId) ?? null : null),
    [selectedPlanId, plansById]
  );

  const sessionLinkedPlan = useMemo(
    () => (sessionTask?.planId ? plansById.get(sessionTask.planId) ?? null : null),
    [sessionTask, plansById]
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

  // Stable toggle for memoized timeline cards (mirrors the inline closure that
  // renderTimelineTaskCard used, but with a stable identity so cards don't
  // re-render during a drag). Recreated only when the active day/date changes.
  const handleTimelineToggle = useCallback(
    (task: Task) => {
      haptic("light");
      handleToggleTaskComplete(task.id, taskEffectiveItemIds(task), activeDay, activeDateISO);
    },
    [handleToggleTaskComplete, taskEffectiveItemIds, activeDay, activeDateISO]
  );

  const timelineTaskLayouts = useMemo(() => {
    const intervals = dayTasksView
      .map((task) => {
        const parsedStart = parseTimeToMinutes(task.startTime);
        const start = parsedStart === null
          ? timelineStartMinutes
          : mapMinutesToTimeline(parsedStart, timelineStartMinutes, timelineEndMinutes);
        const parsedEnd = parseTimeToMinutes(task.endTime);
        let end = parsedEnd === null
          ? start + 30
          : mapMinutesToTimeline(parsedEnd, timelineStartMinutes, timelineEndMinutes);
        while (end <= start) end += 1440;
        const isOvernight = end >= 1440;
        const cs = clamp(start, timelineStartMinutes, timelineEndMinutes);
        const ce = clamp(Math.max(end, cs + 15), timelineStartMinutes, timelineEndMinutes);
        return {
          task,
          color: getTaskPresentation(task).color,
          start: cs,
          end: ce,
          isOvernight,
          isTruncated: isOvernight && end > timelineEndMinutes,
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
  }, [dayTasksView, timelineEndMinutes, timelineStartMinutes]);


  // ─── Loading ───────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
        <div className="flex flex-col items-center justify-center gap-3 pt-[30vh]">
          <img src="/logo.svg" alt="PlanR" className="h-7 w-auto opacity-80 dark:hidden" />
          <img src="/logo-dark.svg" alt="PlanR" className="hidden h-7 w-auto opacity-80 dark:block" />
          <div className="h-1 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
            <div className="h-full w-1/3 rounded-full bg-neutral-700 dark:bg-white/60 animate-loading-bar" />
          </div>
        </div>
        {/* Ghost dashboard so first paint reads as the app taking shape. */}
        <div className="mx-auto mt-14 w-full max-w-[980px] px-4" aria-hidden="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="hidden h-32 rounded-2xl lg:block" />
            <Skeleton className="hidden h-32 rounded-2xl lg:block" />
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="hidden h-48 rounded-2xl lg:block" />
          </div>
        </div>
      </main>
    );
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  function renderTimelineTaskCard(
    task: Task,
    cardClassName: string,
    cardSize: CardSize = "large",
    isOvernight = false,
    isTruncated = false
  ) {
    // Unified visual: the shared TaskBlockCard (same component as the desktop
    // week grid + the mobile list). Size tiers map to its grid variants.
    const { linkedPlan } = getTaskPresentation(task);
    const duration = formatTaskDuration(task.startTime, task.endTime);
    const subtaskSummary = getTaskSubtaskSummary(task, linkedPlan);
    const allSubtaskIds = subtaskSummary.hasItems ? getTaskCheckableItems(task, linkedPlan).map((i) => i.id) : [];
    const taskState = resolveTaskState(task, subtaskSummary.totalCount);
    const toggle = () => { haptic("light"); handleToggleTaskComplete(task.id, allSubtaskIds, activeDay, activeDateISO); };
    void cardClassName; void isOvernight; void isTruncated;

    return (
      <TaskBlockCard
        variant="grid"
        task={task}
        plan={linkedPlan}
        state={taskState}
        duration={duration}
        readOnly={!isViewingToday}
        minimal={cardSize === "xsmall"}
        compact={cardSize === "small" || cardSize === "medium"}
        narrow={cardSize === "small"}
        onToggle={toggle}
        onClick={() => openEditSheet(task)}
        className="h-full w-full"
      />
    );
  }

  // ─── Shared card renderer for WeekGrid ────────────────────────────────────
  // Same visual as the mobile timeline — changes here apply to both surfaces.

  function renderWeekCard(
    task: Task,
    height: number,
    widthPct: number,
    readOnly: boolean,
    onToggle: () => void,
    onDelete: () => void,
  ) {
    const { linkedPlan } = getTaskPresentation(task);
    const duration = formatTaskDuration(task.startTime, task.endTime);
    const taskState = resolveTaskState(task, getTaskSubtaskSummary(task, linkedPlan).totalCount);
    return (
      <TaskBlockCard
        variant="grid"
        task={task}
        plan={linkedPlan}
        state={taskState}
        duration={duration}
        readOnly={readOnly}
        compact={height < 56}
        narrow={widthPct < 60 || height < 88}
        onToggle={onToggle}
        onClick={() => openEditSheet(task)}
        onDelete={!readOnly ? onDelete : undefined}
        className="h-full w-full"
      />
    );
  }

  // ─── Plan list ─────────────────────────────────────────────────────────────

  function renderPlanList() {
    const planRows = schedule.plans.map((plan) => {
      const uniqueTasks = getUniquePlanTasks(plan.id);
      const trackerCount = schedule.progressTrackers.filter((t) => t.planId === plan.id).length;
      const planIconEntry = SECTION_ICONS.find((e) => e.name === plan.emoji) ?? SECTION_ICONS[0];
      const stats = getPlanCardStats(plan, schedule.activities, todayKey);
      const dateRange = plan.startDate || plan.endDate ? formatPlanRange(plan) : null;
      const firstTracker = schedule.progressTrackers.find((t) => t.planId === plan.id);
      return { plan, uniqueTasks, trackerCount, planIconEntry, stats, dateRange, firstTracker };
    });
    const atRiskCount = planRows.filter(
      ({ stats }) => stats.consistency >= 35 && stats.consistency < 70
    ).length;
    const needsWorkCount = planRows.filter(({ stats }) => stats.consistency < 35).length;
    const needsFocusCount = atRiskCount + needsWorkCount;
    const totalPlanTasks = planRows.reduce((sum, row) => sum + row.uniqueTasks.length, 0);
    const totalTrackers = planRows.reduce((sum, row) => sum + row.trackerCount, 0);
    const topPlan = planRows.length > 0
      ? [...planRows].sort((a, b) => b.stats.consistency - a.stats.consistency)[0]
      : null;

    return (
      <div className="pb-8 pt-5 lg:pb-10 lg:pt-6">
        <div className="mx-auto w-full max-w-[1500px]">
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
            <EmptyState
              icon={IconClipboardList}
              title="No plans yet"
              description="Start from scratch or pick a template with tasks and milestones ready to go."
              action={{ label: "New Plan", onClick: () => setAddingPlan(true) }}
              secondaryAction={{ label: "Browse templates", onClick: () => setTemplatesOpen(true) }}
            />
          )}

          {schedule.plans.length > 0 && (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="min-w-0">
                <button
                  type="button"
                  onClick={() => setTemplatesOpen(true)}
                  className="mb-3 w-full rounded-2xl border border-dashed border-neutral-200 py-3 text-[13px] font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20 dark:hover:text-neutral-300 lg:hidden"
                >
                  + Browse example templates
                </button>

                <div className="grid gap-3 lg:grid-cols-2">
                  {planRows.map(({ plan, uniqueTasks, trackerCount, planIconEntry, stats, dateRange, firstTracker }) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      PlanIcon={planIconEntry.icon}
                      taskCount={uniqueTasks.length}
                      trackerCount={trackerCount}
                      dayState={stats.dayState}
                      consistency={stats.consistency}
                      dateRange={dateRange}
                      onSelect={() => { haptic("light"); setSelectedPlanId(plan.id); }}
                      onQuickLog={firstTracker ? () => setEntryTracker(firstTracker) : undefined}
                      onDelete={() => handleDeletePlan(plan.id)}
                    />
                  ))}
                </div>
              </section>

              <aside className="hidden min-w-0 space-y-3 xl:block">
                <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/[0.08] dark:bg-neutral-900">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                    Today&apos;s signal
                  </p>
                  <p className="mt-2 text-[24px] font-black leading-none text-neutral-950 dark:text-white">
                    {needsFocusCount > 0 ? `${needsFocusCount} need focus` : "All steady"}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                    {topPlan
                      ? `${topPlan.plan.title} is your strongest plan at ${topPlan.stats.consistency}% consistency.`
                      : "Create a plan to start tracking execution."}
                  </p>
                </div>

                <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/[0.08] dark:bg-neutral-900">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                    System totals
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 dark:border-white/[0.06]">
                      <span className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Planned tasks</span>
                      <span className="text-[13px] font-black tabular-nums text-neutral-950 dark:text-white">{totalPlanTasks}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 dark:border-white/[0.06]">
                      <span className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Trackers</span>
                      <span className="text-[13px] font-black tabular-nums text-neutral-950 dark:text-white">{totalTrackers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Templates</span>
                      <button
                        type="button"
                        onClick={() => setTemplatesOpen(true)}
                        className="text-[13px] font-bold text-neutral-950 transition-colors hover:text-neutral-600 dark:text-white dark:hover:text-neutral-300"
                      >
                        Browse
                      </button>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────
  const TabPresence = iosSafeMode ? NoopPresence : AnimatePresence;
  const DayPresence = iosSafeMode ? NoopPresence : AnimatePresence;
  const ViewPresence = iosSafeMode ? NoopPresence : AnimatePresence;
  const authLabel = authLoading
    ? "Auth checking"
    : isGuest
    ? "Guest mode"
    : user?.displayName || user?.email || "Signed in";
  const subtasksRawTask = subtasksRef
    ? (schedule.activities[subtasksRef.day] ?? []).find((task) => task.id === subtasksRef.id) ?? null
    : null;
  const subtasksResolvedTask = subtasksRawTask && subtasksRef
    ? resolveOccurrence(subtasksRawTask, subtasksRef.dateISO)
    : subtasksRawTask;
  const subtasksDetailTask = subtasksResolvedTask && subtasksRef && subtasksRef.dateISO !== todayISO()
    ? { ...subtasksResolvedTask, ...completionForDate(subtasksRawTask!, subtasksRef.dateISO) }
    : subtasksResolvedTask;
  const subtasksLinkedPlan = subtasksDetailTask?.planId ? plansById.get(subtasksDetailTask.planId) ?? null : null;
  const showMobileTaskDetailPage = !!subtasksRef && !isDesktopViewport;

  return (
    <main className="min-h-dvh bg-[#F3F4F1] text-neutral-900 dark:bg-[#0E0E0E] dark:text-white lg:flex lg:h-dvh lg:gap-10 lg:overflow-hidden lg:p-4">

      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────────────── */}
      {!iosSafeMode && (
        <DesktopSidebar
          activeTab={activeTab}
          collapsed={sidebarCollapsed}
          ollamaUrl={ollamaUrl}
          ollamaModel={ollamaModel}
          onTabChange={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onCreateTask={() => openCreateSheet()}
          onCreatePlan={openAddPlan}
          onCreateRitual={() => { setActiveTab(2); if (canAddRitual) setRitualAddOpen(true); }}
          onBulkImport={() => setBulkImportOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSettingsTab={() => setActiveTab(5)}
          onOpenNotes={() => { setSelectedPlanId(null); setActiveTab(6); }}
        />
      )}

      {/* ── Main scrollable column ──────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">

      {/* ── Header (mobile only) ────────────────────────────────────────────── */}
      <div className="lg:hidden">
        {showMobileTaskDetailPage ? null : selectedPlan ? (
          <AppHeader
            back={{ label: "Plans", onBack: () => setSelectedPlanId(null) }}
            actions={[
              {
                icon: IconEdit,
                label: "Edit plan",
                onClick: () => setEditingPlanId(selectedPlan.id),
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
          <AppHeader onOpenSettings={() => setActiveTab(5)} onNotes={() => setActiveTab(6)} />
        )}
      </div>


      {!iosSafeMode && (
        <SettingsSheet
          open={settingsOpen}
          onClose={() => {
            setSettingsOpen(false);
            setOllamaUrl(localStorage.getItem(OLLAMA_URL_KEY) ?? DEFAULT_OLLAMA_URL);
            setOllamaModel(localStorage.getItem(OLLAMA_MODEL_KEY) ?? DEFAULT_OLLAMA_MODEL);
          }}
          onClearData={clearData}
          onClearProgress={clearProgress}
          onRestoreData={restoreData}
          schedule={schedule}
          onUpdatePreferences={(patch) =>
            setSchedule((prev) => ({
              ...prev,
              preferences: {
                ...prev.preferences,
                ...patch,
              },
            }))
          }
        />
      )}
      <TemplatesSheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} onApply={handleApplyTemplate} />

      <DayWallpaperSheet
        open={wallpaperOpen}
        onClose={() => setWallpaperOpen(false)}
        schedule={schedule}
        todayKey={todayKey}
      />

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {/* paddingTop offsets the fixed header (64px) + iOS safe-area inset — mobile only.
          (Tailwind arbitrary value so `lg:pt-0` can actually override it; an inline
          style would win over the breakpoint and leave a phantom gap on desktop.) */}
      {showMobileTaskDetailPage ? (
        <div
          className="h-dvh bg-white dark:bg-neutral-950 lg:hidden"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <TaskDetailView
            task={subtasksDetailTask}
            linkedPlan={subtasksLinkedPlan}
            readOnly={!!subtasksRef && subtasksRef.dateISO !== todayISO()}
            onClose={() => setSubtasksRef(null)}
            onToggleSubtask={(taskId, subId) => handleToggleSubtask(taskId, subId, subtasksRef?.day, subtasksRef?.dateISO)}
            onToggleComplete={(taskId, ids) => handleToggleTaskComplete(taskId, ids, subtasksRef?.day, subtasksRef?.dateISO)}
            onMissed={(taskId, ids) => handleMarkTaskMissed(taskId, ids, subtasksRef?.day, subtasksRef?.dateISO)}
            onSnooze={(taskId) => handleSnoozeTaskLater(taskId, subtasksRef?.day, subtasksRef?.dateISO)}
            onSkip={(taskId) => handleSkipOccurrence(taskId, subtasksRef?.dateISO)}
            skipped={!!(subtasksRef && subtasksRawTask?.exceptions?.[subtasksRef.dateISO]?.skipped)}
            canSkip={!!subtasksRef && subtasksRef.dateISO >= todayISO()}
            onEdit={subtasksRawTask ? () => { openEditSheet(subtasksRawTask, subtasksRef?.dateISO); setSubtasksRef(null); } : undefined}
            presentation="page"
          />
        </div>
      ) : activeTab === 6 ? (
        // Notes lives inside the layout: a framed panel beside the sidebar on
        // desktop, a full-screen page on mobile.
        <div
          className="fixed inset-0 z-50 bg-white dark:bg-neutral-950 lg:static lg:z-auto lg:relative lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-neutral-200 dark:lg:border-white/[0.08]"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <ErrorBoundary section name="Notes">
            <NotesView
              notes={schedule.notes}
              onCreate={handleCreateNote}
              onUpdate={handleUpdateNote}
              onDelete={handleDeleteNote}
              onClose={() => setActiveTab(0)}
              tasks={notesLinkableTasks}
              plans={schedule.plans}
              onOpenTask={handleOpenLinkedTask}
              onCreateTaskFromNote={handleCreateTaskFromNote}
              todayDateISO={todayISO()}
              disableMotion={iosSafeMode}
            />
          </ErrorBoundary>
        </div>
      ) : (
      /* pt = the fixed header's base height (64px). The notch inset is already
         applied once by the body's padding-top, so we must NOT add it again
         here or it double-counts and leaves a gap under the header. */
      <div className="max-w-full pb-40 pt-16 lg:pt-0 lg:flex-1 lg:max-w-none lg:overflow-y-auto lg:pb-0">
        <TabPresence mode="wait" initial={false}>

        {/* ── Tasks Tab ────────────────────────────────────────────────────── */}
        {activeTab === 0 && (
          <m.div
            key="tab-tasks"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="lg:flex lg:h-full lg:overflow-hidden"
          >
            {/* ── Desktop WeekGrid (right panel, lg+ only) ──────────────────── */}
            <div className="hidden lg:flex lg:min-w-0 lg:flex-1 lg:overflow-hidden">
              <WeekGrid
                schedule={schedule}
                plansById={plansById}
                rituals={schedule.rituals ?? []}
                ritualCompletions={schedule.ritualCompletions ?? []}
                onToggleRitual={handleToggleRitualComplete}
                weekDates={visibleDates}
                todayKey={todayKey}
                weekLabel={weekLabel}
                activeDay={activeDay}
                calendarView={calendarView}
                customDays={customDays}
                onDaySelect={setActiveDay}
                onCreateTaskAtTime={(day, startMin, endMin) => openCreateSheetWithTime(startMin, endMin, day)}
                onWeekPrev={() => {
                  if (calendarView === "1day") navigateByDays(-1);
                  else if (calendarView === "3day") navigateByDays(-3);
                  else setWeekOffset((offset) => offset - 1);
                }}
                onWeekNext={() => {
                  if (calendarView === "1day") navigateByDays(1);
                  else if (calendarView === "3day") navigateByDays(3);
                  else setWeekOffset((offset) => offset + 1);
                }}
                onWeekToday={() => { setWeekOffset(0); setActiveDay(todayKey); }}
                onCalendarViewChange={setCalendarView}
                onCustomDaysChange={setCustomDays}
                onEditTask={openEditSheet}
                onDeleteTask={requestDeleteTask}
                onToggleTaskComplete={handleToggleTaskComplete}
                renderCard={renderWeekCard}
              />
            </div>

            {/* ── Unified: calendar strip + day timeline (mobile only) ────────── */}
            <div className="flex min-h-0 flex-col bg-neutral-50 lg:hidden dark:bg-neutral-950">

            {/* ── Mobile calendar strip ───────────────────────────────────── */}
            <div className="shrink-0 px-4 pt-4">
              {/* Month + nav row */}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[20px] font-bold tracking-[-0.3px] text-neutral-900 dark:text-white">
                  {weekLabel}
                </span>
                <div className="flex items-center gap-1">
                  {weekOffset !== 0 && (
                    <button
                      type="button"
                      onClick={() => { setWeekOffset(0); setActiveDay(todayKey); }}
                      className="mr-0.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      Today
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { haptic("light"); setWeekOffset((w) => w - 1); }}
                    aria-label="Previous week"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
                  >
                    <IconChevronLeft size={16} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { haptic("light"); setWeekOffset((w) => w + 1); }}
                    aria-label="Next week"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
                  >
                    <IconChevronRight size={16} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* Day strip */}
              <div className="grid grid-cols-7 gap-0.5 border-b border-neutral-200/80 pb-3 dark:border-white/[0.06]">
                {weekDates.map(({ day, date }) => {
                  const isDateToday = date.getTime() === todayMidnightTime;
                  const isActive = day === activeDay;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => { haptic("light"); setActiveDay(day); }}
                      className="relative flex flex-col items-center"
                    >
                      {/* Active day: tall black pill */}
                      {isActive && (iosSafeMode ? (
                        <div
                          className="absolute inset-0 rounded-[14px] bg-neutral-950 dark:bg-white"
                        />
                      ) : (
                        <m.div
                          layoutId="weekDayPill"
                          className="absolute inset-0 rounded-[14px] bg-neutral-950 dark:bg-white"
                          style={{ willChange: "transform" }}
                          transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.6 }}
                        />
                      ))}
                      <m.div
                        whileTap={{ scale: 0.90 }}
                        transition={{ type: "spring", stiffness: 500, damping: 28 }}
                        className="relative z-10 flex flex-col items-center gap-2 w-full py-3"
                      >
                        <span className={`text-[11px] font-semibold leading-none ${
                          isActive
                            ? "text-white/55 dark:text-neutral-900/55"
                            : isDateToday
                            ? "text-rose-500"
                            : "text-neutral-400 dark:text-neutral-500"
                        }`}>
                          {DAY_LABELS[day]}
                        </span>
                        <span className={`text-[18px] font-bold leading-none tabular-nums ${
                          isActive
                            ? "text-white dark:text-neutral-950"
                            : isDateToday
                            ? "text-rose-500"
                            : "text-neutral-800 dark:text-neutral-200"
                        }`}>
                          {date.getDate()}
                        </span>
                      </m.div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
            <DayPresence mode="wait" initial={false}>
            <m.div
              key={activeDay}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="flex min-h-0 flex-1 flex-col"
            >

            {/* ── Title + progress ──────────────────────────────────────────── */}
            <div className="shrink-0 px-4 pt-5 pb-2">
              {/* Title row */}
              <div className="flex items-center justify-between">
                <h1 className="text-[24px] font-bold leading-tight tracking-[-0.8px] text-neutral-900 dark:text-white">
                  Today's Task
                </h1>
                <div className="flex items-center gap-2.5">
                  <IconButton
                    label="Lock screen wallpaper"
                    variant="soft"
                    size="sm"
                    radius="full"
                    onClick={() => { haptic("light"); setWallpaperOpen(true); }}
                  >
                    <IconPhoto size={15} strokeWidth={2} />
                  </IconButton>
                  {dayProgress.total > 0 && (
                    <div className="flex items-center gap-1.5 text-neutral-400 dark:text-neutral-500">
                      <IconChecklist size={16} strokeWidth={1.8} />
                      <span className="text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
                        {dayProgress.done}/{dayProgress.total}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {dayProgress.total > 0 && (
                <ProgressBar pct={dayProgress.pct} height={6} className="mt-3" />
              )}
            </div>

            {/* Task content */}
            <div className="flex min-h-0 flex-1 flex-col px-4 lg:overflow-hidden">
              {/* Rituals strip */}
              <TodayRitualsBar
                rituals={schedule.rituals ?? []}
                activeDay={activeDay}
                completedIds={completedRitualIds}
                onToggle={handleToggleRitualComplete}
              />
              <div className="flex min-h-0 flex-1 flex-col">
              <ViewPresence mode="wait" initial={false}>
                {iosSafeMode || viewMode === "list" ? (
                  <m.div
                    key="list"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {dayTasks.length === 0 ? (
                      schedule.plans.length === 0 ? (
                        <EmptyState
                          icon={IconCalendar}
                          title="No plans yet"
                          description="Create a plan first, then add tasks to schedule your day."
                          action={{ label: "Create a Plan", onClick: () => setActiveTab(1) }}
                        />
                      ) : (
                        <EmptyState
                          icon={IconCalendar}
                          title="Nothing scheduled"
                          description="Add your first task for this day to start building your schedule."
                          action={{ label: "Add Task", onClick: () => openCreateSheet() }}
                        />
                      )
                    ) : editMode && !iosSafeMode ? (
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
                                      onDelete={() => requestDeleteTask(task.id, activeDay)}
                                    />
                                  </div>
                                )}
                              </SortableTaskCard>
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    ) : (
                      <div className="stagger-rise flex flex-col gap-3 pb-4">
                        {dayTasksView.map((task) => {
                          const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
                          const linkedMilestone = taskToMilestoneMap.get(task.id);
                          return (
                            <div key={task.id}>
                              <ListTaskCard
                                task={task}
                                linkedPlan={linkedPlan}
                                readOnly={!isViewingToday}
                                onToggleComplete={(id, ids) => handleToggleTaskComplete(id, ids, activeDay, activeDateISO)}
                                onToggleSubtask={(id, sub) => handleToggleSubtask(id, sub, activeDay, activeDateISO)}
                                onEdit={() => openEditSheet(task)}
                                onDelete={() => requestDeleteTask(task.id, activeDay)}
                                onOpenSubtasks={() => setSubtasksRef({ id: task.id, day: activeDay, dateISO: activeDateISO })}
                              />
                              {linkedMilestone && (
                                <div className="mt-[-6px] px-1 pb-0.5">
                                  <span className="inline-flex items-center gap-1 rounded-b-xl bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600 dark:bg-white/[0.08] dark:text-neutral-300">
                                    → {linkedMilestone.title}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </m.div>
                ) : (
                  <m.div
                    key="timeline"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="flex min-h-0 flex-1 flex-col"
                  >
                    {dayTasks.length === 0 && (
                      <div className="mb-3 shrink-0 rounded-2xl border border-dashed border-neutral-200 py-8 text-center dark:border-white/10">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06] mx-auto mb-2">
                          <IconCalendar size={17} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
                        </div>
                        <p className="text-[13px] font-medium text-neutral-400 dark:text-neutral-500">
                          Nothing scheduled — tap + to add a task.
                        </p>
                      </div>
                    )}
                    {/* Routine dot legend — maps timeline dot colors to routines */}
                    <RitualLegend
                      rituals={schedule.rituals ?? []}
                      activeDay={activeDay}
                      timelineStartMinutes={timelineStartMinutes}
                      timelineEndMinutes={timelineEndMinutes}
                      timelineTopPadding={TIMELINE_TOP_PADDING}
                      hourHeight={HOUR_HEIGHT}
                      completedIds={completedRitualIds}
                    />
                    {/* Premium execution timeline */}
                    <ErrorBoundary section name="Timeline">
                    <div className="-mx-4">
                      <div
                        ref={timelineScrollRef}
                        onScroll={() => {
                          if (isAutoScrollingRef.current) return;
                          hasUserScrolledTimelineRef.current = true;
                        }}
                        className="calendar-scrollbar-none relative flex h-[calc(100dvh-280px)] overflow-y-auto overflow-x-hidden bg-transparent lg:h-auto lg:min-h-0 lg:flex-1"
                      >
                      {/* Time column */}
                      <div
                        className="sticky left-0 z-20 w-[52px] shrink-0 bg-transparent"
                        style={{ height: timelineHeight }}
                      >
                        {timelineMarks.map((mark) => {
                          const isMidnight = mark % 1440 === 0;
                          const isHourMark = mark % 60 === 0;
                          return (
                            <div key={mark}>
                              <div
                                className="absolute right-0 pr-2.5"
                                style={{
                                  top:
                                    TIMELINE_TOP_PADDING +
                                    ((mark - timelineStartMinutes) / 60) * HOUR_HEIGHT -
                                    (isHourMark || isMidnight ? 6 : 5),
                                }}
                              >
                                {isMidnight ? (
                                  <span className="text-[10px] font-bold text-neutral-400 dark:text-white/25 leading-none uppercase tracking-wide">
                                    tmrw
                                  </span>
                                ) : (
                                  <span
                                    className={`tabular-nums leading-none ${
                                      isHourMark
                                        ? "text-[9px] font-semibold text-neutral-500 dark:text-neutral-500"
                                        : "text-[9px] font-medium text-neutral-500 dark:text-neutral-500"
                                    }`}
                                  >
                                    {isHourMark ? formatHourLabel(mark) : formatHalfHourLabel(mark)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Ritual lane — dedicated column, pills start here and never cover task titles */}
                      <div
                        className="relative shrink-0 overflow-visible"
                        style={{ width: RITUAL_LANE_WIDTH, height: timelineHeight }}
                      >
                        <RitualOverlayLayer
                          rituals={schedule.rituals ?? []}
                          activeDay={activeDay}
                          timelineStartMinutes={timelineStartMinutes}
                          timelineEndMinutes={timelineEndMinutes}
                          timelineTopPadding={TIMELINE_TOP_PADDING}
                          hourHeight={HOUR_HEIGHT}
                          completedIds={completedRitualIds}
                          onToggleComplete={handleToggleRitualComplete}
                        />
                      </div>

                      {/* Grid + tasks */}
                      <div
                        ref={taskGridRef}
                        className="relative min-w-0 flex-1 border-l border-neutral-200/80 dark:border-white/[0.07]"
                        style={{ height: timelineHeight, contain: "layout style" }}
                        onPointerDown={!iosSafeMode && isViewingToday ? handleGridPointerDown : undefined}
                      >
                        {/* Grid lines */}
                        <div className="absolute inset-0 pointer-events-none">
                          {timelineMarks.map((mark) => {
                            const isMidnight = mark % 1440 === 0;
                            const isHourMark = mark % 60 === 0;
                            return (
                              <div key={`grid-${mark}`}>
                                <div
                                  className={`absolute left-0 right-0 border-t ${
                                    isMidnight
                                      ? "border-neutral-300/80 dark:border-white/[0.16]"
                                      : isHourMark
                                      ? "border-neutral-300/70 dark:border-white/[0.12]"
                                      : "border-dashed border-neutral-200/80 dark:border-white/[0.06]"
                                  }`}
                                  style={{
                                    top:
                                      TIMELINE_TOP_PADDING +
                                      ((mark - timelineStartMinutes) / 60) * HOUR_HEIGHT,
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* Task blocks */}
                        <div className="absolute inset-0">
                          {timelineTaskLayouts.map((layout) => (
                            <TimelineTaskBlock
                              key={layout.task.id}
                              layout={layout}
                              plan={layout.task.planId ? plansById.get(layout.task.planId) ?? null : null}
                              isBeingMoved={dragMove?.taskId === layout.task.id}
                              isViewingToday={isViewingToday}
                              onPointerDown={handleTaskPointerDown}
                              onToggle={handleTimelineToggle}
                              onOpenSubtasks={(task) => setSubtasksRef({ id: task.id, day: activeDay, dateISO: activeDateISO })}
                            />
                          ))}

                          {/* Drag-create ghost block */}
                          {dragCreate && (() => {
                            const top = minutesToTopPx(dragCreate.startMin);
                            const height = Math.max(minutesToHeightPx(dragCreate.endMin - dragCreate.startMin), 24);
                            const showDuration = dragCreate.endMin - dragCreate.startMin >= 30;
                            return (
                              <div
                                className="pointer-events-none absolute left-0.5 right-0.5 z-20"
                                style={{ top, height }}
                              >
                                <TimelineDraftCard
                                  startLabel={minutesToDisplayTime(dragCreate.startMin)}
                                  endLabel={minutesToDisplayTime(dragCreate.endMin)}
                                  durationLabel={showDuration ? getDurationLabel(dragCreate.startMin, dragCreate.endMin) : null}
                                  compact={height < 56}
                                  className="h-full"
                                />
                              </div>
                            );
                          })()}

                          {/* Drag-move preview block */}
                          {dragMove && (() => {
                            const movingTask = dayTasksView.find((t) => t.id === dragMove.taskId);
                            if (!movingTask) return null;
                            const top = minutesToTopPx(dragMove.previewStartMin);
                            const height = Math.max(minutesToHeightPx(dragMove.durationMin), 24);
                            const cardSize = computeCardSize(height, 1);
                            return (
                              <div
                                className="pointer-events-none absolute left-0.5 right-0.5 z-30"
                                style={{ top, height, opacity: 0.93 }}
                              >
                                {renderTimelineTaskCard(
                                  { ...movingTask, startTime: minutesToDisplayTime(dragMove.previewStartMin), endTime: minutesToDisplayTime(dragMove.previewStartMin + dragMove.durationMin) },
                                  "h-full rounded-[8px] px-2 py-1.5 w-full min-w-0 overflow-hidden border border-neutral-300 dark:border-white/20",
                                  cardSize,
                                  false,
                                  false
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Current-task glow — isolated layer, hugs the active block */}
                        <CurrentTaskHighlightLayer
                          layouts={timelineTaskLayouts}
                          activeDay={activeDay}
                          todayKey={todayKey}
                          timelineStartMinutes={timelineStartMinutes}
                          timelineEndMinutes={timelineEndMinutes}
                        />

                        {/* Current time — isolated layer, owns its own 30s interval */}
                        <CurrentTimeLayer
                          activeDay={activeDay}
                          todayKey={todayKey}
                          timelineStartMinutes={timelineStartMinutes}
                          timelineEndMinutes={timelineEndMinutes}
                          timelineTopPadding={TIMELINE_TOP_PADDING}
                          hourHeight={HOUR_HEIGHT}
                        />
                      </div>
                      </div>
                    </div>
                    </ErrorBoundary>
                  </m.div>
                )}
              </ViewPresence>
              </div>{/* end viewMode AnimatePresence wrapper */}
            </div>{/* end task content */}
            </m.div>
            </DayPresence>
            </div>{/* end activeDay AnimatePresence wrapper */}
            </div>{/* end unified section */}

          </m.div>
        )}

        {/* ── Plan Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 1 && (
          <m.div
            key="tab-plans"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
          <div className={selectedPlan ? "lg:mx-auto lg:max-w-4xl" : ""}>
          {selectedPlan ? (
            <ErrorBoundary section name="Plans">
            <PlanDetailView
              plan={selectedPlan}
              schedule={schedule}
              milestones={schedule.milestones ?? []}
              onDeletePlan={handleDeletePlan}
              onEditPlan={(planId) => setEditingPlanId(planId)}
              onAddTask={(planId) => openCreateSheet(planId)}
              onEditTask={(task) => openEditSheet(task)}
              onDeleteLinkedTask={handleDeleteLinkedTask}
              onAddTracker={(planId, title, unit, goalDirection, id, goalValue) => {
                setSchedule((prev) => ({
                  ...prev,
                  progressTrackers: [
                    ...prev.progressTrackers,
                    {
                      id: id ?? uid(),
                      planId,
                      title,
                      type: "number",
                      unit: unit || undefined,
                      goalDirection,
                      goalValue,
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
              ollamaUrl={ollamaUrl}
              ollamaModel={ollamaModel}
              onAddGeneratedTasks={handleAddGeneratedTasks}
              onLinkTrackerToMilestone={handleLinkTrackerToMilestone}
              onUpdateCoachMessages={handleUpdateCoachMessages}
            />
            </ErrorBoundary>
          ) : renderPlanList()}
          </div>
          </m.div>
        )}
        {/* ── Routine Tab ────────────────────────────────────────────────── */}
        {activeTab === 2 && (
          <m.div
            key="tab-routine"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ErrorBoundary section name="Routine">
            <RitualView
              rituals={schedule.rituals ?? []}
              ritualCompletions={schedule.ritualCompletions ?? []}
              onToggleComplete={handleToggleRitualComplete}
              onAdd={handleAddRitual}
              onUpdate={handleUpdateRitual}
              onDelete={handleDeleteRitual}
              onReorder={handleReorderRituals}
              addOpen={ritualAddOpen}
              onAddOpenChange={setRitualAddOpen}
              weekHistory={ritualWeekHistory}
            />
            </ErrorBoundary>
          </m.div>
        )}

        {/* ── Overview Tab ───────────────────────────────────────────────── */}
        {activeTab === 4 && (
          <m.div
            key="tab-overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ErrorBoundary section name="Dashboard">
            {iosSafeMode ? (
              <IOSSafeDashboard
                schedule={schedule}
                todayTasks={schedule.activities[todayKey] ?? []}
                plansById={plansById}
                authLabel={authLabel}
                onNavigate={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
                onToggleTask={(task) => handleToggleTaskComplete(task.id, taskEffectiveItemIds(task), todayKey, todayISO())}
                onToggleSubtask={(id, subtaskId) => handleToggleSubtask(id, subtaskId, todayKey, todayISO())}
                onOpenSubtasks={(task) => setSubtasksRef({ id: task.id, day: todayKey, dateISO: todayISO() })}
              />
            ) : (
              <OverviewDashboard
                schedule={schedule}
                todayKey={todayKey}
                onNavigate={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
                onMarkTaskDone={(id, subtaskIds) => handleToggleTaskComplete(id, subtaskIds, todayKey)}
                onMissedTask={(id, subtaskIds) => handleMarkTaskMissed(id, subtaskIds, todayKey)}
                onOpenSubtasks={(id) => setSubtasksRef({ id, day: todayKey, dateISO: todayISO() })}
                completedRitualIds={completedRitualIds}
                onLogTracker={(tracker) => setEntryTracker(tracker)}
              />
            )}
            </ErrorBoundary>
          </m.div>
        )}

        {/* ── Settings Tab ─────────────────────────────────────────────────── */}
        {activeTab === 5 && (
          <m.div
            key="tab-settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ErrorBoundary section name="AI">
              <SettingsView
                schedule={schedule}
                onClearData={clearData}
                onClearProgress={clearProgress}
                onRestoreData={restoreData}
                onUpdatePreferences={(patch) =>
                  setSchedule((prev) => ({
                    ...prev,
                    preferences: {
                      ...prev.preferences,
                      ...patch,
                    },
                  }))
                }
                onClose={() => setActiveTab(0)}
              />
            </ErrorBoundary>
          </m.div>
        )}

        </TabPresence>
      </div>
      )}

      {/* ── Edit Plan Bottom Sheet ─────────────────────────────────────────── */}
      {editingPlanId && (
        <EditPlanSheet
          planId={editingPlanId}
          plan={plansById.get(editingPlanId) ?? null}
          setSchedule={setSchedule}
          onClose={() => setEditingPlanId(null)}
        />
      )}
      {/* ── Add Plan Bottom Sheet ───────────────────────────────────────────── */}
      {addingPlan && (
        <AddPlanSheet
          open={addingPlan}
          onClose={() => setAddingPlan(false)}
          setSchedule={setSchedule}
        />
      )}

      {/* ── AI Plan Creator Sheet (hidden while AI is disabled) ────────────── */}
      {AI_ENABLED && !iosSafeMode && (
        <AIPlanCreatorSheet
          open={aiPlanCreating}
          onClose={() => setAiPlanCreating(false)}
          onCreatePlan={handleCreateAIPlan}
          ollamaUrl={ollamaUrl}
          ollamaModel={ollamaModel}
          existingPlans={schedule.plans.map((p) => ({ title: p.title, category: p.category, description: p.description }))}
        />
      )}

      {/* ── Bottom Nav (mobile only) ───────────────────────────────────────── */}
      {activeTab !== 6 && !showMobileTaskDetailPage && (
        <div className="lg:hidden">
          <BottomNav
            activeTab={activeTab}
            onTabChange={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
            onCreateTask={() => openCreateSheet()}
            onCreatePlan={openAddPlan}
            onCreateRitual={() => { setActiveTab(2); if (canAddRitual) setRitualAddOpen(true); }}
            onBulkImport={() => setBulkImportOpen(true)}
          />
        </div>
      )}

      {bulkImportOpen && (
        <BulkImportSheet
          open={bulkImportOpen}
          plans={schedule.plans}
          fallbackDay={activeDay}
          onClose={() => setBulkImportOpen(false)}
          onCommit={handleBulkImport}
        />
      )}


      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {taskSheetOpen && (
        <TaskSheet
          mode={taskSheetMode}
          task={taskSheetTask}
          plans={schedule.plans}
          activeDay={activeDay}
          activeDays={taskSheetActiveDays}
          isOpen={taskSheetOpen}
          initialPlanId={taskSheetPlanId}
          initialTaskType={taskSheetInitialType}
          initialStartTime={taskSheetInitialStartTime}
          initialEndTime={taskSheetInitialEndTime}
          occurrenceDateISO={taskSheetDateISO}
          canEditOccurrence={taskSheetMode === "edit" && !!taskSheetDateISO && taskSheetDateISO >= todayISO()}
          onResetOccurrence={
            taskSheetTask && taskSheetDateISO
              ? () => {
                  const id = taskSheetTask.id;
                  const label = new Date(taskSheetDateISO + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
                  setSchedule(clearTaskException(id, taskSheetDateISO));
                  closeTaskSheet();
                  setToastMessage(`Reset ${label} to default`);
                }
              : undefined
          }
          ollamaUrl={ollamaUrl}
          ollamaModel={ollamaModel}
          onClose={closeTaskSheet}
          onSave={handleTaskSheetSave}
          onDuplicate={(data) => {
            const newId = uid();
            const newTask: Task = { ...data.taskDraft, id: newId };
            const days = data.repeatDays.length > 0 ? data.repeatDays : [activeDay];
            setSchedule((prev) => ({
              ...prev,
              activities: days.reduce(
                (acc, day) => ({ ...acc, [day]: [...acc[day], newTask] }),
                { ...prev.activities }
              ),
            }));
            closeTaskSheet();
            setToastMessage("Task duplicated");
            setTimeout(() => openEditSheet(newTask), 350);
          }}
          onDelete={taskSheetMode === "edit" && taskSheetTask ? () => {
            const sourceDay = taskSheetActiveDays.includes(activeDay)
              ? activeDay
              : taskSheetActiveDays[0] ?? activeDay;
            const taskId = taskSheetTask.id;
            closeTaskSheet();
            requestDeleteTask(taskId, sourceDay);
          } : undefined}
        />
      )}

      {entryTracker && (
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
          metric={{ name: entryTracker.title, unit: entryTracker.unit ?? "" }}
        />
      )}

      {sessionTask && (
        <SessionSheet
          isOpen={!!sessionTask}
          task={sessionTask}
          linkedPlan={sessionLinkedPlan}
          onClose={() => setSessionTask(null)}
          onComplete={(taskId, allIds) => {
            handleToggleTaskComplete(taskId, allIds);
            setSessionTask(null);
          }}
          onEdit={() => {
            if (sessionTask) openEditSheet(sessionTask);
            setSessionTask(null);
          }}
        />
      )}

      {subtasksRef && isDesktopViewport && (
        <SubtasksSheet
          open={!!subtasksRef}
          task={subtasksDetailTask}
          linkedPlan={subtasksLinkedPlan}
          readOnly={!!subtasksRef && subtasksRef.dateISO !== todayISO()}
          onClose={() => setSubtasksRef(null)}
          onToggleSubtask={(taskId, subId) => handleToggleSubtask(taskId, subId, subtasksRef?.day, subtasksRef?.dateISO)}
          onToggleComplete={(taskId, ids) => handleToggleTaskComplete(taskId, ids, subtasksRef?.day, subtasksRef?.dateISO)}
          onMissed={(taskId, ids) => handleMarkTaskMissed(taskId, ids, subtasksRef?.day, subtasksRef?.dateISO)}
          onSnooze={(taskId) => handleSnoozeTaskLater(taskId, subtasksRef?.day, subtasksRef?.dateISO)}
          onSkip={(taskId) => handleSkipOccurrence(taskId, subtasksRef?.dateISO)}
          skipped={!!(subtasksRef && subtasksRawTask?.exceptions?.[subtasksRef.dateISO]?.skipped)}
          canSkip={!!subtasksRef && subtasksRef.dateISO >= todayISO()}
          onEdit={subtasksRawTask ? () => { openEditSheet(subtasksRawTask, subtasksRef?.dateISO); setSubtasksRef(null); } : undefined}
        />
      )}

      <ConfirmSheet
        open={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm ?? (() => {})}
        title={confirmState?.title ?? ""}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel}
      />

      <ConfirmSheet
        open={!!taskDeleteDetails}
        onClose={() => setTaskDeleteRequest(null)}
        onConfirm={() => performTaskDelete("day")}
        title={taskDeleteCopy?.title ?? ""}
        description={taskDeleteCopy?.description}
        confirmLabel={taskDeleteCopy?.confirmLabel}
        actions={taskDeleteDetails ? (
          taskDeleteDetails.activeDays.length > 1 ? (
            <div className="space-y-2.5">
              <Button
                type="button"
                variant="dangerSecondary"
                fullWidth
                onClick={() => performTaskDelete("day")}
              >
                Delete {deleteDayLabel(taskDeleteDetails.sourceDay)} only
              </Button>
              <Button
                type="button"
                variant="destructive"
                fullWidth
                onClick={() => performTaskDelete("all")}
              >
                Delete all occurrences
              </Button>
              <Button
                type="button"
                variant="ghost"
                fullWidth
                size="md"
                onClick={() => setTaskDeleteRequest(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setTaskDeleteRequest(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                fullWidth
                onClick={() => performTaskDelete("day")}
              >
                Delete task
              </Button>
            </div>
          )
        ) : undefined}
      />

      {/* ── Toast ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {toastMessage && (
          <m.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-28 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-neutral-800 bg-neutral-900 px-5 py-2.5 text-[14px] font-semibold text-white dark:border-white/[0.12] dark:bg-white dark:text-neutral-900 lg:bottom-6"
          >
            <span>{toastMessage}</span>
            {toastState?.actionLabel && toastState.onAction && (
              <button
                type="button"
                onClick={toastState.onAction}
                className="-mr-1 rounded-full bg-white/10 px-2.5 py-1 text-[13px] font-bold text-white transition-colors hover:bg-white/20 dark:bg-neutral-900/10 dark:text-neutral-900 dark:hover:bg-neutral-900/20"
              >
                {toastState.actionLabel}
              </button>
            )}
          </m.div>
        )}
      </AnimatePresence>
      </div>{/* end main scrollable column */}

      {/* ── AI Assistant — available on all tabs (hidden while AI is disabled) ── */}
      {AI_ENABLED && !iosSafeMode && (
        <ErrorBoundary section name="AI">
          <AIAssistant
            open={aiOpen}
            onClose={() => { setAiOpen(false); setAiInitialMessage(""); }}
            plans={schedule.plans}
            schedule={schedule}
            initialPlanId={selectedPlanId}
            ollamaUrl={ollamaUrl}
            ollamaModel={ollamaModel}
            onAddGeneratedTasks={handleAddGeneratedTasks}
            onApplyAction={handleApplyAction}
            onNavigateToPlan={(planId) => { setActiveTab(1); setSelectedPlanId(planId); setAiOpen(false); }}
          />
        </ErrorBoundary>
      )}

      {/* ── AI trigger button (floating, mobile + desktop) ────────────────── */}
      {AI_ENABLED && !iosSafeMode && (
        <AnimatePresence>
          {!aiOpen && (
            <m.button
              key="ai-fab"
              type="button"
              initial={{ opacity: 0, scale: 0.8, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 8 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setAiOpen(true)}
              aria-label="Open AI Assistant"
              className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-violet-500 bg-[#AD46FF] text-white lg:bottom-8 lg:right-8"
            >
              <IconSparkles size={20} strokeWidth={2} />
            </m.button>
          )}
        </AnimatePresence>
      )}

      {/* ── AI onboarding — shown once when app opens ─────────────────────── */}
      {AI_ENABLED && !iosSafeMode && <AIOnboarding />}

    </main>
  );
}
