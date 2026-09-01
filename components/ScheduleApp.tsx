"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import dynamic from "next/dynamic";
import AddEntryModal from "@/components/AddEntryModal";
import { quickAmountsForUnit } from "@/lib/quickAmounts";
import { sumEntriesForDate } from "@/lib/metricEntries";
import { completedRitualIdsOn } from "@/lib/consistency/ritualDayStatus";
import { ritualScheduledOnDate } from "@/lib/ritualRecurrence";
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
import type { AIActionResult, AIMilestone } from "@/lib/ai";
import type { AIProposal } from "@/lib/aiProposal";
import { recordProposalCreated, recordProposalRejected, recordProposalFailed, executeCreateTaskProposal } from "@/lib/proposalMutations";
import { buildPlanGoalFromNote } from "@/lib/notes/noteToGoal";
import { useAIEnabled } from "@/lib/ai/useAIEnabled";
import { useAIActions } from "@/lib/ai/useAIActions";
import { useCoachTour } from "@/lib/onboarding/useCoachTour";
import { TOUR_STEPS, type TourId } from "@/lib/onboarding/tours";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { CategoryDraft } from "@/components/category/CategorySheet";
import { useAuth } from "@/contexts/AuthProvider";
import SignInPrompt from "@/components/auth/SignInPrompt";
import { flushNow } from "@/lib/cloudSync";
import { bootLog, isIOSSafeMode, isStandalonePWA } from "@/lib/iosSafeMode";

// ── Deferred heavy components (separate JS chunks, loaded on demand) ──────────
const AIAssistant = dynamic(() => import("@/components/ai/AIAssistant"), { ssr: false });
const AIFab = dynamic(() => import("@/components/desktop/AIFab").then(m => ({ default: m.AIFab })), { ssr: false });
const TaskSheet = dynamic(() => import("@/components/task/TaskSheet").then(m => ({ default: m.TaskSheet })), { ssr: false });
const PlanDetailView = dynamic(() => import("@/components/plan/PlanDetailView"), { ssr: false });
const TrackingView = dynamic(() => import("@/components/tracking/TrackingView"), { ssr: false });
const AIPlanCreatorSheet = dynamic(() => import("@/components/plan/AIPlanCreatorSheet"), { ssr: false });
const SettingsSheet = dynamic(() => import("@/components/auth/SettingsSheet").then(m => ({ default: m.SettingsSheet })), { ssr: false });
const SettingsView = dynamic(() => import("@/components/SettingsView").then(m => ({ default: m.SettingsView })), { ssr: false });
const AIOnboarding = dynamic(() => import("@/components/ai/AIOnboarding"), { ssr: false });
const RoutineDetailView = dynamic(() => import("@/components/activity/RoutineDetailView"), { ssr: false });
const RitualSheet = dynamic(() => import("@/components/activity/RitualSheet").then((m) => ({ default: m.RitualSheet })), { ssr: false });
const AIView = dynamic(() => import("@/components/AIView").then(m => ({ default: m.AIView })), { ssr: false });
const CoachMarks = dynamic(() => import("@/components/onboarding/CoachMarks"), { ssr: false });
const NotesView = dynamic(() => import("@/components/notes/NotesView"), { ssr: false });
const TemplatesSheet = dynamic(() => import("@/components/TemplatesSheet").then(m => ({ default: m.TemplatesSheet })), { ssr: false });
const SessionSheet = dynamic(() => import("@/components/activity/SessionSheet"), { ssr: false });
const SubtasksSheet = dynamic(() => import("@/components/activity/SubtasksSheet"), { ssr: false });
const TaskDetailView = dynamic(() => import("@/components/activity/TaskDetailView"), { ssr: false });
const BulkImportSheet = dynamic(() => import("@/components/BulkImportSheet"), { ssr: false });
const AIReviewSheet = dynamic(() => import("@/components/ai/AIReviewSheet"), { ssr: false });
const DayWallpaperSheet = dynamic(() => import("@/components/DayWallpaperSheet"), { ssr: false });
const DayActionsSheet = dynamic(() => import("@/components/DayActionsSheet"), { ssr: false });
const RitualView = dynamic(() => import("@/components/activity/RitualView"), { ssr: false });
const OverviewDashboard = dynamic(() => import("@/components/OverviewDashboard"), { ssr: false });
const MissedTaskSheet = dynamic(() => import("@/components/MissedTaskSheet"), { ssr: false });
const TrackerQuickBar = dynamic(() => import("@/components/TrackerQuickBar"), { ssr: false });
import WhatNextCard from "@/components/WhatNextCard";
import type { MissedTask } from "@/lib/needsAttention";
import { rescheduleMissedTaskOnce, acknowledgeMiss } from "@/lib/missedRecovery";
import {
  useScheduleDB,
  DAYS,
  DAY_LABELS,
  DAY_FULL_LABELS,
  DayKey,
  MetricEntry,
  Milestone,
  Note,
  Plan,
  PlanCoachMessage,
  ProgressTracker,
  Ritual,
  Schedule,
  SummaryConfig,
  Task,
  TaskCategory,
  TaskSlot,
  TaskTypeValue,
  categoryFromIcon,
  resetStaleCompletions,
} from "@/lib/useScheduleDB";
import { useReminders } from "@/lib/useReminders";
import RitualOverlayLayer from "@/components/timeline/RitualOverlayLayer";
import RitualLegend from "@/components/timeline/RitualLegend";
import {
  resolveAccentColor,
  type AccentColor,
} from "@/lib/colorSystem";
import { taskIdentity, categoriesById } from "@/lib/taskIdentity";
import { canDeleteCategory, categoryForIcon, categoryUsageCounts, ensureCategoryIn } from "@/lib/taskCategories";
import { constrainTaskToPlanWindow } from "@/lib/planTaskWindow";
import { SECTION_ICONS } from "@/components/SectionIcons";
import {
  IconDotsVertical,
  IconChevronLeft,
  IconCalendar,
  IconCheck,
  IconChecklist,
  IconDeviceFloppy,
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
  IconTargetArrow,
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
  toggleTaskFromCheckbox,
  toggleSubtaskComplete,
  toggleSlotComplete,
  isTrackedTask,
  markTaskMissed,
  markSlotMissed,
  snoozeTaskLater,
  completionForDate,
  isTaskCompleted,
  isTaskResolved,
  resolveTaskState,
  resolveSlotState,
  getTaskCheckableItems,
  getTaskSubtaskSummary,
} from "@/lib/taskCompletion";
import {
  applyTaskDelete,
  createTask,
  createTaskDeleteSnapshot,
  uid,
  sortTasksByTime,
  updateTaskDays,
  updateTaskPerDay,
  swapDays,
  duplicateDay,
  clearDay,
  summarizeDayClear,
  setTaskException,
  clearTaskException,
  addSubtaskToTasks,
  createSubtask,
  getSlots,
  retimeSlot,
  moveTaskSlot,
  type TaskDeleteScope,
} from "@/lib/taskMutations";
import { resolvePlanTarget, resolveTaskTarget, describeTargetProblem } from "@/lib/ai/targets";
import { isTaskScheduledOn, occurrenceNote, resolveOccurrence, diffException } from "@/lib/taskOccurrence";
import type { AIGeneratedTask } from "@/lib/aiActions";
import { applyScheduleRules, validateDatedTasks } from "@/lib/scheduleRules";
import { resolveTimes as resolveParsedTimes } from "@/lib/scheduleParser";
import { applyTemplate } from "@/lib/templates";
import type { Template } from "@/lib/templates";
import { toggleRitualCompletion, appendRitualLog, undoLastRitualLog, toggleRitualStep, removeRitualLog } from "@/lib/ritualCompletions";
import { MAX_RITUALS } from "@/lib/ritualColors";
import { formatDisplayTime, parseTimeToMinutes, formatDuration } from "@/lib/timeUtils";
import { setRitualTime } from "@/lib/ritualMutations";
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
  CLICK_DEFAULT_DURATION,
} from "@/lib/timeline/dragTimeUtils";
import {
  buildTimelineGridMarks,
  getTimelineDisplayStartMinutes,
  mapMinutesToTimeline,
  TIMELINE_END_MINUTES,
} from "@/lib/timeline/displayWindow";
import { SCHEDULE_DAY_HANDOVER_MINUTES, taskContinuations } from "@/lib/timeline/overnight";
import { todayISO, daysBetween as daysBetweenUtil, formatDate, formatDayNoteLabel, addDaysToISO, localISODate } from "@/lib/dateUtils";
import { derivePlanStatus, getPlanCardStats, needsAttention } from "@/lib/planInsights";
import { MainTitleSection, IconActionButton, CtaActionButton } from "@/components/ui/MainTitleSection";
import ProgressBar from "@/components/ui/ProgressBar";
import { normalizeMilestoneTimeline, cascadeMilestoneDates, moveMilestone } from "@/lib/roadmapDates";
import AddPlanSheet from "@/components/plan/AddPlanSheet";
import EditPlanSheet from "@/components/plan/EditPlanSheet";
import GoalListSheet from "@/components/goal/GoalListSheet";
import { deleteGoal } from "@/lib/goalMutations";
import { haptic } from "@/lib/haptics";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";
import { resolveCustomVisibleDates } from "@/lib/customView";

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
  onToggleSlot,
  onOpenSubtasks,
}: {
  schedule: Schedule;
  todayTasks: Task[];
  plansById: Map<string, Plan>;
  authLabel: string;
  onNavigate: (tab: number) => void;
  onToggleTask: (task: Task) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onToggleSlot: (taskId: string, slotIndex: number) => void;
  onOpenSubtasks: (task: Task) => void;
}) {
  const trackedToday = todayTasks.filter(isTrackedTask);
  const done = trackedToday.filter((task) => {
    const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
    return isTaskCompleted(task, getTaskSubtaskSummary(task, linkedPlan).totalCount);
  }).length;
  const total = trackedToday.length;
  const plans = schedule.plans.length;
  const rituals = schedule.rituals?.length ?? 0;
  // Hoisted out of the task loop below — one Map per render, not per row.
  const categoryMap = useMemo(() => categoriesById(schedule.categories), [schedule.categories]);

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
                category={taskIdentity(task, categoryMap).category}
                onToggleComplete={() => onToggleTask(task)}
                onToggleSubtask={onToggleSubtask}
                onToggleSlot={onToggleSlot}
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
// A multi-slot task contributes one layout per slot, so each phase is its own
// positioned, independently-completable block.
interface TimelineTaskLayout {
  /**
   * "continuation" = the tail of *yesterday's* task, finishing on this day.
   * Derived and read-only: the task lives in the previous day's bucket, so
   * every mutation path is gated on this rather than on `isViewingToday`.
   */
  kind: "task" | "continuation";
  task: Task;
  /** The specific time block this layout renders. */
  slot: TaskSlot;
  slotIndex: number;
  /** True when the parent task has >1 slot (drives per-slot completion + retiming). */
  isMultiSlot: boolean;
  start: number;
  end: number;
  /** Squared-off edge where the day boundary cuts an overnight block. */
  edgeCut?: "top" | "bottom";
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
  category,
  isBeingMoved,
  isViewingToday,
  onPointerDown,
  onToggle,
  onOpenSubtasks,
}: {
  layout: TimelineTaskLayout;
  plan: Plan | null;
  category: TaskCategory | null;
  isBeingMoved: boolean;
  isViewingToday: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>, task: Task, start: number, end: number, slotIndex: number) => void;
  onToggle: (task: Task, slotIndex: number, isMultiSlot: boolean) => void;
  onOpenSubtasks: (task: Task) => void;
}) {
  const cardSize = computeCardSize(layout.height, layout.laneCount);
  // A continuation belongs to the previous day's bucket, so it is inert even
  // when the day on screen is today: dragging it would retime yesterday, and
  // completing it would write today's date onto yesterday's task.
  const isContinuation = layout.kind === "continuation";
  const interactive = isViewingToday && !isContinuation;
  // A phase of a multi-slot task completes on its own; a single-slot task keeps
  // the whole-task state (which folds in subtask progress).
  const state = layout.isMultiSlot
    ? layout.task.missed
      ? "missed"
      : (layout.task.completedSlotIndices ?? []).includes(layout.slotIndex)
      ? "completed"
      : "incomplete"
    : resolveTaskState(layout.task, getTaskSubtaskSummary(layout.task, plan).totalCount);
  return (
    <div
      data-task-block
      className={`absolute min-w-0 px-0.5 py-[2px] animate-panel-in touch-pan-y transition-opacity ${
        isBeingMoved ? "opacity-25 pointer-events-none" : ""
      }`}
      style={{ ...taskLaneStyle(layout), willChange: isBeingMoved ? "opacity" : undefined }}
      onPointerDown={interactive ? (e) => onPointerDown(e, layout.task, layout.start, layout.end, layout.slotIndex) : undefined}
    >
      <div className="relative h-full min-h-[20px]">
        <TaskBlockCard
          variant="grid"
          task={layout.task}
          plan={plan}
          category={category}
          state={state}
          duration={formatTaskDuration(layout.slot.startTime, layout.slot.endTime)}
          slotOverride={layout.isMultiSlot ? layout.slot : undefined}
          readOnly={!interactive}
          edgeCut={layout.edgeCut}
          minimal={cardSize === "xsmall"}
          compact={cardSize === "small" || cardSize === "medium"}
          narrow={cardSize === "small"}
          onToggle={() => { if (interactive) onToggle(layout.task, layout.slotIndex, layout.isMultiSlot); }}
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
        // Commitments never count. Existing occurrence behaviour is otherwise
        // untouched, so no pre-existing number shifts.
        const tasks = (schedule.activities[day] ?? []).filter(isTrackedTask).map((task) =>
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
  /** The dated occurrence the user deleted from, when the surface knows one.
   *  Absent means the "this date only" option isn't offered. */
  dateISO?: string;
};

/**
 * Turns AI-suggested milestones into real Milestone records for a plan (fresh
 * `id`, `upcoming`/`pending` status, sortOrder appended after any existing
 * ones). Callers still run the result through `normalizeMilestoneTimeline` —
 * this only builds the raw entries, matching the shape both the AI-plan-create
 * flow and the Coach's `suggest_milestones` flow need identically.
 */
function buildMilestonesFromAI(
  aiMilestones: AIMilestone[],
  planId: string,
  existingCount: number,
): Milestone[] {
  const now = new Date().toISOString();
  const today = todayISO();
  return aiMilestones.map((m, i) => ({
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
    sortOrder: existingCount + i,
  }));
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ScheduleApp() {
  const iosSafeMode = isIOSSafeMode();
  bootLog("APP_BOOT_START");
  if (iosSafeMode) {
    bootLog("IOS_SAFE_MODE_ENABLED");
    void isStandalonePWA();
  }
  const { user, isGuest, authLoading } = useAuth();
  const { schedule, setSchedule, ready, clearData, clearProgress, restoreData, isFirstLaunch, undo } = useScheduleDB();
  const { available: aiAvailable } = useAIActions();
  const aiEnabled = useAIEnabled();
  useReminders(schedule, ready);
  const [todayKey, setTodayKey] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [editMode, setEditMode] = useState(false);
  /**
   * The tab the user explicitly chose, or null while they haven't chosen one.
   *
   * `activeTab` is derived from it rather than being seeded to 0 and corrected
   * by an effect. An effect runs *after* the first render, so first launch used
   * to mount the planner and then switch, showing a flash of the wrong screen
   * before the getting-started guide. Deriving it means the first tab mounted
   * is already the correct one.
   */
  const [tabSelection, setTabSelection] = useState<number | null>(null);
  // iOS safe mode always opens on Overview; so does a true first launch (no
  // stored data), once the DB has actually reported back.
  const activeTab = tabSelection ?? (iosSafeMode || (ready && isFirstLaunch) ? 4 : 0);
  const setActiveTab = useCallback((tab: number) => setTabSelection(tab), []);

  // Turning AI off while the AI tab is open would leave the content area empty,
  // since every tab-7 branch is gated on `aiEnabled`. Fall back to Settings —
  // which is where the switch that got us here lives.
  useEffect(() => {
    if (!aiEnabled && activeTab === 7) setActiveTab(5);
  }, [aiEnabled, activeTab, setActiveTab]);

  // A short, skippable coach-mark tour per tab — re-evaluated whenever the
  // active tab changes, so switching to a not-yet-seen tab picks its tour up
  // automatically (useCoachTour's own effect keys off `id`). Overview and
  // Settings intentionally have no entry in TOUR_STEPS — see lib/onboarding/tours.ts.
  const activeTourId: TourId | null =
    activeTab === 0 ? "today" : activeTab === 1 ? "plans" : activeTab === 2 ? "routine" : activeTab === 8 ? "tracking" : null;
  const tour = useCoachTour(activeTourId ?? "none", {
    enabled: activeTourId !== null && !iosSafeMode && ready,
    delayMs: 1200,
  });
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

  const [taskSheetInitialType, setTaskSheetInitialType] = useState<TaskTypeValue>("task");
  const [taskSheetInitialStartTime, setTaskSheetInitialStartTime] = useState("");
  const [taskSheetInitialEndTime, setTaskSheetInitialEndTime] = useState("");

  // ── Timeline drag-create state (ghost block during empty-area drag) ──────────
  const [dragCreate, setDragCreate] = useState<{ startMin: number; endMin: number } | null>(null);
  // ── Timeline drag-move state (preview block during task long-press drag) ─────
  const [dragMove, setDragMove] = useState<{
    taskId: string;
    /** Which phase of a multi-slot task is being dragged. */
    slotIndex: number;
    durationMin: number;
    previewStartMin: number;
  } | null>(null);

  const [addingPlan, setAddingPlan] = useState(false);
  const [goalsSheetOpen, setGoalsSheetOpen] = useState(false);
  const [aiPlanCreating, setAiPlanCreating] = useState(false);
  // Set when AIPlanCreatorSheet was opened from a note's "Turn into plan"
  // button (see handleTurnNoteIntoPlan) rather than the manual "Generate
  // Plan" entry point — carries which note to link once the plan is created.
  const [notePlanSeed, setNotePlanSeed] = useState<{ noteId: string; goal: string } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInitialMessage, setAiInitialMessage] = useState("");

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [dayActionsOpen, setDayActionsOpen] = useState(false);
  /** The weekday awaiting a "clear day" confirmation, or null. */
  const [dayClearRequest, setDayClearRequest] = useState<DayKey | null>(null);
  const [missedSheet, setMissedSheet] = useState<MissedTask | null>(null);
  // Today (narrow) header: reveal editing chrome (day actions, wallpaper) only
  // in edit mode, matching the iOS shell's clean-by-default execution surface.
  const [todayEditMode, setTodayEditMode] = useState(false);
  const [savingTimeline, setSavingTimeline] = useState(false);
  const [sessionTask, setSessionTask] = useState<Task | null>(null);
  // Task whose subtasks are shown in the bottom sheet — stored by id+day so the
  // sheet always reflects the live task (completion updates create new objects).
  const [subtasksRef, setSubtasksRef] = useState<{ id: string; day: DayKey; dateISO: string } | null>(null);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [pendingAIAction, setPendingAIAction] = useState<AIActionResult | null>(null);
  // trackingType-aware: a quantity routine is "done" only once its logs reach
  // the target, not on the first partial log. Shared with the Routine tab so
  // the two screens can never disagree about the same routine.
  const completedRitualIds = useMemo(
    () => completedRitualIdsOn(schedule.rituals ?? [], schedule.ritualCompletions ?? [], todayISO()),
    [schedule.rituals, schedule.ritualCompletions, todayKey]
  );
  const [ritualAddOpen, setRitualAddOpen] = useState(false);
  const [detailRitualId, setDetailRitualId] = useState<string | null>(null);
  const [editRitualId, setEditRitualId] = useState<string | null>(null);
  const detailRitual = detailRitualId ? (schedule.rituals ?? []).find((r) => r.id === detailRitualId) ?? null : null;
  const editingRitual = editRitualId ? (schedule.rituals ?? []).find((r) => r.id === editRitualId) ?? null : null;
  const canAddRitual = (schedule.rituals ?? []).length < MAX_RITUALS;
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [taskDeleteRequest, setTaskDeleteRequest] = useState<TaskDeleteRequest | null>(null);

  function openConfirm(
    copy: { title: string; description: string; confirmLabel?: string },
    fn: () => void,
  ) {
    setConfirmState({ ...copy, onConfirm: fn });
  }

  function setToastMessage(next: string | ToastState | null) {
    setToastState(typeof next === "string" ? { message: next } : next);
  }

  // Explicit "Save" for the timeline. Edits already auto-save locally; this
  // force-flushes to the cloud and confirms, for reassurance after a batch of
  // drag edits. For guests flushNow() is a no-op, so we confirm the local write.
  async function handleTimelineSave() {
    if (savingTimeline) return;
    haptic("light");
    setSavingTimeline(true);
    try {
      await flushNow(scheduleRef.current);
      setToastMessage(isGuest ? "Saved on this device" : "Saved & synced");
    } catch {
      setToastMessage("Saved locally — cloud sync will retry");
    } finally {
      setSavingTimeline(false);
    }
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
    slotIndex: number;
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
    // stamp: false — this is deterministic housekeeping both devices compute
    // identically from the date. Recording it as an edit would let a device
    // that was merely left open outrank one that actually did work.
    setSchedule((prev) => resetStaleCompletions(prev, todayISO()), { stamp: false });
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
      setActiveTab(8); // Tracking — the page built for exactly this
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
    toggleTask: (task: Task, slotIndex?: number, isMultiSlot?: boolean) => void;
    setDragCreate: React.Dispatch<React.SetStateAction<{ startMin: number; endMin: number } | null>>;
    setDragMove: React.Dispatch<React.SetStateAction<{ taskId: string; slotIndex: number; durationMin: number; previewStartMin: number } | null>>;
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
    const startMin = dragHelpersRef.current.snapAndClamp(
      dragHelpersRef.current.gridClientYToMinutes(e.clientY),
    );
    createDragRef.current = {
      dragging: false,
      startClientY: e.clientY,
      startMin,
      pointerId: e.pointerId,
      lastEndMin: Math.min(startMin + CLICK_DEFAULT_DURATION, timelineEndMinutes),
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
    slotIndex = 0,
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
      slotIndex,
      task,
      durationMin,
      grabOffsetMin,
      longPressTimer: setTimeout(() => {
        if (!moveDragRef.current || moveDragRef.current.taskId !== task.id) return;
        moveDragRef.current.dragging = true;
        haptic("medium");
        dragHelpersRef.current.setDragMove({ taskId: task.id, slotIndex, durationMin, previewStartMin: layoutStart });
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
        const { startMin, lastEndMin } = createDragRef.current;
        createDragRef.current = null;
        clearPendingDragFrame();
        h.setDragCreate(null);
        // A tap commits just like a drag — lastEndMin is seeded with the click
        // default and overwritten by onPointerMove once a drag starts. Not
        // gated on isViewingToday: openCreateSheetWithTime targets activeDay,
        // so tapping an empty slot on any day creates it on that day.
        h.openCreateSheetWithTime(startMin, lastEndMin);
        return;
      }

      // Drag-move commit
      if (moveDragRef.current && moveDragRef.current.pointerId === e.pointerId) {
        const { longPressTimer, dragging, currentPreviewStartMin, durationMin, task, isCheckbox, slotIndex } =
          moveDragRef.current;
        if (longPressTimer) clearTimeout(longPressTimer);
        moveDragRef.current = null;
        clearPendingDragFrame();
        if (!dragging) {
          h.setDragMove(null);
          // Tap on the card body marks the task done (mobile timeline). Taps on
          // the checkbox / subtasks pill run their own handlers (isCheckbox =
          // any aria-labeled control), so they're skipped here to avoid double-firing.
          if (!isCheckbox) h.toggleTask(task, slotIndex, getSlots(task).length > 1);
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
              // retimeSlot moves only the dragged phase and re-applies the slot
              // invariant, so dragging one block of a multi-slot task can't
              // clobber its siblings.
              [day]: (acts[day] ?? []).map((t: Task) =>
                t.id !== task.id ? t : retimeSlot(t, slotIndex, newStartTime, newEndTime),
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
    if (dateISO) {
      setActiveDay(JS_DAYS[new Date(`${dateISO}T00:00:00`).getDay()] as DayKey);
    }
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
    const linkedPlan = schedule.plans.find((plan) => plan.id === data.taskDraft.planId);
    const taskDraft =
      linkedPlan?.startDate && (!data.taskDraft.activeFrom || data.taskDraft.activeFrom < linkedPlan.startDate)
        ? { ...data.taskDraft, activeFrom: linkedPlan.startDate }
        : data.taskDraft;

    // "This day only" — write a minimal per-date override instead of editing the
    // recurring template across every weekday copy.
    if (data.taskId && data.scope === "occurrence" && taskSheetDateISO && taskSheetTask) {
      const diff = diffException(taskSheetTask, {
        title: taskDraft.title,
        startTime: taskDraft.startTime,
        endTime: taskDraft.endTime,
        description: taskDraft.description,
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
      // Edit mode — custom-per-day writes each weekday its own slots.
      if (data.perDaySlots) {
        setSchedule(updateTaskPerDay(data.taskId, taskDraft, data.perDaySlots, data.repeatDays, data.planItems));
      } else {
        setSchedule(updateTaskDays(data.taskId, taskDraft, data.repeatDays, data.planItems));
      }
    } else {
      // Create mode
      setSchedule(createTask(taskDraft, data.repeatDays, data.planItems));
    }
    closeTaskSheet();
  }

  function requestDeleteTask(taskId: string, sourceDay: DayKey = activeDay, dateISO?: string) {
    haptic("light");
    setTaskDeleteRequest({ taskId, sourceDay, dateISO });
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
          // Tapping the checkbox of a "missed" task clears it back to incomplete
          // (un-miss) rather than completing it. The branch lives in
          // toggleTaskFromCheckbox so the iOS shell cannot drift from it again.
          [day]: (prev.activities[day] ?? []).map((t) =>
            t.id === taskId ? { ...t, ...toggleTaskFromCheckbox(t, allSubtaskIds) } : t
          ),
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
      setToastMessage(`Moved to ${formatDisplayTime(patch.startTime)}`);
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

  /**
   * Write (or clear) a note about one date's occurrence.
   *
   * Goes to `TaskException.note`, deliberately not `.description` — that one is
   * an override and would hide the task's standing description for the day.
   * `setTaskException` prunes empty strings, so clearing removes the key and,
   * if nothing else is set for that date, the whole exception.
   */
  const handleSaveDayNote = useCallback(
    (taskId: string, note: string, dateISO?: string) => {
      haptic("light");
      setSchedule(setTaskException(taskId, dateISO ?? todayISO(), { note }));
    },
    [setSchedule]
  );

  /**
   * Drop a routine at a new time.
   *
   * A routine has no per-date position, so this moves it on every day it
   * recurs — the toast says so, because the gesture happens in one column and
   * the consequence is not confined to it.
   */
  const handleMoveRitual = useCallback(
    (ritualId: string, stepId: string | undefined, nextTime: string) => {
      const ritual = (schedule.rituals ?? []).find((r) => r.id === ritualId);
      if (!ritual) return;
      haptic("medium");
      setSchedule(setRitualTime(ritualId, stepId, nextTime));
      setToastMessage({
        message: `${ritual.title} moved to ${formatDisplayTime(nextTime)} on every day it repeats`,
        actionLabel: "Undo",
        onAction: () => { undo(); setToastMessage(null); haptic("light"); },
      });
    },
    [schedule.rituals, setSchedule, undo],
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

  // Independent completion for one phase of a multi-slot task (same-day
  // multiple time blocks) — mirrors handleToggleSubtask, keyed by slot index.
  const handleToggleSlot = useCallback(
    (taskId: string, slotIndex: number, day: DayKey = activeDay, dateISO?: string) => {
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
            return { ...t, ...toggleSlotComplete(t, slotIndex, totalSubtasks) };
          }),
        },
      }));
    },
    [activeDay, setSchedule]
  );

  /** The per-phase analogue of handleMarkTaskMissed — marks just ONE occurrence
   *  of a repeated-same-day task missed, independent of its other blocks that
   *  day. Mirrors handleToggleSlot's shape, keyed by slot index. */
  const handleMarkSlotMissed = useCallback(
    (taskId: string, slotIndex: number, day: DayKey = activeDay, dateISO?: string) => {
      if (dateISO && dateISO !== todayISO()) return; // only today is editable
      haptic("medium");
      setSchedule((prev) => ({
        ...prev,
        activities: {
          ...prev.activities,
          [day]: (prev.activities[day] ?? []).map((t) =>
            t.id === taskId ? { ...t, ...markSlotMissed(t, slotIndex) } : t
          ),
        },
      }));
    },
    [activeDay, setSchedule]
  );

  /** WeekGrid block hover-icon → opens the same MissedTaskSheet Overview's
   *  Needs Attention card already opens (setMissedSheet), just from a second
   *  entry point on the timeline itself. */
  const handleOpenMissedRecovery = useCallback(
    ({ task, plan, dateISO }: { task: Task; plan: Plan | null; dateISO: string }) => {
      setMissedSheet({ task, plan, dateISO, daysAgo: daysBetween(dateISO, todayISO()) ?? 1 });
    },
    []
  );

  /** Cmd/Ctrl-drag reschedule/relocate from WeekGrid — any column, any day
   *  (only a continuation block is excluded; WeekGrid enforces that). Same-day
   *  drags and cross-day moves both edit the recurring template; a cross-day
   *  drop also clears any stale per-date exception on the target date so it
   *  can't silently override the just-dropped time on next render. Composed
   *  into one setSchedule call so the whole gesture is a single undo step. */
  const handleMoveTask = useCallback(
    (
      taskId: string,
      sourceDay: DayKey,
      slotIndex: number,
      targetDay: DayKey,
      targetDateISO: string,
      startTime: string,
      endTime: string,
    ) => {
      setSchedule((prev) => {
        const afterMove = moveTaskSlot(taskId, sourceDay, slotIndex, targetDay, targetDateISO, startTime, endTime)(prev);
        return clearTaskException(taskId, targetDateISO)(afterMove);
      });
    },
    [setSchedule]
  );

  function handleBulkImport(result: import("@/lib/scheduleParser").ParseResult) {
    // A dated task belongs to one occurrence, not to every matching weekday —
    // week 1's Thursday and week 2's Thursday are different sessions with
    // different checklists. Those are validated against the day they actually
    // land on before anything is written: the weekday-scoped `applyScheduleRules`
    // would read twelve Thursdays as twelve collisions and stack them.
    const dated = result.days.flatMap((d) =>
      d.tasks
        .filter((t) => t.dateISO)
        .map((t) => {
          const { startTime, endTime } = resolveParsedTimes(t);
          return { title: t.title, dateISO: t.dateISO!, startTime, endTime, taskId: t.id };
        }),
    );

    let blocked = new Set<string>();
    let firstConflict: string | null = null;
    if (dated.length > 0) {
      const { conflicts } = validateDatedTasks(dated, (dateISO, weekday) =>
        (schedule.activities[weekday] ?? [])
          .filter((task) => isTaskScheduledOn(task, dateISO, true, schedule.preferences?.startDate))
          .flatMap((task) => getSlots(task).map((s) => ({ title: task.title, ...s }))),
      );
      blocked = new Set(conflicts.map((c) => c.task.taskId));
      if (conflicts.length > 0) {
        const c = conflicts[0].conflict;
        firstConflict =
          conflicts.length === 1
            ? `Skipped "${c.taskTitle}" — it clashes with ${c.conflictsWith} on ${c.dateISO}.`
            : `Skipped ${conflicts.length} sessions that clash with existing tasks.`;
      }
    }

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
      const categoryDraft = [...prev.categories];
      for (const d of result.days) {
        const created: Task[] = d.tasks
          .filter((t) => !blocked.has(t.id))
          .map((t) => {
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
              categoryId: ensureCategoryIn(categoryDraft, t.icon),
              planId: plan?.id ?? "",
              ...(subtasks !== undefined ? { subtasks } : {}),
              // A single dated occurrence rather than a weekly repeat. Required,
              // not stylistic: `TaskException` carries no subtasks field, so one
              // recurring task cannot hold a different checklist per week.
              ...(t.dateISO ? { recurrence: { type: "once" as const, dateISO: t.dateISO } } : {}),
            };
          });
        activities[d.day] = sortTasksByTime([...(activities[d.day] ?? []), ...created]);
      }
      return { ...prev, plans: [...prev.plans, ...newPlans], categories: categoryDraft, activities };
    });
    const imported = result.days.reduce(
      (n, d) => n + d.tasks.filter((t) => !blocked.has(t.id)).length,
      0,
    );
    setToastMessage(
      firstConflict
        ? `Imported ${imported}. ${firstConflict}`
        : result.plans.length > 0
        ? "Plan & tasks imported"
        : "Tasks imported",
    );
  }

  function handleAddRitual(data: Omit<Ritual, "id">) {
    setSchedule((prev) => ({
      ...prev,
      rituals: [...(prev.rituals ?? []), { ...data, id: uid() }],
    }));
  }

  function openCreateRitual() {
    setActiveTab(2);
    if (canAddRitual) {
      setRitualAddOpen(true);
    } else {
      setToastMessage(`You can have up to ${MAX_RITUALS} routines`);
    }
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
      const categoryDraft = [...prev.categories];
      const newTaskIds: string[] = [];
      for (const t of valid) {
        const taskId = uid();
        newTaskIds.push(taskId);
        const task: Task = {
          id: taskId,
          title: t.title,
          startTime: t.startTime,
          endTime: t.endTime,
          categoryId: ensureCategoryIn(categoryDraft, t.icon || plan.emoji),
          planId,
          ...constrainTaskToPlanWindow({}, plan),
          taskType: t.taskType,
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
      return { ...prev, categories: categoryDraft, activities: updatedActivities, milestones: updatedMilestones };
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

  // The inverse of handleLinkTrackerToMilestone — removes the relationship
  // only. The tracker itself, and every entry logged against it, are untouched.
  function handleUnlinkTrackerFromMilestone(milestoneId: string, trackerId: string) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (prev.milestones ?? []).map((m) =>
        m.id === milestoneId
          ? { ...m, linkedTrackers: (m.linkedTrackers ?? []).filter((id) => id !== trackerId) }
          : m
      ),
    }));
  }

  // The task-linking analogue of the two tracker handlers above.
  function handleLinkTaskToMilestone(milestoneId: string, taskId: string) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (prev.milestones ?? []).map((m) =>
        m.id === milestoneId
          ? { ...m, linkedActivities: [...new Set([...(m.linkedActivities ?? []), taskId])] }
          : m
      ),
    }));
  }

  function handleUnlinkTaskFromMilestone(milestoneId: string, taskId: string) {
    setSchedule((prev) => ({
      ...prev,
      milestones: (prev.milestones ?? []).map((m) =>
        m.id === milestoneId
          ? { ...m, linkedActivities: (m.linkedActivities ?? []).filter((id) => id !== taskId) }
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

  function handleDeleteGoal(goalId: string) {
    const goal = schedule.goals?.find((g) => g.id === goalId);
    openConfirm(
      buildDeleteConfirmationCopy("goal", {
        name: goal?.title,
        description: "Linked plans are kept — they'll just no longer be tied to this goal.",
      }),
      () => setSchedule((prev) => deleteGoal(prev, goalId))
    );
  }

  /**
   * Copy for the clear-day confirmation.
   *
   * Names the weekday, never the date, because this empties every Monday
   * rather than the column that was clicked — and names what is actually being
   * destroyed, since a day holding completed work is a different loss from an
   * empty plan. Same rule the multi-scope task delete follows: once more than
   * one outcome is possible, the copy stops asserting a single one.
   */
  const dayClearCopy = useMemo(() => {
    if (!dayClearRequest) return null;
    const label = DAY_FULL_LABELS[dayClearRequest];
    const s = summarizeDayClear(schedule, dayClearRequest);
    const parts: string[] = [
      `This deletes ${s.total} ${s.total === 1 ? "task" : "tasks"} from every ${label}, for good.`,
    ];
    const resolved = s.completed + s.missed;
    if (resolved > 0) {
      parts.push(
        `${resolved} of them ${resolved === 1 ? "has" : "have"} a completion record that goes too.`,
      );
    }
    if (s.alsoOnOtherDays > 0) {
      parts.push(`${s.alsoOnOtherDays} also ${s.alsoOnOtherDays === 1 ? "runs" : "run"} on other days and will stay there.`);
    }
    return {
      title: `Clear every ${label}?`,
      description: parts.join(" "),
      confirmLabel: "Clear day",
    };
  }, [dayClearRequest, schedule]);

  function performDayClear() {
    if (!dayClearRequest) return;
    const label = DAY_FULL_LABELS[dayClearRequest];
    const { total } = summarizeDayClear(schedule, dayClearRequest);
    setSchedule(clearDay(dayClearRequest));
    setDayClearRequest(null);
    haptic("medium");
    // Routes through the general undo stack, which the setSchedule above has
    // already pushed to — one entry, because clearDay is a single updater.
    setToastMessage({
      message: `Cleared ${total} ${total === 1 ? "task" : "tasks"} from ${label}`,
      actionLabel: "Undo",
      onAction: () => { undo(); setToastMessage(null); haptic("light"); },
    });
  }

  function handleAddEntry(entry: Omit<MetricEntry, "id">) {
    setSchedule((prev) => ({
      ...prev,
      metricEntries: [...prev.metricEntries, { ...entry, id: uid() }],
    }));
  }

  /**
   * One-tap increment from the Tracking page. An increment is just another
   * entry on today's date — multiple entries per (tracker, date) are already
   * legal, which is exactly why `sumEntriesForDate` exists — so this needs no
   * new storage shape, only the today's-date convenience over handleAddEntry.
   */
  const handleLogTrackerAmount = useCallback((trackerId: string, planId: string, value: number) => {
    setSchedule((prev) => ({
      ...prev,
      metricEntries: [...prev.metricEntries, { id: uid(), planId, trackerId, value, date: todayISO() }],
    }));
  }, [setSchedule]);

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
    const planStartDate = data.startDate || schedule.preferences?.startDate;
    const plan: Plan = {
      id: planId,
      title: data.title,
      description: data.description || undefined,
      startDate: planStartDate,
      endDate: data.endDate || undefined,
      category: categoryFromIcon(data.emoji),
      emoji: data.emoji,
      color: resolveAccentColor(data.color, data.emoji),
      items: [],
      metaFields: [],
      summary: [],
    };
    // AI-created plans use the same validation, de-duplication, and overlap
    // resolution path as tasks generated for an existing plan.
    const { valid: scheduledTasks, conflicts } = applyScheduleRules(data.tasks, schedule.activities);
    if (conflicts.length > 0) {
      const adjusted = conflicts.map((c) => `"${c.taskTitle}" moved to ${c.adjustedStart}`).join(", ");
      setToastMessage(`Adjusted ${conflicts.length} task${conflicts.length > 1 ? "s" : ""} to avoid overlaps: ${adjusted}`);
    }
    setSchedule((prev) => {
      const updatedActivities = { ...prev.activities };
      const categoryDraft = [...prev.categories];
      for (const t of scheduledTasks) {
        const task: Task = {
          id: uid(),
          title: t.title,
          startTime: t.startTime,
          endTime: t.endTime,
          categoryId: ensureCategoryIn(categoryDraft, t.icon || plan.emoji),
          planId,
          activeFrom: plan.startDate,
          taskType: t.taskType,
          subtasks: (t.subtasks ?? []).map((s) => ({ id: uid(), task: s })),
        };
        const day = t.day as DayKey;
        updatedActivities[day] = [...(updatedActivities[day] ?? []), task];
      }
      const newMilestones = data.milestones?.length
        ? normalizeMilestoneTimeline(buildMilestonesFromAI(data.milestones, planId, 0), plan.startDate)
        : [];
      return {
        ...prev,
        plans: [...prev.plans, plan],
        categories: categoryDraft,
        activities: updatedActivities,
        milestones: [...(prev.milestones ?? []), ...newMilestones],
      };
    });
    setSelectedPlanId(planId);
    return planId;
  }

  function handleCreateAIPlan(data: import("@/components/plan/AIPlanCreatorSheet").AIPlanCreatorData) {
    const planId = createPlanFromAIAction(data);
    // Note → Plan (AI): link the originating note to what it generated, the
    // same way "Create task from note" already links a note to a task —
    // Note.linkedPlanIds, resolved directly, no task lookup needed.
    if (notePlanSeed) {
      const { noteId } = notePlanSeed;
      setSchedule((prev) => ({
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === noteId
            ? { ...n, linkedPlanIds: Array.from(new Set([...(n.linkedPlanIds ?? []), planId])), updatedAt: new Date().toISOString() }
            : n
        ),
      }));
      setNotePlanSeed(null);
    }
    setAiPlanCreating(false);
  }

  function handleTurnNoteIntoPlan(note: Note) {
    setNotePlanSeed({ noteId: note.id, goal: buildPlanGoalFromNote(note) });
    setAiPlanCreating(true);
  }

  /**
   * The gate every AI write passes through.
   *
   * Both chat surfaces call this — AIPanel only previews and delegates here — so
   * gating at this one point covers them both. Nothing reaches the schedule
   * until the review sheet confirms the target and the required fields, which is
   * what stops a confidently wrong response becoming a silent edit.
   */
  function handleApplyAction(action: AIActionResult) {
    // A question is not a change; the chat renders it and there is nothing to
    // review or apply.
    if (action.type === "ask_clarification") return;
    setPendingAIAction(action);
  }

  function applyReviewedAction(action: AIActionResult) {
    if (action.type === "create_plan") {
      createPlanFromAIAction({
        title: action.payload.title,
        description: action.payload.description,
        emoji: action.payload.emoji,
        color: action.payload.color,
        startDate: action.payload.startDate,
        endDate: action.payload.endDate,
        tasks: action.payload.tasks ?? [],
        milestones: action.payload.milestones ?? [],
      });
      setToastMessage(`Created plan "${action.payload.title}"`);
      return;
    }

    if (action.type === "create_ritual") {
      const { trackingType, target, unit, steps } = action.payload;
      const ritual: Ritual = {
        id: uid(),
        title: action.payload.title,
        time: action.payload.time,
        duration: action.payload.duration,
        repeatDays: action.payload.repeatDays,
        color: action.payload.color,
        sortOrder: (schedule.rituals ?? []).length,
        // Only set when the model asked for a measured routine — an absent
        // trackingType is a plain checkbox habit, which stays the default.
        ...(trackingType ? { trackingType } : {}),
        ...(target !== undefined ? { target } : {}),
        ...(unit ? { unit } : {}),
        ...(steps?.length ? { steps: steps.map((label) => ({ id: uid(), label })) } : {}),
      };
      setSchedule((prev) => ({
        ...prev,
        rituals: [...(prev.rituals ?? []), ritual],
      }));
      setActiveTab(2);
      setToastMessage(`Added ritual "${action.payload.title}"`);
      return;
    }

    if (action.type === "suggest_milestones") {
      const milestones = action.payload.milestones;
      if (!milestones.length) return;
      // Resolve, or say so. This used to fall through to `schedule.plans[0]`,
      // so milestones for a plan the model misnamed landed on an unrelated one
      // with no warning.
      const planTarget = resolvePlanTarget(schedule.plans, action.payload.planTitle);
      if (planTarget.status !== "resolved") {
        setToastMessage(describeTargetProblem(planTarget, "plan") ?? "Which plan should these go to?");
        return;
      }
      const planId = planTarget.value.id;
      setSchedule((prev) => {
        const plan = prev.plans.find((p) => p.id === planId);
        const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== planId);
        const existing = (prev.milestones ?? []).filter((m) => m.planId === planId);
        const newMilestones = buildMilestonesFromAI(milestones, planId, existing.length);
        return {
          ...prev,
          milestones: [
            ...otherMilestones,
            ...normalizeMilestoneTimeline([...existing, ...newMilestones], plan?.startDate),
          ],
        };
      });
      setToastMessage(`Added ${milestones.length} milestone${milestones.length > 1 ? "s" : ""} to "${planTarget.value.title}"`);
      setActiveTab(1);
      setSelectedPlanId(planId);
      return;
    }

    if (action.type === "add_tracker") {
      const trackerTarget = resolvePlanTarget(schedule.plans, action.payload.planTitle);
      if (trackerTarget.status !== "resolved") {
        setToastMessage(describeTargetProblem(trackerTarget, "plan") ?? "Which plan should this tracker go to?");
        return;
      }
      const targetPlan: Plan | undefined = trackerTarget.value;
      if (!targetPlan) {
        setToastMessage("Create a plan first, then I can add a tracker to it");
        return;
      }
      const tracker: ProgressTracker = {
        id: uid(),
        planId: targetPlan.id,
        title: action.payload.title,
        type: "number",
        unit: action.payload.unit || undefined,
        goalDirection: action.payload.goalDirection,
        goalValue: action.payload.goalValue,
      };
      setSchedule((prev) => ({
        ...prev,
        progressTrackers: [...prev.progressTrackers, tracker],
      }));
      setToastMessage(`Added tracker "${action.payload.title}" to "${targetPlan.title}"`);
      setActiveTab(1);
      setSelectedPlanId(targetPlan.id);
      return;
    }

    if (action.type === "add_task") {
      // A plan is optional for a task — held time has none — so "unspecified"
      // is acceptable here. A name that was given but doesn't resolve is not:
      // that used to silently create the task with no plan at all.
      const taskPlanTarget = resolvePlanTarget(schedule.plans, action.payload.planTitle);
      if (action.payload.planTitle && taskPlanTarget.status !== "resolved") {
        setToastMessage(describeTargetProblem(taskPlanTarget, "plan") ?? "Which plan should this task go to?");
        return;
      }
      const targetPlan = taskPlanTarget.status === "resolved" ? taskPlanTarget.value : undefined;
      const days = action.payload.days?.length ? action.payload.days : [action.payload.day];
      setSchedule((prev) => {
        const categoryDraft = [...prev.categories];
        const draft: Omit<Task, "id"> = {
          title: action.payload.title,
          startTime: action.payload.startTime,
          endTime: action.payload.endTime,
          categoryId: ensureCategoryIn(categoryDraft, action.payload.icon || targetPlan?.emoji || "star"),
          planId: targetPlan?.id ?? "",
          taskType: action.payload.taskType,
          subtasks: (action.payload.subtasks ?? []).map((s) => ({ id: uid(), task: s })),
        };
        return createTask(draft, days, null)({ ...prev, categories: categoryDraft });
      });
      setToastMessage(`Added ${action.payload.taskType}${targetPlan ? ` to "${targetPlan.title}"` : ""}`);
      return;
    }

    if (action.type === "add_subtasks") {
      // One task, not every loose match. `addSubtaskToTasks` takes an array, and
      // passing the whole match list is what made "add steps to Run" write to
      // Run, Long run and Recovery run at once.
      const taskTarget = resolveTaskTarget(schedule, action.payload.taskTitle);
      if (taskTarget.status !== "resolved") {
        setToastMessage(describeTargetProblem(taskTarget, "task") ?? "Which task should these go to?");
        return;
      }
      const matches = [taskTarget.value.id];
      setSchedule((prev) =>
        action.payload.subtasks.reduce(
          (acc, title) => addSubtaskToTasks(matches, createSubtask(title))(acc),
          prev
        )
      );
      setToastMessage(`Added ${action.payload.subtasks.length} subtask${action.payload.subtasks.length > 1 ? "s" : ""} to "${action.payload.taskTitle}"`);
      return;
    }

    if (action.type === "ask_clarification") {
      // A question, not a change — the chat renders it; there is nothing to apply.
      return;
    }

    const _exhaustive: never = action;
    return _exhaustive;
  }

  // ── AI Proposal boundary (PlanR Improvement 04) ─────────────────────────
  // The AI never mutates Schedule directly: add_task now goes AI → Proposal
  // → user review → these handlers → the same createTask() handleApplyAction
  // already uses above. See lib/aiProposal.ts / lib/proposalMutations.ts.

  function handleProposalCreated(proposal: AIProposal) {
    setSchedule((prev) => recordProposalCreated(prev, proposal));
  }

  /** Returns whether execution actually succeeded, so the calling UI can
   * show the true outcome instead of assuming success. */
  function handleAcceptProposal(proposal: AIProposal): boolean {
    let result: ReturnType<typeof executeCreateTaskProposal> | undefined;
    setSchedule((prev) => {
      result = executeCreateTaskProposal(prev, proposal);
      return result.ok ? result.schedule : recordProposalFailed(prev, proposal, result.error ?? "Unknown error");
    });
    if (result?.ok) {
      setToastMessage(`Added "${proposal.data.title}"`);
    } else {
      setToastMessage(result?.error ?? "Couldn't add that task");
    }
    return result?.ok ?? false;
  }

  function handleRejectProposal(proposal: AIProposal) {
    setSchedule((prev) => recordProposalRejected(prev, proposal));
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

  function handleMoveMilestone(id: string, direction: "up" | "down") {
    setSchedule((prev) => {
      const existing = (prev.milestones ?? []).find((m) => m.id === id);
      if (!existing) return prev;
      const plan = prev.plans.find((p) => p.id === existing.planId);
      const otherMilestones = (prev.milestones ?? []).filter((m) => m.planId !== existing.planId);
      const planMilestones = (prev.milestones ?? []).filter((m) => m.planId === existing.planId);
      return {
        ...prev,
        milestones: [...otherMilestones, ...moveMilestone(planMilestones, id, direction, plan?.startDate)],
      };
    });
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
      const due = rituals.filter((r) => ritualScheduledOnDate(r, date, schedule.preferences?.startDate)).length;
      const done = completions.filter((c) => c.date === date).length;
      return { date, label: SHORT[jsDay], isToday: date === today, completedCount: done, dueCount: due };
    });
  }, [schedule.rituals, schedule.ritualCompletions, todayKey, schedule.preferences?.startDate]);

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
        .filter((t) => isTaskScheduledOn(t, activeDateISO, true, schedule.preferences?.startDate))
        .map((t) => {
          const resolved = resolveOccurrence(t, activeDateISO);
          return isViewingToday ? resolved : { ...resolved, ...completionForDate(t, activeDateISO) };
        }),
    [dayTasks, isViewingToday, activeDateISO, schedule.preferences?.startDate]
  );

  // Yesterday's overnight tails, which finish inside the day being viewed.
  // Resolved against the previous date so a skipped or retimed occurrence
  // carries in what it actually ran rather than what the template says.
  const carryInTasks = useMemo(() => {
    const prevDay = DAYS[(DAYS.indexOf(activeDay) + 6) % 7];
    const prevISO = addDaysToISO(activeDateISO, -1);
    return (schedule.activities[prevDay] ?? [])
      .filter((t) => isTaskScheduledOn(t, prevISO, true, schedule.preferences?.startDate))
      .map((t) => resolveOccurrence(t, prevISO))
      .filter((t) => taskContinuations(t).length > 0);
  }, [schedule.activities, activeDay, activeDateISO, schedule.preferences?.startDate]);

  const timelineStartMinutes = useMemo(
    () =>
      getTimelineDisplayStartMinutes({
        dayStartTime: schedule.preferences?.dayStartTime,
        tasks: dayTasksView,
        // A continuation opens at the handover, earlier than the window would
        // otherwise start — without this floor it is clipped off the top.
        mustShowFromMinutes: carryInTasks.length > 0 ? SCHEDULE_DAY_HANDOVER_MINUTES : undefined,
      }),
    [dayTasksView, schedule.preferences?.dayStartTime, carryInTasks]
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
    toggleTask: (task: Task, slotIndex = 0, isMultiSlot = false) => {
      haptic("light");
      if (isMultiSlot) {
        handleToggleSlot(task.id, slotIndex, activeDay, activeDateISO);
        return;
      }
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

  // Same idea for categories, which now own every task's icon and colour.
  const categoryMap = useMemo(() => categoriesById(schedule.categories), [schedule.categories]);

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
    // Count only tracked work. dayTasksView itself must keep commitments —
    // it also drives the rendered list and timeline, which do show them.
    const tracked = dayTasksView.filter(isTrackedTask);
    const total = tracked.length;
    const done = tracked.filter((t) =>
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

  /** A dated occurrence can only be removed from today onwards; see the
   *  matching `canSkip` gate on the task detail view. */
  const canDeleteThisDate =
    !!taskDeleteRequest?.dateISO && taskDeleteRequest.dateISO >= todayISO();

  const taskDeleteCopy = useMemo(() => {
    if (!taskDeleteDetails) return null;
    return buildDeleteConfirmationCopy("task", {
      name: taskDeleteDetails.task.title,
      // Whenever more than one scope is offered the copy has to stop asserting
      // what will happen — with "Remove today only" on screen, "This removes it
      // from Sunday" describes only one of three buttons. Naming the *other*
      // days up front is what actually resolves the ambiguity: without it,
      // "Delete every Monday" reads as "delete this task" and the still-live
      // Wednesday/Friday copies look like the delete silently failed — the
      // week grid shows the whole week at once, so they're back on screen
      // instantly, and staying there after a reload only confirms the wrong
      // read of what "Delete every Monday" scoped to.
      description: taskDeleteDetails.activeDays.length > 1
        ? `This task also runs on ${formatDayListLabel(
            taskDeleteDetails.activeDays.filter((d) => d !== taskDeleteDetails.sourceDay),
          )}. Choose what you want to delete.`
        : canDeleteThisDate
        ? "Choose what you want to delete."
        : `This removes it from ${deleteDayLabel(taskDeleteDetails.sourceDay)}.`,
    });
  }, [taskDeleteDetails, canDeleteThisDate]);

  function deleteDayLabel(day: DayKey): string {
    return day.charAt(0).toUpperCase() + day.slice(1);
  }

  /** "Wednesday" / "Wednesday and Friday" / "Monday, Wednesday and Friday" */
  function formatDayListLabel(days: DayKey[]): string {
    const labels = days.map(deleteDayLabel);
    if (labels.length <= 1) return labels.join("");
    if (labels.length === 2) return labels.join(" and ");
    return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  }

  function performTaskDelete(scope: TaskDeleteScope) {
    if (!taskDeleteDetails) return;

    // "This date only" is a skip, not a removal: the occurrence stops appearing
    // but the task and its history survive, which is what streaks depend on.
    if (scope === "date") {
      const date = taskDeleteRequest?.dateISO;
      if (!date) return;
      setSchedule(setTaskException(taskDeleteDetails.task.id, date, { skipped: true }));
      setTaskDeleteRequest(null);
      haptic("medium");
      setToastMessage({
        message: `Removed from ${formatDayNoteLabel(date)}`,
        actionLabel: "Undo",
        onAction: () => { undo(); setToastMessage(null); haptic("light"); },
      });
      return;
    }

    const snapshot = createTaskDeleteSnapshot(
      schedule,
      taskDeleteDetails.task.id,
      taskDeleteDetails.sourceDay,
      scope
    );
    setSchedule(applyTaskDelete(snapshot));
    setTaskDeleteRequest(null);
    haptic("medium");
    // Routes through the general undo stack (setSchedule above already pushed
    // the pre-delete schedule onto it) rather than restoreTaskDelete's own
    // snapshot-based restore — two independent restore paths risked a
    // double-restore bug (Cmd+Z, then also clicking this now-stale toast,
    // would re-splice the task back a second time).
    setToastMessage({
      message: `Deleted "${taskDeleteDetails.task.title}"`,
      actionLabel: "Undo",
      onAction: () => {
        undo();
        setToastMessage(null);
        haptic("light");
      },
    });
  }

  /** First unresolved task for today, sorted by time — drives What's Next card.
      Skips both completed and missed tasks. */
  const nextTask = useMemo(() => {
    if (activeDay !== todayKey) return null;
    // A commitment is never "next to do" — it can't be resolved, so it would
    // otherwise pin itself here permanently.
    return dayTasks.find((t) => isTrackedTask(t) && !isTaskResolved(t, taskEffectiveItemCount(t))) ?? null;
  }, [dayTasks, activeDay, todayKey, taskEffectiveItemCount]);

  /** Rituals due on the active day (for summary line) */
  const todayDueRituals = useMemo(
    () => (schedule.rituals ?? []).filter((r) => ritualScheduledOnDate(r, activeDateISO, schedule.preferences?.startDate)),
    [schedule.rituals, activeDateISO, schedule.preferences?.startDate]
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
    return resolveCustomVisibleDates(weekDates, customDays);
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

  function getTaskPresentation(task: Task) {
    const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
    // Identity belongs to the task's category. Held time and uncategorised
    // tasks resolve to a null accent and render neutral.
    const { icon, color, category } = taskIdentity(task, categoryMap);
    return { linkedPlan, category, iconName: icon, color };
  }

  // Stable toggle for memoized timeline cards (mirrors the inline closure that
  // renderTimelineTaskCard used, but with a stable identity so cards don't
  // re-render during a drag). Recreated only when the active day/date changes.
  const handleTimelineToggle = useCallback(
    (task: Task, slotIndex = 0, isMultiSlot = false) => {
      haptic("light");
      if (isMultiSlot) {
        handleToggleSlot(task.id, slotIndex, activeDay, activeDateISO);
        return;
      }
      handleToggleTaskComplete(task.id, taskEffectiveItemIds(task), activeDay, activeDateISO);
    },
    [handleToggleTaskComplete, handleToggleSlot, taskEffectiveItemIds, activeDay, activeDateISO]
  );

  const timelineTaskLayouts = useMemo(() => {
    // One interval per SLOT, not per task — a multi-slot task occupies several
    // separate blocks on the day (mirrors WeekGrid.buildDayLayout on desktop).
    const position = (cs: number, ce: number) => ({
      start: cs,
      end: ce,
      top: TIMELINE_TOP_PADDING + ((cs - timelineStartMinutes) / 60) * HOUR_HEIGHT,
      height: ((ce - cs) / 60) * HOUR_HEIGHT,
      lane: 0,
      laneCount: 1,
    });

    const own = dayTasksView.flatMap((task) => {
      const slots = getSlots(task);
      const isMultiSlot = slots.length > 1;
      return slots.map((slot, slotIndex) => {
        const parsedStart = parseTimeToMinutes(slot.startTime);
        const start = parsedStart === null
          ? timelineStartMinutes
          : mapMinutesToTimeline(parsedStart, timelineStartMinutes, timelineEndMinutes);
        const parsedEnd = parseTimeToMinutes(slot.endTime);
        let end = parsedEnd === null
          ? start + 30
          : mapMinutesToTimeline(parsedEnd, timelineStartMinutes, timelineEndMinutes);
        while (end <= start) end += 1440;
        const cs = clamp(start, timelineStartMinutes, timelineEndMinutes);
        const ce = clamp(Math.max(end, cs + 15), timelineStartMinutes, timelineEndMinutes);
        return {
          kind: "task" as const,
          task,
          slot,
          slotIndex,
          isMultiSlot,
          color: getTaskPresentation(task).color,
          // Cut at the bottom when the block runs out of day — the tail is drawn
          // as a continuation on tomorrow rather than clamped away.
          edgeCut: end > timelineEndMinutes ? ("bottom" as const) : undefined,
          ...position(cs, ce),
        };
      });
    });

    // Carried-in tails join the same lane packing below rather than sitting on
    // their own layer, so an early-morning continuation and a 6 AM task split
    // the column like any other overlap.
    const carried = carryInTasks.flatMap((task) =>
      taskContinuations(task, timelineEndMinutes).map((c) => ({
        kind: "continuation" as const,
        task,
        slot: c.slot,
        slotIndex: c.slotIndex,
        isMultiSlot: getSlots(task).length > 1,
        color: getTaskPresentation(task).color,
        edgeCut: "top" as const,
        ...position(
          clamp(c.interval.start, timelineStartMinutes, timelineEndMinutes),
          clamp(c.interval.end, timelineStartMinutes, timelineEndMinutes),
        ),
      })),
    );

    const intervals = [...own, ...carried]
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
  }, [dayTasksView, carryInTasks, timelineEndMinutes, timelineStartMinutes]);


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
    isTruncated = false,
    slotIndex?: number
  ) {
    // Unified visual: the shared TaskBlockCard (same component as the desktop
    // week grid + the mobile list). Size tiers map to its grid variants.
    const { linkedPlan, category: taskCategory } = getTaskPresentation(task);
    const slots = getSlots(task);
    const isMultiSlot = slots.length > 1 && slotIndex !== undefined;
    const slot = isMultiSlot ? slots[slotIndex] : undefined;
    const duration = slot
      ? formatTaskDuration(slot.startTime, slot.endTime)
      : formatTaskDuration(task.startTime, task.endTime);
    const subtaskSummary = getTaskSubtaskSummary(task, linkedPlan);
    const allSubtaskIds = subtaskSummary.hasItems ? getTaskCheckableItems(task, linkedPlan).map((i) => i.id) : [];
    // Same per-phase principle as renderWeekCard below: reading the whole-task
    // `missed` flag here made every block of a repeated-same-day task show the
    // same state the moment any ONE of them changed.
    const taskState = isMultiSlot
      ? resolveSlotState(task, slotIndex)
      : resolveTaskState(task, subtaskSummary.totalCount);
    const toggle = () => {
      haptic("light");
      if (isMultiSlot) handleToggleSlot(task.id, slotIndex, activeDay, activeDateISO);
      else handleToggleTaskComplete(task.id, allSubtaskIds, activeDay, activeDateISO);
    };
    void cardClassName; void isOvernight; void isTruncated;

    return (
      <TaskBlockCard
        variant="grid"
        slotOverride={slot}
        slotIndex={isMultiSlot ? slotIndex : undefined}
        task={task}
        plan={linkedPlan}
        category={taskCategory}
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
    slot?: TaskSlot,
    slotIndex?: number,
    edgeCut?: "top" | "bottom",
    gridMenuAction?: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean },
    dateISO?: string,
  ) {
    const { linkedPlan, category: taskCategory } = getTaskPresentation(task);
    // Grid blocks are per-slot: show this slot's own duration.
    const duration = slot
      ? formatTaskDuration(slot.startTime, slot.endTime)
      : formatTaskDuration(task.startTime, task.endTime);
    // A multi-slot task completes AND misses per phase — this block's state
    // reflects just its own slot, never the whole task's `missed`/`completed`
    // flags (which only flip once every slot is done/missed) — otherwise every
    // block of a repeated-same-day task shows the same state the moment any
    // ONE of them changes, with no way to tell the blocks apart.
    const totalSlots = getSlots(task).length;
    const taskState =
      totalSlots > 1 && slotIndex !== undefined
        ? resolveSlotState(task, slotIndex)
        : resolveTaskState(task, getTaskSubtaskSummary(task, linkedPlan).totalCount);
    return (
      <TaskBlockCard
        variant="grid"
        task={task}
        plan={linkedPlan}
        category={taskCategory}
        state={taskState}
        duration={duration}
        slotOverride={slot}
        slotIndex={totalSlots > 1 ? slotIndex : undefined}
        readOnly={readOnly}
        edgeCut={edgeCut}
        compact={height < 56}
        narrow={widthPct < 60 || height < 88}
        gridMenuAction={gridMenuAction}
        onToggle={onToggle}
        // Opening a continuation opens its source task: openEditSheet resolves
        // the template by id across every weekday bucket, so it lands on the
        // real task rather than on the day the tail happens to be drawn.
        onClick={() => openEditSheet(task, dateISO)}
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
      const stats = getPlanCardStats(plan, schedule.activities, todayKey, schedule.preferences?.startDate, schedule.milestones);
      const dateRange = plan.startDate || plan.endDate ? formatPlanRange(plan) : null;
      const firstTracker = schedule.progressTrackers.find((t) => t.planId === plan.id);
      return { plan, uniqueTasks, trackerCount, planIconEntry, stats, dateRange, firstTracker };
    });
    // Shares derivePlanStatus with the cards, so this tally can never claim a
    // plan needs focus while its own card stays silent. It used to count every
    // plan under 70% consistency, which meant a plan created this morning —
    // with no completions possible yet — was already in the "need focus" number.
    const needsFocusCount = planRows.filter(({ plan, stats }) =>
      needsAttention(derivePlanStatus(stats.dayState, stats.consistency, plan)),
    ).length;
    // Headline count of tracked work across plans — commitments aren't work.
    // row.uniqueTasks itself keeps them so they still list under their plan.
    const totalPlanTasks = planRows.reduce(
      (sum, row) => sum + row.uniqueTasks.filter(({ task }) => isTrackedTask(task)).length,
      0,
    );
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
              <div className="flex items-center gap-2">
                <CtaActionButton
                  label="Goals"
                  icon={<IconTargetArrow size={14} strokeWidth={2.5} />}
                  onClick={() => setGoalsSheetOpen(true)}
                />
                <CtaActionButton
                  label="Add New Plan"
                  icon={<IconPlus size={14} strokeWidth={2.5} />}
                  onClick={() => setAddingPlan(true)}
                />
              </div>
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
                      <span className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Planned tasks</span>
                      <span className="text-[12px] font-black tabular-nums text-neutral-950 dark:text-white">{totalPlanTasks}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2 dark:border-white/[0.06]">
                      <span className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Trackers</span>
                      <span className="text-[12px] font-black tabular-nums text-neutral-950 dark:text-white">{totalTrackers}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Templates</span>
                      <button
                        type="button"
                        onClick={() => setTemplatesOpen(true)}
                        className="text-[12px] font-bold text-neutral-950 transition-colors hover:text-neutral-600 dark:text-white dark:hover:text-neutral-300"
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
          onTabChange={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onCreateTask={() => openCreateSheet()}
          onCreatePlan={openAddPlan}
          onCreateRitual={openCreateRitual}
          onBulkImport={() => setBulkImportOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSettingsTab={() => setActiveTab(5)}
          onOpenNotes={() => { setSelectedPlanId(null); setActiveTab(6); }}
          onOpenWallpaper={() => { haptic("light"); setWallpaperOpen(true); }}
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
          onClose={() => setSettingsOpen(false)}
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
          onOpenAI={() => { setSettingsOpen(false); setActiveTab(7); }}
        />
      )}
      <TemplatesSheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} onApply={handleApplyTemplate} />

      <DayWallpaperSheet
        open={wallpaperOpen}
        onClose={() => setWallpaperOpen(false)}
        schedule={schedule}
        todayKey={todayKey}
      />

      <DayActionsSheet
        open={dayActionsOpen}
        sourceDay={activeDay}
        onClose={() => setDayActionsOpen(false)}
        onSwap={(target) => setSchedule(swapDays(activeDay, target))}
        onDuplicate={(targets) => setSchedule(duplicateDay(activeDay, targets))}
        onClear={() => setDayClearRequest(activeDay)}
        taskCount={(schedule.activities[activeDay] ?? []).length}
      />

      <MissedTaskSheet
        missed={missedSheet}
        onClose={() => setMissedSheet(null)}
        onReschedule={(m, dateISO, startMinutes) =>
          setSchedule((prev) => rescheduleMissedTaskOnce(prev, m.task, m.dateISO, dateISO, startMinutes))
        }
        onDismiss={(m) => setSchedule((prev) => acknowledgeMiss(prev, m.task.id, m.dateISO))}
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
            onToggleSlot={(taskId, slotIndex) => handleToggleSlot(taskId, slotIndex, subtasksRef?.day, subtasksRef?.dateISO)}
            onMissed={(taskId, ids) => handleMarkTaskMissed(taskId, ids, subtasksRef?.day, subtasksRef?.dateISO)}
            onSnooze={(taskId) => handleSnoozeTaskLater(taskId, subtasksRef?.day, subtasksRef?.dateISO)}
            onSkip={(taskId) => handleSkipOccurrence(taskId, subtasksRef?.dateISO)}
            skipped={!!(subtasksRef && subtasksRawTask?.exceptions?.[subtasksRef.dateISO]?.skipped)}
            canSkip={!!subtasksRef && subtasksRef.dateISO >= todayISO()}
            dayNote={subtasksRef && subtasksRawTask ? occurrenceNote(subtasksRawTask, subtasksRef.dateISO) : undefined}
            onSaveDayNote={(taskId, note) => handleSaveDayNote(taskId, note, subtasksRef?.dateISO)}
            dayLabel={subtasksRef ? formatDayNoteLabel(subtasksRef.dateISO) : undefined}
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
              onOpenPlan={(planId) => { setActiveTab(1); setSelectedPlanId(planId); }}
              onTurnIntoPlan={aiEnabled && aiAvailable && !iosSafeMode ? handleTurnNoteIntoPlan : undefined}
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
        {/* Tab content waits for `ready` so a first-launch user never sees the
            planner flash before the routing effect settles on the right tab.

            Deliberately NOT wrapped in AnimatePresence. Tab switching is the
            app's primary navigation, and AnimatePresence — especially with
            mode="wait", which holds the incoming tab until the outgoing one
            finishes exiting — makes that navigation depend on an animation
            completing. Whenever frames stop (a backgrounded tab, a throttled
            PWA, an interrupted transition) the exit never finishes and the
            switcher deadlocks: nav state updates but the screen never changes.
            That failure has been hit here before, which is what the previous
            comment on this block described.

            Each tab keeps its own initial/animate fade, so switching still
            fades in — it just can no longer be blocked by an exit that never
            resolves. Outgoing tabs unmount immediately via plain React. */}
        <>
          {!ready && <div key="tab-booting" />}

        {/* ── Tasks Tab ────────────────────────────────────────────────────── */}
        {ready && activeTab === 0 && (
          <m.div
            key="tab-tasks"
            data-tour="today-timeline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
                onToggleRitualStep={(ritualId, stepId, dateISO) => handleToggleRitualStep(ritualId, stepId, dateISO)}
                weekDates={visibleDates}
                todayKey={todayKey}
                weekLabel={weekLabel}
                activeDay={activeDay}
                calendarView={calendarView}
                customDays={customDays}
                onDaySelect={setActiveDay}
                onDayActions={(day) => { setActiveDay(day); setDayActionsOpen(true); }}
                onCreateTaskAtTime={(day, startMin, endMin) => openCreateSheetWithTime(startMin, endMin, day)}
                onMoveTask={handleMoveTask}
                onMoveRitual={handleMoveRitual}
                onMarkMissed={handleMarkTaskMissed}
                onOpenMissedRecovery={handleOpenMissedRecovery}
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
                onToggleSlot={handleToggleSlot}
                onMarkSlotMissed={handleMarkSlotMissed}
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
                  {activeDateISO === todayISO()
                    ? "Today's Task"
                    : new Date(activeDateISO + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" })}
                </h1>
                <div className="flex items-center gap-2.5">
                  {todayEditMode && (
                    <IconButton
                      label="Lock screen wallpaper"
                      variant="soft"
                      size="sm"
                      radius="full"
                      onClick={() => { haptic("light"); setWallpaperOpen(true); }}
                    >
                      <IconPhoto size={15} strokeWidth={2} />
                    </IconButton>
                  )}
                  {/* The comment above this cluster already claimed it held
                      "day actions"; until now it didn't. */}
                  {todayEditMode && (
                    <IconButton
                      label={`${DAY_FULL_LABELS[activeDay]} actions — swap, duplicate or clear day`}
                      variant="soft"
                      size="sm"
                      radius="full"
                      onClick={() => { haptic("light"); setDayActionsOpen(true); }}
                    >
                      <IconDotsVertical size={15} strokeWidth={2} />
                    </IconButton>
                  )}
                  {viewMode === "timeline" && (
                    <button
                      type="button"
                      onClick={handleTimelineSave}
                      disabled={savingTimeline}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60 dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-neutral-950"
                    >
                      <IconDeviceFloppy size={15} strokeWidth={2} />
                      {savingTimeline ? "Saving…" : "Save"}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={todayEditMode ? "Done editing" : "Edit day"}
                    aria-pressed={todayEditMode}
                    onClick={() => { haptic("light"); setTodayEditMode((v) => !v); }}
                    className={`tap-target flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                      todayEditMode
                        ? "bg-neutral-200 text-neutral-900 dark:bg-white/[0.18] dark:text-white"
                        : "bg-neutral-100 text-neutral-600 dark:bg-white/[0.08] dark:text-neutral-300"
                    }`}
                  >
                    {todayEditMode ? <IconCheck size={15} strokeWidth={2.4} /> : <IconEdit size={15} strokeWidth={2} />}
                  </button>
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
              <SignInPrompt className="mt-3" />
            </div>

            {/* Task content */}
            <div className="flex min-h-0 flex-1 flex-col px-4 lg:overflow-hidden">
              {/* Rituals strip */}
              <TodayRitualsBar
                rituals={schedule.rituals ?? []}
                dateISO={todayISO()}
                ritualCompletions={schedule.ritualCompletions ?? []}
                onToggle={handleToggleRitualComplete}
                onLogAmount={(id, amount) => handleLogRitualAmount(id, amount, todayISO())}
                onOpenDetail={(ritual) => setDetailRitualId(ritual.id)}
              />
              <TrackerQuickBar
                trackers={schedule.progressTrackers}
                plans={schedule.plans}
                metricEntries={schedule.metricEntries}
                onLog={setEntryTracker}
                onNavigate={(planId) => { setActiveTab(1); setSelectedPlanId(planId); }}
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
                                      category={taskIdentity(task, categoryMap).category}
                                      editMode
                                      onToggleComplete={handleToggleTaskComplete}
                                      onToggleSubtask={handleToggleSubtask}
                                      onToggleSlot={handleToggleSlot}
                                      onEdit={() => openEditSheet(task)}
                                      onDelete={() => requestDeleteTask(task.id, activeDay, activeDateISO)}
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
                                category={taskIdentity(task, categoryMap).category}
                                readOnly={!isViewingToday}
                                onToggleComplete={(id, ids) => handleToggleTaskComplete(id, ids, activeDay, activeDateISO)}
                                onMissed={(id, ids) => handleMarkTaskMissed(id, ids, activeDay, activeDateISO)}
                                onToggleSubtask={(id, sub) => handleToggleSubtask(id, sub, activeDay, activeDateISO)}
                                onToggleSlot={(id, slotIndex) => handleToggleSlot(id, slotIndex, activeDay, activeDateISO)}
                                onEdit={() => openEditSheet(task)}
                                onDelete={() => requestDeleteTask(task.id, activeDay, activeDateISO)}
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
                      dateISO={activeDateISO}
                      timelineStartMinutes={timelineStartMinutes}
                      timelineEndMinutes={timelineEndMinutes}
                      timelineTopPadding={TIMELINE_TOP_PADDING}
                      hourHeight={HOUR_HEIGHT}
                      completedIds={completedRitualIds}
                      trackingStart={schedule.preferences?.startDate}
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
                          ritualCompletions={schedule.ritualCompletions ?? []}
                          dateISO={activeDateISO}
                          timelineStartMinutes={timelineStartMinutes}
                          timelineEndMinutes={timelineEndMinutes}
                          timelineTopPadding={TIMELINE_TOP_PADDING}
                          hourHeight={HOUR_HEIGHT}
                          completedIds={completedRitualIds}
                          onToggleComplete={handleToggleRitualComplete}
                          onToggleStep={(ritualId, stepId) => handleToggleRitualStep(ritualId, stepId)}
                          trackingStart={schedule.preferences?.startDate}
                        />
                      </div>

                      {/* Grid + tasks */}
                      <div
                        ref={taskGridRef}
                        className="relative min-w-0 flex-1 border-l border-neutral-200/80 dark:border-white/[0.07]"
                        style={{ height: timelineHeight, contain: "layout style" }}
                        onPointerDown={!iosSafeMode ? handleGridPointerDown : undefined}
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
                              // `kind` is part of the key because a daily overnight
                              // task renders twice on the same day — today's block
                              // and yesterday's tail — with the same id and slot
                              // index. Matches WeekGrid, which already guards this.
                              key={`${layout.kind}-${layout.task.id}-${layout.slotIndex}`}
                              layout={layout}
                              plan={layout.task.planId ? plansById.get(layout.task.planId) ?? null : null}
                              category={taskIdentity(layout.task, categoryMap).category}
                              isBeingMoved={dragMove?.taskId === layout.task.id && dragMove?.slotIndex === layout.slotIndex}
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
                                  // Preview only the dragged phase at its new time — retimeSlot
                                  // keeps the other slots where they are.
                                  retimeSlot(
                                    movingTask,
                                    dragMove.slotIndex,
                                    minutesToDisplayTime(dragMove.previewStartMin),
                                    minutesToDisplayTime(dragMove.previewStartMin + dragMove.durationMin),
                                  ),
                                  "h-full rounded-[10px] px-2 py-1.5 w-full min-w-0 overflow-hidden border border-neutral-300 dark:border-white/20",
                                  cardSize,
                                  false,
                                  false,
                                  dragMove.slotIndex,
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
        {ready && activeTab === 1 && (
          <m.div
            key="tab-plans"
            data-tour={selectedPlan ? undefined : "plans-list"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
          {/* The lg:max-w-4xl that used to wrap this is gone: PlanDetailView
              now lays itself out in three columns at lg and needs the width. */}
          <div>
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
              onAddTracker={(planId, title, unit, goalDirection, id, goalValue, startingValue, dailyTarget) => {
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
                      startingValue,
                      dailyTarget,
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
              onMoveMilestone={handleMoveMilestone}
              onCompleteMilestone={handleCompleteMilestone}
              onAddGeneratedTasks={handleAddGeneratedTasks}
              onLinkTrackerToMilestone={handleLinkTrackerToMilestone}
              onUnlinkTrackerFromMilestone={handleUnlinkTrackerFromMilestone}
              onLinkTaskToMilestone={handleLinkTaskToMilestone}
              onUnlinkTaskFromMilestone={handleUnlinkTaskFromMilestone}
              onUpdateCoachMessages={handleUpdateCoachMessages}
            />
            </ErrorBoundary>
          ) : renderPlanList()}
          </div>
          </m.div>
        )}
        {/* ── Routine Tab ────────────────────────────────────────────────── */}
        {ready && activeTab === 2 && (
          <m.div
            key="tab-routine"
            data-tour="routine-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ErrorBoundary section name="Routine">
            <RitualView
              rituals={schedule.rituals ?? []}
              ritualCompletions={schedule.ritualCompletions ?? []}
              trackingStart={schedule.preferences?.startDate}
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
            </ErrorBoundary>
          </m.div>
        )}

        {/* ── Tracking Tab ───────────────────────────────────────────────── */}
        {ready && activeTab === 8 && (
          <m.div
            key="tab-tracking"
            data-tour="tracking-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ErrorBoundary section name="Tracking">
            <TrackingView
              trackers={schedule.progressTrackers}
              metricEntries={schedule.metricEntries}
              plans={schedule.plans}
              trackingStart={schedule.preferences?.startDate}
              onLog={handleLogTrackerAmount}
              onOpenAddEntry={(tracker) => setEntryTracker(tracker)}
              onDeleteEntry={handleDeleteEntry}
              onNavigateToPlans={() => setActiveTab(1)}
            />
            </ErrorBoundary>
          </m.div>
        )}

        {/* ── Overview Tab ───────────────────────────────────────────────── */}
        {ready && activeTab === 4 && (
          <m.div
            key="tab-overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
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
                onToggleSlot={(id, slotIndex) => handleToggleSlot(id, slotIndex, todayKey, todayISO())}
                onOpenSubtasks={(task) => setSubtasksRef({ id: task.id, day: todayKey, dateISO: todayISO() })}
              />
            ) : (
              <OverviewDashboard
                schedule={schedule}
                todayKey={todayKey}
                onNavigate={(tab) => { setActiveTab(tab); setSelectedPlanId(null); }}
                onMarkTaskDone={(id, subtaskIds) => handleToggleTaskComplete(id, subtaskIds, todayKey)}
                onToggleSlot={(id, slotIndex) => handleToggleSlot(id, slotIndex, todayKey, todayISO())}
                onMissedTask={(id, subtaskIds) => handleMarkTaskMissed(id, subtaskIds, todayKey)}
                onOpenSubtasks={(id) => setSubtasksRef({ id, day: todayKey, dateISO: todayISO() })}
                completedRitualIds={completedRitualIds}
                onLogTracker={(tracker) => setEntryTracker(tracker)}
                onHandleMissed={setMissedSheet}
              />
            )}
            </ErrorBoundary>
          </m.div>
        )}

        {/* ── Settings Tab ─────────────────────────────────────────────────── */}
        {ready && activeTab === 5 && (
          <m.div
            key="tab-settings"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ErrorBoundary section name="AI">
              <SettingsView
                schedule={schedule}
                setSchedule={setSchedule}
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
                onOpenAI={() => setActiveTab(7)}
              />
            </ErrorBoundary>
          </m.div>
        )}

        {/* ── AI Tab ───────────────────────────────────────────────────────── */}
        {ready && aiEnabled && !iosSafeMode && activeTab === 7 && (
          <m.div
            key="tab-ai"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
          >
            <ErrorBoundary section name="AI">
              <AIView onClose={() => setActiveTab(5)} />
            </ErrorBoundary>
          </m.div>
        )}

        </>
      </div>
      )}

      {/* ── Edit Plan Bottom Sheet ─────────────────────────────────────────── */}
      {editingPlanId && (
        <EditPlanSheet
          planId={editingPlanId}
          plan={plansById.get(editingPlanId) ?? null}
          setSchedule={setSchedule}
          onClose={() => setEditingPlanId(null)}
          goals={schedule.goals ?? []}
        />
      )}
      {/* ── Goals Sheet (list + detail + create/edit) ───────────────────────── */}
      <GoalListSheet
        open={goalsSheetOpen}
        onClose={() => setGoalsSheetOpen(false)}
        schedule={schedule}
        setSchedule={setSchedule}
        onDeleteGoal={handleDeleteGoal}
      />
      {/* ── Add Plan Bottom Sheet ───────────────────────────────────────────── */}
      {addingPlan && (
        <AddPlanSheet
          open={addingPlan}
          onClose={() => setAddingPlan(false)}
          setSchedule={setSchedule}
          onUseAI={
            aiAvailable
              ? () => { setAddingPlan(false); setAiPlanCreating(true); }
              : undefined
          }
          goals={schedule.goals ?? []}
        />
      )}

      {/* ── AI Plan Creator Sheet (hidden while AI is disabled) ────────────── */}
      {aiEnabled && aiAvailable && !iosSafeMode && (
        <AIPlanCreatorSheet
          open={aiPlanCreating}
          onClose={() => { setAiPlanCreating(false); setNotePlanSeed(null); }}
          onCreatePlan={handleCreateAIPlan}
          existingPlans={schedule.plans.map((p) => ({ title: p.title, category: p.category, description: p.description }))}
          schedule={schedule}
          todayKey={todayKey}
          initialGoal={notePlanSeed?.goal}
          autoGenerate={!!notePlanSeed}
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
            onCreateRitual={openCreateRitual}
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
          onCopySubtaskToTasks={(entry, targetTaskIds) => {
            setSchedule(addSubtaskToTasks(targetTaskIds, entry));
            setToastMessage(
              `Subtask copied to ${targetTaskIds.length} task${targetTaskIds.length === 1 ? "" : "s"}`
            );
          }}
          onDelete={taskSheetMode === "edit" && taskSheetTask ? () => {
            const sourceDay = taskSheetActiveDays.includes(activeDay)
              ? activeDay
              : taskSheetActiveDays[0] ?? activeDay;
            const taskId = taskSheetTask.id;
            const dateISO = taskSheetDateISO;
            closeTaskSheet();
            requestDeleteTask(taskId, sourceDay, dateISO);
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
          quickAmounts={quickAmountsForUnit(entryTracker.unit)}
          todayTotal={sumEntriesForDate(schedule.metricEntries, entryTracker.id, todayISO())}
        />
      )}


      {detailRitual && (
        <div
          className="fixed inset-0 z-50 bg-[#F5F5F5] dark:bg-[#0E0E0E]"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <RoutineDetailView
            ritual={detailRitual}
            ritualCompletions={schedule.ritualCompletions ?? []}
            trackingStart={schedule.preferences?.startDate}
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
          dayNote={subtasksRef && subtasksRawTask ? occurrenceNote(subtasksRawTask, subtasksRef.dateISO) : undefined}
          onSaveDayNote={(taskId, note) => handleSaveDayNote(taskId, note, subtasksRef?.dateISO)}
          dayLabel={subtasksRef ? formatDayNoteLabel(subtasksRef.dateISO) : undefined}
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
          taskDeleteDetails.activeDays.length > 1 || canDeleteThisDate ? (
            <div className="space-y-2.5">
              {/* Least destructive first. "This date only" is a skip: the task
                  and its history stay, only this occurrence goes. Offered just
                  for today and later — a past occurrence already happened, and
                  hiding it would quietly rewrite the record. */}
              {canDeleteThisDate && taskDeleteRequest?.dateISO && (
                <Button
                  type="button"
                  variant="dangerSecondary"
                  fullWidth
                  onClick={() => performTaskDelete("date")}
                >
                  Remove {formatDayNoteLabel(taskDeleteRequest.dateISO)} only
                </Button>
              )}
              <Button
                type="button"
                variant="dangerSecondary"
                fullWidth
                onClick={() => performTaskDelete("day")}
              >
                Delete {deleteDayLabel(taskDeleteDetails.sourceDay)}s only
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

      {/* ── Clear-day confirmation ──────────────────────────────────────────── */}
      <ConfirmSheet
        open={!!dayClearRequest}
        onClose={() => setDayClearRequest(null)}
        onConfirm={performDayClear}
        title={dayClearCopy?.title ?? ""}
        description={dayClearCopy?.description}
        confirmLabel={dayClearCopy?.confirmLabel}
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
      {aiEnabled && aiAvailable && !iosSafeMode && (
        <ErrorBoundary section name="AI">
          <AIAssistant
            open={aiOpen}
            onClose={() => { setAiOpen(false); setAiInitialMessage(""); }}
            plans={schedule.plans}
            schedule={schedule}
            initialPlanId={selectedPlanId}
            onAddGeneratedTasks={handleAddGeneratedTasks}
            onApplyAction={handleApplyAction}
            onNavigateToPlan={(planId) => { setActiveTab(1); setSelectedPlanId(planId); setAiOpen(false); }}
            onOpenAISettings={() => { setAiOpen(false); setActiveTab(7); }}
          />
        </ErrorBoundary>
      )}

      {/* ── AI chat (desktop-only free chat: Plan/Task/Subtasks/Milestone/Tracker/Ritual) ── */}
      {aiEnabled && aiAvailable && !iosSafeMode && (
        <ErrorBoundary section name="AI Chat">
          <AIFab
            context="plans"
            plans={schedule.plans}
            rituals={schedule.rituals ?? []}
            schedule={schedule}
            activePlan={selectedPlan ?? undefined}
            onApplyAction={handleApplyAction}
            onProposalCreated={handleProposalCreated}
            onProposalAccept={handleAcceptProposal}
            onProposalReject={handleRejectProposal}
          />
        </ErrorBoundary>
      )}

      {/* ── AI trigger button (floating, mobile only — desktop uses AIFab's own button) ── */}
      {aiEnabled && aiAvailable && !iosSafeMode && (
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
              // `lg:hidden` keeps this the mobile entry point; the hover pair
              // still matters for a narrow desktop window, where a pointer can
              // reach it. Each theme needs its own value: the fill is the same
              // violet in both, so a lone `hover:` would apply in dark mode too
              // and drag the button toward its light-mode hover.
              className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-violet-500 bg-[#AD46FF] text-white transition-colors hover:bg-[#9333EA] dark:hover:bg-[#C07CFF] lg:hidden"
            >
              <IconSparkles size={20} strokeWidth={2} />
            </m.button>
          )}
        </AnimatePresence>
      )}

      {/* ── AI review — the gate between a parsed action and the schedule ── */}
      {aiEnabled && pendingAIAction && (
        <AIReviewSheet
          open={pendingAIAction !== null}
          action={pendingAIAction}
          schedule={schedule}
          onCancel={() => setPendingAIAction(null)}
          onConfirm={(reviewed) => { setPendingAIAction(null); applyReviewedAction(reviewed); }}
        />
      )}

      {/* ── AI onboarding — shown once when app opens ─────────────────────── */}
      {aiEnabled && !iosSafeMode && <AIOnboarding onOpenAISettings={() => setActiveTab(7)} />}

      {/* ── Per-tab guided tour — short, skippable, once per device ───────── */}
      {activeTourId && (
        <CoachMarks open={tour.open} steps={TOUR_STEPS[activeTourId]} onFinish={tour.finish} />
      )}

    </main>
  );
}
