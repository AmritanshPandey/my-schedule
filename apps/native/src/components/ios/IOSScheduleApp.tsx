import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import { useColorScheme } from 'nativewind';
import {
  IconAlertCircle,
  IconCalendar,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardData,
  IconClipboardList,
  IconEdit,
  IconFlame,
  IconNotes,
  IconPhoto,
  IconPlus,
  IconRepeat,
  IconSettings,
  IconTargetArrow,
  IconTemplate,
  IconTrash,
} from '@tabler/icons-react-native';
import type { DayKey, MetricEntry, Milestone, Note, Plan, ProgressTracker, Ritual, Schedule, Task, TaskTypeValue, TrackerCadence } from '@planr/core/lib/scheduleTypes';
import { DAYS, DAY_FULL_LABELS, DAY_LABELS } from '@planr/core/lib/scheduleConstants';
import { resetStaleCompletions } from '@planr/core/lib/scheduleNormalize';
import { categoryHex, resolveAccentColor } from '@planr/core/lib/colorSystem';
import { canDeleteCategory, categoryUsageCounts, ensureCategoryIn } from '@planr/core/lib/taskCategories';
import { categoriesById, taskIdentity } from '@planr/core/lib/taskIdentity';
import { constrainTaskToPlanWindow } from '@planr/core/lib/planTaskWindow';
import { selectTodayTasks } from '@planr/core/lib/todayTasks';
import { formatDate, formatDayNoteLabel, localISODate, todayISO } from '@planr/core/lib/dateUtils';
import { quickAmountsForUnit } from '@planr/core/lib/quickAmounts';
import { sumEntriesForDate } from '@planr/core/lib/metricEntries';
import {
  addSubtaskToTasks,
  applyTaskDelete,
  clearDay,
  clearTaskException,
  createTask,
  createTaskDeleteSnapshot,
  duplicateDay,
  getSlots,
  removeTaskSlot,
  setTaskException,
  sortTasksByTime,
  summarizeDayClear,
  swapDays,
  uid,
  updateTaskDays,
  updateTaskPerDay,
  type TaskRemovalScope,
} from '@planr/core/lib/taskMutations';
import { findMergePairs, mergeTasks, unmergeTask } from '@planr/core/lib/taskMerge';
import {
  completionForDate,
  getTaskSubtaskSummary,
  isTaskCompleted,
  isTaskResolved,
  isTrackedTask,
  markTaskMissed,
  snoozeTaskLater,
  toggleSlotComplete,
  toggleSubtaskComplete,
  toggleTaskFromCheckbox,
} from '@planr/core/lib/taskCompletion';
import { diffException, isTaskScheduledOn, occurrenceNote, resolveOccurrence } from '@planr/core/lib/taskOccurrence';
import { validateDatedTasks } from '@planr/core/lib/scheduleRules';
import { applyTemplate, type Template } from '@planr/core/lib/templates';
import { cascadeMilestoneDates, moveMilestone, normalizeMilestoneTimeline } from '@planr/core/lib/roadmapDates';
import {
  appendRitualLog,
  markRitualDone,
  removeRitualLog,
  toggleRitualCompletion,
  toggleRitualStep,
  undoLastRitualLog,
  unmarkRitualDone,
} from '@planr/core/lib/ritualCompletions';
import { deleteGoal } from '@planr/core/lib/goalMutations';
import { togglePlanPaused } from '@planr/core/lib/planLifecycle';
import { dismissAllAttention, dismissAttentionKey, dismissibleCount } from '@planr/core/lib/attentionDismissal';
import { applyAdaptation } from '@planr/core/lib/milestoneAdaptation';
import { calculateMilestoneState, type MilestoneState } from '@planr/core/lib/milestoneHealth';
import { unlinkEverywhere } from '@planr/core/lib/milestoneLinks';
import { formatDisplayTime, inputToDisplayTime, minutesToInputTime, parseTimeToMinutes, toScheduleDayMinutes } from '@planr/core/lib/timeUtils';
import { calculateExecutionStreak } from '@planr/core/lib/consistency/calculateExecutionStreak';
import { completedRitualIdsOn } from '@planr/core/lib/consistency/ritualDayStatus';
import { computeExecutionTrend } from '@planr/core/lib/executionAnalytics';
import { selectNeedsAttention, type MissedTask } from '@planr/core/lib/needsAttention';
import { rescheduleMissedTaskOnce, acknowledgeMiss } from '@planr/core/lib/missedRecovery';
import { TOUR_STEPS, type CoachMarkStep, type TourId } from '@planr/core/lib/onboarding/tours';
import { useScheduleDB } from '../../lib/useScheduleDB';
import { useReminders } from '../../lib/useReminders';
import { useNowMinutes } from '../../lib/timeline/useNowMinutes';
import { useCoachTour } from '../../lib/onboarding/useCoachTour';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useModalTurn } from '../../lib/modalTurn';
import { haptic } from '../../lib/haptics';
import { storage } from '../../storage/mmkv';
import { ErrorBoundary } from '../ErrorBoundary';
import { CARD } from '../ui/surfaces';
import { Glass, isLiquidGlassSupported } from '../ui/Glass';
import { Icon, type TablerIcon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { SECTION_ICONS } from '../SectionIcons';
import IOSBottomNav from './IOSBottomNav';
import IOSTimelineRow from './IOSTimelineRow';
import IOSMergedTimelineRow from './IOSMergedTimelineRow';
import SignInPrompt from '../auth/SignInPrompt';
import DayActionsSheet from '../DayActionsSheet';
import NeedsAttentionCard from '../NeedsAttentionCard';
import CheckInsDueCard from '../tracking/CheckInsDueCard';
import MissedTaskSheet from '../MissedTaskSheet';
import QuickRetimeSheet, { type QuickRetimeTarget } from '../QuickRetimeSheet';
import { TaskSheet, type TaskSaveData } from '../task/TaskSheet';
import type { MilestoneSaveData } from '../plan/MilestoneSheet';
import type { CategoryDraft } from '../category/CategorySheet';
import AddPlanSheet from '../plan/AddPlanSheet';
import EditPlanSheet from '../plan/EditPlanSheet';
import PlanDetailView from '../plan/PlanDetailView';
import AdaptMilestoneSheet from '../plan/AdaptMilestoneSheet';
import GoalListSheet from '../goal/GoalListSheet';
import RitualView from '../activity/RitualView';
import { RitualSheet } from '../activity/RitualSheet';
import RoutineDetailView from '../activity/RoutineDetailView';
import TaskDetailView from '../activity/TaskDetailView';
import TrackingView from '../tracking/TrackingView';
import { SettingsView } from '../SettingsView';
import DayWallpaperSheet from '../DayWallpaperSheet';
import { TemplatesSheet } from '../TemplatesSheet';
import NotesView, { type CreateTaskFromNoteInput } from '../notes/NotesView';
import AddEntryModal from '../AddEntryModal';
import CoachMarks from '../onboarding/CoachMarks';
import TourTarget from '../onboarding/TourTarget';

/**
 * Native port of components/ios/IOSScheduleApp.tsx — the phone shell: one
 * state-driven tree (tabs, the plan / task / routine detail pages, every
 * sheet), the same handlers as the web shell (each a straight copy, so a
 * change to one is a deliberate change to the other), the same @planr/core
 * mutations, the same toast-with-Undo.
 *
 * Out of scope on native, as decided for the port: the on-device AI tab
 * (Settings simply has no AI entry here, exactly as on the web with AI
 * locked off) and the PWA's ?action= shortcuts and iOS boot diagnostics.
 *
 * What's native-only, and why:
 * - Android's back button walks back out of the detail pages (and Settings /
 *   Notes) the way the web's in-page back buttons do; sheets handle back
 *   themselves through their Modal.
 * - iOS can present only one root-level modal at a time, so sheets and
 *   dialogs take turns (lib/modalTurn): one that opens as another closes
 *   waits for it. Deleting a goal closes the Goals sheet before its confirm,
 *   which on the web sits on top of the sheet.
 * - While the full-screen task editor is open, the toast renders inside it.
 * - The day rollover also re-checks the date when the app returns to the
 *   foreground, since iOS suspends the midnight timer in the background.
 */

const JS_DAYS: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const SETUP_DISMISSED_KEY = 'planr-getting-started-dismissed';

/** The shared tours, minus the AI plan draft the native app doesn't offer. */
const NATIVE_TOUR_STEPS: Record<TourId, CoachMarkStep[]> = {
  ...TOUR_STEPS,
  plans: TOUR_STEPS.plans.map((step) =>
    step.target === 'new-item-button' ? { ...step, body: 'Build one from scratch, or start from an example template.' } : step,
  ),
};

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

type ToastState = { message: string; actionLabel?: string; onAction?: () => void };

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
  if (minutes <= 0) return '0m';
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

type HeaderAction = {
  icon: TablerIcon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  /** Coach-mark target id, when a tour step points at this action. */
  tour?: string;
};

function IOSHeader({
  title,
  onBack,
  actions,
  onSettings,
  onNotes,
}: {
  title: string;
  onBack?: () => void;
  actions?: HeaderAction[];
  onSettings?: () => void;
  onNotes?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  // iOS 26+: no bar. Content scrolls up under a fade of the page color, and
  // the controls float on liquid glass, the way the system's own navigation
  // bars do. Older systems keep the solid bar.
  const glass = isLiquidGlassSupported;
  const titleClass = 'truncate text-[16px] font-semibold leading-none text-neutral-950 dark:text-white';
  const shapeClass = `items-center justify-center ${glass ? 'h-11 w-11 rounded-full' : 'h-10 w-10 rounded-xl'}`;
  const buttonClass = `${shapeClass} ${glass ? 'active:bg-black/[0.06] dark:active:bg-white/[0.1]' : 'active:bg-neutral-200/70 dark:active:bg-white/[0.07]'}`;
  // On glass the icons sit on a moving backdrop, so they take full ink.
  const iconClass = glass ? 'text-neutral-800 dark:text-neutral-100' : 'text-neutral-500 dark:text-neutral-400';
  const page = colorScheme === 'dark' ? '#0E0E0E' : '#F3F4F1';

  const actionButtons = actions?.length ? (
    actions.map((action) => {
      const button = (
        <Pressable
          key={action.label}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onClick}
          hitSlop={2}
          className={action.destructive ? `${shapeClass} active:bg-rose-500/10` : buttonClass}
        >
          <Icon icon={action.icon} size={21} strokeWidth={2} className={iconClass} />
        </Pressable>
      );
      return action.tour ? (
        <TourTarget key={action.label} id={action.tour}>
          {button}
        </TourTarget>
      ) : (
        button
      );
    })
  ) : (
    <>
      {onNotes && (
        <Pressable accessibilityRole="button" accessibilityLabel="Notes" onPress={onNotes} hitSlop={2} className={buttonClass}>
          <Icon icon={IconNotes} size={20} strokeWidth={2} className={iconClass} />
        </Pressable>
      )}
      {onSettings && (
        <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onSettings} hitSlop={2} className={buttonClass}>
          <Icon icon={IconSettings} size={20} strokeWidth={2} className={iconClass} />
        </Pressable>
      )}
    </>
  );
  const hasActions = Boolean(actions?.length || onNotes || onSettings);

  return (
    <View
      className={`absolute inset-x-0 top-0 z-30 px-4 pb-2 ${
        glass ? '' : 'border-b border-neutral-200/80 bg-[#F3F4F1]/95 dark:border-white/[0.08] dark:bg-[#0E0E0E]/95'
      }`}
      style={{ paddingTop: insets.top + 10 }}
    >
      {glass && (
        // Solid under the status bar and title, then gone: titles stay legible
        // while the page reads as one continuous surface.
        <LinearGradient
          pointerEvents="none"
          colors={[page, page, `${page}00`]}
          locations={[0, 0.6, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: -16 }}
        />
      )}
      <View className="h-12 flex-row items-center justify-between gap-3">
        <View className="min-w-0 shrink">
          {onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Back from ${title}`} onPress={onBack} className={`min-h-[44px] flex-row items-center ${glass ? 'gap-2.5' : '-ml-1.5 gap-1'}`}>
              {glass ? (
                <Glass className="h-11 w-11 items-center justify-center rounded-full">
                  <Icon icon={IconChevronLeft} size={22} strokeWidth={2} className="text-neutral-900 dark:text-white" />
                </Glass>
              ) : (
                <Icon icon={IconChevronLeft} size={24} strokeWidth={1.5} className="shrink-0 text-neutral-950 dark:text-white" />
              )}
              <Text accessibilityRole="header" className={`shrink ${titleClass}`}>
                {title}
              </Text>
            </Pressable>
          ) : (
            <Text accessibilityRole="header" className={titleClass}>
              {title}
            </Text>
          )}
        </View>
        {glass ? (
          // One capsule for the whole group, like a system toolbar — and one
          // glass layer rather than one per button.
          hasActions && <Glass className="shrink-0 flex-row items-center rounded-full">{actionButtons}</Glass>
        ) : (
          <View className="shrink-0 flex-row items-center gap-1">{actionButtons}</View>
        )}
      </View>
    </View>
  );
}

function EmptyPanel({
  icon,
  title,
  description,
  action,
  secondaryAction,
}: {
  icon: TablerIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <View className="items-center rounded-2xl border border-dashed border-neutral-200 bg-white px-5 py-8 dark:border-white/[0.10] dark:bg-neutral-900">
      <View className="mb-3 h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
        <Icon icon={icon} size={19} strokeWidth={1.8} className="text-neutral-500 dark:text-neutral-400" />
      </View>
      <Text className="text-center text-[16px] font-extrabold text-neutral-900 dark:text-white">{title}</Text>
      <Text className="mt-1 max-w-[260px] text-center text-[13px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">{description}</Text>
      {(action || secondaryAction) && (
        <View className="mt-4 flex-row items-center justify-center gap-2">
          {action && (
            <Pressable
              accessibilityRole="button"
              onPress={action.onClick}
              className="h-11 items-center justify-center rounded-full bg-neutral-950 px-4 active:scale-[0.97] dark:bg-white"
            >
              <Text className="text-[13px] font-bold text-white dark:text-neutral-950">{action.label}</Text>
            </Pressable>
          )}
          {secondaryAction && (
            <Pressable
              accessibilityRole="button"
              onPress={secondaryAction.onClick}
              className="h-11 items-center justify-center rounded-full border border-neutral-200 px-4 active:scale-[0.97] dark:border-white/[0.10]"
            >
              <Text className="text-[13px] font-bold text-neutral-600 dark:text-neutral-300">{secondaryAction.label}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function ConfirmOverlay({ state, onClose }: { state: ConfirmState; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const turn = useModalTurn(true, reducedMotion ? 60 : 350);
  return (
    <Modal visible={turn} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View className="flex-1 justify-end bg-black/30 px-3" style={{ paddingBottom: Math.max(12, insets.bottom) }}>
        <View accessibilityViewIsModal className="w-full rounded-2xl border border-neutral-200 bg-white p-5 dark:border-white/[0.10] dark:bg-neutral-900">
          <View className="mb-4 flex-row items-start gap-3">
            <View
              className={`mt-0.5 h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                state.destructive ? 'bg-rose-100 dark:bg-rose-500/15' : 'bg-neutral-100 dark:bg-white/[0.07]'
              }`}
            >
              <Icon
                icon={IconAlertCircle}
                size={18}
                strokeWidth={2.2}
                className={state.destructive ? 'text-rose-600 dark:text-rose-300' : 'text-neutral-500 dark:text-neutral-300'}
              />
            </View>
            <View className="min-w-0 flex-1">
              <Text accessibilityRole="header" className="text-[17px] font-black text-neutral-950 dark:text-white">
                {state.title}
              </Text>
              <Text className="mt-1 text-[14px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">{state.description}</Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              className="h-11 flex-1 items-center justify-center rounded-full border border-neutral-200 active:bg-neutral-50 dark:border-white/[0.10] dark:active:bg-white/[0.05]"
            >
              <Text className="text-[14px] font-bold text-neutral-600 dark:text-neutral-300">Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                state.onConfirm();
                onClose();
              }}
              className={`h-11 flex-1 items-center justify-center rounded-full active:opacity-90 ${state.destructive ? 'bg-rose-600' : 'bg-neutral-950 dark:bg-white'}`}
            >
              <Text className={`text-[14px] font-bold ${state.destructive ? 'text-white' : 'text-white dark:text-neutral-950'}`}>{state.confirmLabel ?? 'Confirm'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function readSetupDismissed(): boolean {
  try {
    return storage.getString(SETUP_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function IOSScheduleApp() {
  const insets = useSafeAreaInsets();
  const { schedule, setSchedule, ready, clearData, clearProgress, restoreData, undo } = useScheduleDB();
  useReminders(schedule, ready);
  // The calendar date drives the rollover (not just the weekday, so a week
  // spent backgrounded still rolls over); todayKey is derived from it.
  const [todayDate, setTodayDate] = useState(() => todayISO());
  const todayKey: DayKey = JS_DAYS[new Date(`${todayDate}T00:00:00`).getDay()];
  const [activeDay, setActiveDay] = useState<DayKey>(() => JS_DAYS[new Date().getDay()]);
  const [dayActionsOpen, setDayActionsOpen] = useState(false);
  /** The weekday awaiting a "clear day" confirmation, or null. */
  const [dayClearRequest, setDayClearRequest] = useState<DayKey | null>(null);
  const [missedSheet, setMissedSheet] = useState<MissedTask | null>(null);
  const [quickRetimeTarget, setQuickRetimeTarget] = useState<(QuickRetimeTarget & { day: DayKey; dateISO: string }) | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // Today tab starts as a clean execution surface; editing affordances (per-card
  // pencil, day actions, wallpaper, add-task) are revealed only in edit mode.
  const [todayEditMode, setTodayEditMode] = useState(false);
  // Drives the timeline "in progress" ring on today's list.
  const nowMinutes = useNowMinutes();
  const [activeTab, setActiveTab] = useState(4);

  // A short, skippable coach-mark tour per tab. Overview (4) and Settings (5)
  // intentionally have no entry in TOUR_STEPS — see lib/onboarding/tours.ts.

  const [iosSetupDismissed, setIosSetupDismissed] = useState(readSetupDismissed);
  const dismissIosSetup = useCallback(() => {
    setIosSetupDismissed(true);
    try {
      storage.set(SETUP_DISMISSED_KEY, '1');
    } catch {
      // storage unavailable — dismissal just won't persist
    }
  }, []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [wallpaperOpen, setWallpaperOpen] = useState(false);
  const [taskSheetMode, setTaskSheetMode] = useState<'create' | 'edit'>('create');
  const [taskSheetTask, setTaskSheetTask] = useState<Task | null>(null);
  const [taskSheetPlanId, setTaskSheetPlanId] = useState<string | null>(null);
  const [taskSheetDateISO, setTaskSheetDateISO] = useState('');
  const [taskSheetInitialType, setTaskSheetInitialType] = useState<TaskTypeValue>('task');
  const [addingPlan, setAddingPlan] = useState(false);
  const [goalsSheetOpen, setGoalsSheetOpen] = useState(false);
  const [adaptingMilestoneId, setAdaptingMilestoneId] = useState<string | null>(null);
  // Resolved from the live schedule rather than captured at open time, so the
  // sheet reflects any edit made underneath it.
  const adaptingMilestone = adaptingMilestoneId ? (schedule.milestones ?? []).find((m) => m.id === adaptingMilestoneId) ?? null : null;
  const adaptingMilestonePlan = adaptingMilestone ? schedule.plans.find((p) => p.id === adaptingMilestone.planId) ?? null : null;

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
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const toast = toastState?.message ?? null;
  /**
   * Accepts a bare string, or a shape with an action so a destructive change
   * can offer "Undo".
   */
  const setToast = useCallback((next: string | ToastState | null) => {
    setToastState(next === null ? null : typeof next === 'string' ? { message: next } : next);
  }, []);
  const [initialNoteId, setInitialNoteId] = useState<string | null>(null);

  const activeTourId: TourId | null =
    activeTab === 0 ? 'today' : activeTab === 1 ? 'plans' : activeTab === 2 ? 'routine' : activeTab === 8 ? 'tracking' : null;
  // A tour points at the tab's page, so it waits while a sheet, dialog or
  // detail page covers it — e.g. "Add plan" from the create menu opens the
  // Plans tab and its sheet together. (The web shell starts it on the tab alone.)
  const pageCovered =
    !!selectedPlanId ||
    !!subtasksRef ||
    !!detailRitualId ||
    taskSheetOpen ||
    addingPlan ||
    !!editingPlanId ||
    !!entryTracker ||
    goalsSheetOpen ||
    !!adaptingMilestoneId ||
    ritualAddOpen ||
    !!editRitualId ||
    templatesOpen ||
    wallpaperOpen ||
    !!missedSheet ||
    !!quickRetimeTarget ||
    dayActionsOpen ||
    !!confirmState ||
    !!taskDeleteRequest ||
    !!dayClearRequest;
  const tour = useCoachTour(activeTourId ?? 'none', { enabled: activeTourId !== null && !pageCovered, delayMs: 1200 });
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;

  useEffect(() => {
    if (!ready) return;
    // stamp: false — this is deterministic housekeeping both devices compute
    // identically from the date. Recording it as an edit would let a device
    // that was merely left open outrank one that actually did work.
    setSchedule((prev) => resetStaleCompletions(prev, todayDate), { stamp: false });
  }, [todayDate, ready, setSchedule]);

  useEffect(() => {
    const current = todayISO();
    if (todayDate !== current) {
      setTodayDate(current);
      return;
    }
    const now = new Date();
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
    const id = setTimeout(() => setTodayDate(todayISO()), msUntilMidnight);
    return () => clearTimeout(id);
  }, [todayDate]);

  // iOS suspends JS timers in the background, so the midnight timer above
  // can't be relied on across a night away — re-check on every foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setTodayDate(todayISO());
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(id);
  }, [toastState, toast, setToast]);

  const plansById = useMemo(() => new Map(schedule.plans.map((plan) => [plan.id, plan])), [schedule.plans]);

  // Every milestone's success-metric tracker, keyed by tracker id, with its
  // live health/pace already computed — the Tracking tab's view of the same
  // relationship PlanDetailView shows. The still-relevant, earliest-in-roadmap
  // milestone wins when a tracker gates several.
  const milestoneByTrackerId = useMemo(() => {
    const map = new Map<string, { milestone: Milestone; state: MilestoneState }>();
    for (const m of schedule.milestones ?? []) {
      const trackerId = m.linkedTrackers?.[0];
      if (!trackerId) continue;
      const existing = map.get(trackerId);
      if (existing) {
        const existingDone = existing.milestone.status === 'completed';
        const candidateDone = m.status === 'completed';
        const candidateIsBetter = existingDone
          ? !candidateDone || m.sortOrder < existing.milestone.sortOrder
          : !candidateDone && m.sortOrder < existing.milestone.sortOrder;
        if (!candidateIsBetter) continue;
      }
      const plan = plansById.get(m.planId);
      if (!plan) continue;
      map.set(trackerId, {
        milestone: m,
        state: calculateMilestoneState({
          milestone: m,
          plan,
          activities: schedule.activities,
          trackers: schedule.progressTrackers,
          metricEntries: schedule.metricEntries,
          trackingStart: schedule.preferences?.startDate,
          milestones: schedule.milestones,
          rituals: schedule.rituals,
          ritualCompletions: schedule.ritualCompletions,
        }),
      });
    }
    return map;
  }, [schedule.milestones, plansById, schedule.activities, schedule.progressTrackers, schedule.metricEntries, schedule.preferences?.startDate, schedule.rituals, schedule.ritualCompletions]);

  function performDayClear() {
    if (!dayClearRequest) return;
    const label = DAY_FULL_LABELS[dayClearRequest];
    const { total } = summarizeDayClear(schedule, dayClearRequest);
    setSchedule(clearDay(dayClearRequest));
    setDayClearRequest(null);
    haptic('medium');
    // One undo entry, because clearDay is a single updater — so "Undo"
    // restores the whole day rather than the last task of it.
    setToast({
      message: `Cleared ${total} ${total === 1 ? 'task' : 'tasks'} from ${label}`,
      actionLabel: 'Undo',
      onAction: () => {
        undo();
        setToast(null);
        haptic('light');
      },
    });
  }

  /** One-tap increment from the Tracking page — just another entry on today's date. */
  const handleLogTrackerAmount = useCallback(
    (trackerId: string, planId: string, value: number) => {
      setSchedule((prev) => ({
        ...prev,
        metricEntries: [...prev.metricEntries, { id: uid(), planId, trackerId, value, date: todayISO() }],
      }));
    },
    [setSchedule],
  );

  const handleDeleteEntry = useCallback(
    (entryId: string) => {
      setSchedule((prev) => ({
        ...prev,
        metricEntries: prev.metricEntries.filter((entry) => entry.id !== entryId),
      }));
    },
    [setSchedule],
  );

  /** Persist a category created from inside the task sheet; returns its id. */
  const handleCreateCategory = useCallback(
    (draft: CategoryDraft) => {
      const id = `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      setSchedule((prev) => ({ ...prev, categories: [...prev.categories, { id, ...draft }] }));
      return id;
    },
    [setSchedule],
  );

  const categoryUsage = useMemo(() => categoryUsageCounts(schedule.activities), [schedule.activities]);
  const handleUpdateCategory = useCallback(
    (id: string, draft: CategoryDraft) => {
      setSchedule((prev) => ({
        ...prev,
        categories: prev.categories.map((c) => (c.id === id ? { ...c, ...draft } : c)),
      }));
    },
    [setSchedule],
  );

  // Refuses when the category is still in use — the picker disables the button
  // for the same reason, this is the guard behind it.
  const handleDeleteCategory = useCallback(
    (id: string) => {
      setSchedule((prev) => {
        if (!canDeleteCategory(id, categoryUsageCounts(prev.activities))) return prev;
        return { ...prev, categories: prev.categories.filter((c) => c.id !== id) };
      });
    },
    [setSchedule],
  );

  const categoryMap = useMemo(() => categoriesById(schedule.categories), [schedule.categories]);

  const taskEffectiveItemCount = useCallback(
    (task: Task) => {
      const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
      return getTaskSubtaskSummary(task, linkedPlan).totalCount;
    },
    [plansById],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset, todayDate]);
  const weekLabel = weekDates[2].date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const activeDateISO = useMemo(() => {
    const found = weekDates.find((item) => item.day === activeDay);
    return found ? localISODate(found.date) : todayISO();
  }, [activeDay, weekDates]);
  const isViewingToday = activeDateISO === todayISO();

  const dayTasks = useMemo(() => sortTasksByTime(schedule.activities[activeDay] ?? []), [schedule.activities, activeDay]);
  const dayTasksView = useMemo(
    () =>
      dayTasks
        .filter((task) => isTaskScheduledOn(task, activeDateISO, true, schedule.preferences?.startDate))
        .map((task) => {
          const resolved = resolveOccurrence(task, activeDateISO);
          return isViewingToday ? resolved : { ...resolved, ...completionForDate(task, activeDateISO) };
        }),
    [activeDateISO, dayTasks, isViewingToday, schedule.preferences?.startDate],
  );
  // Shared with the desktop dashboard so the two cards can't drift.
  const { tasks: todayTasks, done: todayDone } = useMemo(() => selectTodayTasks(schedule, todayISO(), todayKey), [schedule, todayKey]);
  const selectedPlan = selectedPlanId ? plansById.get(selectedPlanId) ?? null : null;
  const taskSheetActiveDays = useMemo(() => {
    if (taskSheetMode !== 'edit' || !taskSheetTask) return [activeDay];
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

  // Counts cover tracked work only. dayTasksView keeps commitments — it drives
  // the rendered day list, which does show them.
  const dayTracked = useMemo(() => dayTasksView.filter(isTrackedTask), [dayTasksView]);
  const dayDone = dayTracked.filter((task) => isTaskCompleted(task, taskEffectiveItemCount(task))).length;
  const todayOpenTasks = useMemo(() => todayTasks.filter((task) => !isTaskResolved(task, taskEffectiveItemCount(task))), [todayTasks, taskEffectiveItemCount]);
  const remainingPlannedMinutes = useMemo(() => todayOpenTasks.reduce((sum, task) => sum + taskDurationMinutes(task), 0), [todayOpenTasks]);
  const dashboardProgressPct = todayTasks.length > 0 ? Math.round((todayDone / todayTasks.length) * 100) : 0;
  const executionStreak = useMemo(() => calculateExecutionStreak(schedule, todayISO()), [schedule]);
  const missedThisWeek = useMemo(() => computeExecutionTrend(schedule).currentMissed, [schedule]);
  const needsAttention = useMemo(() => {
    // trackingType-aware — a half-logged quantity routine must still count as
    // unfinished here, or its at-risk warning is silently suppressed.
    const doneRitualIds = completedRitualIdsOn(schedule.rituals ?? [], schedule.ritualCompletions ?? [], todayISO());
    return selectNeedsAttention(schedule, todayISO(), todayKey, doneRitualIds);
  }, [schedule, todayKey]);
  const openConfirm = useCallback((state: ConfirmState) => setConfirmState(state), []);

  function openCreateSheet(initialPlanId?: string | null, initialType: TaskTypeValue = 'task') {
    setTaskSheetPlanId(initialPlanId ?? null);
    setTaskSheetTask(null);
    setTaskSheetMode('create');
    setTaskSheetDateISO('');
    setTaskSheetInitialType(initialType);
    setTaskSheetOpen(true);
  }

  const openEditSheet = useCallback(
    (task: Task, dateISO?: string) => {
      const template = DAYS.flatMap((day) => scheduleRef.current.activities[day] ?? []).find((item) => item.id === task.id) ?? task;
      setTaskSheetTask(template);
      setTaskSheetPlanId(template.planId);
      setTaskSheetDateISO(dateISO ?? activeDateISO);
      setTaskSheetInitialType(template.taskType ?? 'task');
      setTaskSheetMode('edit');
      setTaskSheetOpen(true);
    },
    [activeDateISO],
  );

  function closeTaskSheet() {
    setTaskSheetOpen(false);
    setTaskSheetTask(null);
    setTaskSheetPlanId(null);
    setTaskSheetDateISO('');
  }

  function handleTaskSheetSave(data: TaskSaveData) {
    if (data.taskId && data.scope === 'occurrence' && taskSheetDateISO && taskSheetTask) {
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
        [day]: (prev.activities[day] ?? []).map((task) => (task.id === taskId ? { ...task, ...toggleTaskFromCheckbox(task, allSubtaskIds) } : task)),
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
        [day]: (prev.activities[day] ?? []).map((task) => (task.id === taskId ? { ...task, ...markTaskMissed(task, allSubtaskIds) } : task)),
      },
    }));
  }

  /** Push a task to the next free slot later today. */
  function handleSnoozeTaskLater(taskId: string, day: DayKey = activeDay, dateISO?: string) {
    // Only today is editable — deferring a past/future occurrence is meaningless.
    if (dateISO && dateISO !== todayISO()) return;
    const task = (schedule.activities[day] ?? []).find((t) => t.id === taskId);
    if (!task) return;
    const patch = snoozeTaskLater(task);
    // No room left later today — say so rather than silently doing nothing.
    if (!patch.startTime) {
      haptic('light');
      setToast('No room left today — try tomorrow');
      return;
    }
    haptic('medium');
    setSchedule((prev) => ({
      ...prev,
      activities: {
        ...prev.activities,
        [day]: (prev.activities[day] ?? []).map((t) => (t.id === taskId ? { ...t, ...patch } : t)),
      },
    }));
    setToast(`Moved to ${formatDisplayTime(patch.startTime)}`);
  }

  /** Mark this date's occurrence skipped (or restore it). */
  function handleSkipOccurrence(taskId: string, dateISO?: string) {
    const date = dateISO ?? todayISO();
    const isSkipped = DAYS.some((day) => (schedule.activities[day] ?? []).some((t) => t.id === taskId && t.exceptions?.[date]?.skipped));
    haptic('medium');
    // `{ skipped: false }` un-skips while preserving any other per-date edits.
    setSchedule(setTaskException(taskId, date, { skipped: !isSkipped }));
    setToast(isSkipped ? 'Restored this day' : 'Skipped this day');
  }

  /** Writes `note` rather than the per-date `description` override (same as the web). */
  function handleSaveDayNote(taskId: string, note: string, dateISO?: string) {
    haptic('light');
    setSchedule(setTaskException(taskId, dateISO ?? todayISO(), { note }));
  }

  function requestDeleteTask(taskId: string, sourceDay: DayKey = activeDay) {
    setTaskDeleteRequest({ taskId, sourceDay });
  }

  /**
   * Removal scopes only — the confirm overlay is a single-choice dialog, and
   * the dated skip lives on the task detail page ("Skip this day").
   */
  function performTaskDelete(scope: TaskRemovalScope) {
    if (!taskDeleteDetails) return;
    const snapshot = createTaskDeleteSnapshot(schedule, taskDeleteDetails.task.id, taskDeleteDetails.sourceDay, scope);
    setSchedule(applyTaskDelete(snapshot));
    setTaskDeleteRequest(null);
    setToast(`Deleted "${taskDeleteDetails.task.title}"`);
  }

  function handleAddRitual(data: Omit<Ritual, 'id'>) {
    setSchedule((prev) => ({
      ...prev,
      rituals: [...(prev.rituals ?? []), { ...data, id: uid() }],
    }));
  }

  function handleUpdateRitual(id: string, data: Omit<Ritual, 'id'>) {
    setSchedule((prev) => ({
      ...prev,
      rituals: (prev.rituals ?? []).map((ritual) => (ritual.id === id ? { ...ritual, ...data, id } : ritual)),
    }));
  }

  function handleDeleteRitual(id: string) {
    const ritual = (schedule.rituals ?? []).find((item) => item.id === id);
    openConfirm({
      title: 'Delete routine?',
      description: ritual?.title ? `"${ritual.title}" will be removed from your daily practice.` : 'This routine will be removed from your daily practice.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () =>
        setSchedule((prev) => ({
          ...prev,
          rituals: (prev.rituals ?? []).filter((item) => item.id !== id),
          ritualCompletions: (prev.ritualCompletions ?? []).filter((item) => item.ritualId !== id),
          // A deleted routine can't advance anything — drop it from every milestone.
          milestones: unlinkEverywhere(prev.milestones, 'ritual', id),
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

  function handleMarkRitualDone(ritualId: string, dateISO: string, followed: number) {
    setSchedule((prev) => ({
      ...prev,
      ritualCompletions: markRitualDone(prev.ritualCompletions ?? [], ritualId, dateISO, followed),
    }));
  }

  function handleUnmarkRitualDone(ritualId: string, dateISO: string) {
    setSchedule((prev) => ({
      ...prev,
      ritualCompletions: unmarkRitualDone(prev.ritualCompletions ?? [], ritualId, dateISO),
    }));
  }

  function handleSetTrackerCadence(trackerId: string, cadence: TrackerCadence) {
    setSchedule((prev) => ({
      ...prev,
      progressTrackers: prev.progressTrackers.map((t) => (t.id === trackerId ? { ...t, cadence } : t)),
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
      title: 'Delete plan?',
      description: plan?.title ? `"${plan.title}" and its linked tasks, trackers, and entries will be deleted.` : 'This plan and linked data will be deleted.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        setSchedule((prev) => ({
          ...prev,
          plans: prev.plans.filter((item) => item.id !== planId),
          activities: Object.fromEntries(DAYS.map((day) => [day, prev.activities[day].filter((task) => task.planId !== planId)])) as Schedule['activities'],
          metricEntries: prev.metricEntries.filter((item) => item.planId !== planId),
          progressTrackers: prev.progressTrackers.filter((item) => item.planId !== planId),
          milestones: prev.milestones.filter((item) => item.planId !== planId),
        }));
        setSelectedPlanId((current) => (current === planId ? null : current));
      },
    });
  }

  /**
   * Clear every row on "Needs attention" — dismissal only, so analytics stay
   * honest. The undo restores `preferences` wholesale.
   */
  function handleClearAttention() {
    const cleared = dismissibleCount(needsAttention);
    if (cleared === 0) return;
    const previous = schedule.preferences;
    setSchedule((prev) => dismissAllAttention(prev, needsAttention, todayISO()));
    setToast({
      message: `Cleared ${cleared} item${cleared === 1 ? '' : 's'}`,
      actionLabel: 'Undo',
      onAction: () => setSchedule((prev) => ({ ...prev, preferences: previous })),
    });
  }

  /**
   * Save from the quick retime sheet — a per-date exception, diffed against
   * the raw template so an edit that matches it writes no exception at all.
   */
  function handleQuickRetime(taskId: string, startTime: string, endTime: string) {
    if (!quickRetimeTarget) return;
    const { day, dateISO } = quickRetimeTarget;
    const raw = (schedule.activities[day] ?? []).find((t) => t.id === taskId);
    if (!raw) return;
    const patch = diffException(raw, {
      startTime: inputToDisplayTime(startTime),
      endTime: inputToDisplayTime(endTime),
    });
    if (Object.keys(patch).length === 0) return;
    setSchedule(setTaskException(taskId, dateISO, patch));
    setToast({
      message: 'Time updated',
      actionLabel: 'Undo',
      onAction: () => {
        undo();
        haptic('light');
      },
    });
  }

  function handleApplyTemplate(template: Template) {
    setSchedule(applyTemplate(template));
    setSelectedPlanId(null);
    setActiveTab(1); // Plans tab
  }

  function handleDismissAttentionOne(key: string) {
    const previous = schedule.preferences;
    setSchedule((prev) => dismissAttentionKey(prev, key, todayISO()));
    setToast({
      message: 'Dismissed',
      actionLabel: 'Undo',
      onAction: () => setSchedule((prev) => ({ ...prev, preferences: previous })),
    });
  }

  function handleDeleteGoal(goalId: string) {
    const goal = schedule.goals?.find((item) => item.id === goalId);
    openConfirm({
      title: 'Delete goal?',
      description: goal?.title
        ? `"${goal.title}" will be deleted. Linked plans are kept — they'll just no longer be tied to this goal.`
        : 'This goal will be deleted. Linked plans are kept.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => setSchedule((prev) => deleteGoal(prev, goalId)),
    });
  }

  function handleDeleteLinkedTask(task: Task, activeDays: DayKey[]) {
    requestDeleteTask(task.id, activeDays[0] ?? activeDay);
  }

  function handleDeleteTaskSlot(task: Task, day: DayKey, slotIndex: number) {
    setSchedule(removeTaskSlot(task.id, day, slotIndex));
    haptic('medium');
    setToast('Time block removed');
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
      title: 'Delete milestone?',
      description: milestone?.title ? `"${milestone.title}" will be removed from the roadmap.` : 'This milestone will be removed from the roadmap.',
      confirmLabel: 'Delete',
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

  function handleMoveMilestone(id: string, direction: 'up' | 'down') {
    setSchedule((prev) => {
      const existing = (prev.milestones ?? []).find((item) => item.id === id);
      if (!existing) return prev;
      const plan = prev.plans.find((item) => item.id === existing.planId);
      const other = (prev.milestones ?? []).filter((item) => item.planId !== existing.planId);
      const own = (prev.milestones ?? []).filter((item) => item.planId === existing.planId);
      return { ...prev, milestones: [...other, ...moveMilestone(own, id, direction, plan?.startDate)] };
    });
  }

  function handleCompleteMilestone(id: string) {
    setSchedule((prev) => {
      const existing = (prev.milestones ?? []).find((item) => item.id === id);
      if (!existing) return prev;
      const plan = prev.plans.find((item) => item.id === existing.planId);
      const other = (prev.milestones ?? []).filter((item) => item.planId !== existing.planId);
      const own = (prev.milestones ?? [])
        .filter((item) => item.planId === existing.planId)
        .map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'completed' as const,
                actualCompletedDate: todayISO(),
                completionStatus: 'completed' as const,
                completedDate: todayISO(),
                updatedAt: new Date().toISOString(),
              }
            : item,
        );
      return { ...prev, milestones: [...other, ...normalizeMilestoneTimeline(own, plan?.startDate)] };
    });
  }

  function handleCreateNote(input: Partial<Pick<Note, 'title' | 'body' | 'tags'>> = {}) {
    const now = new Date().toISOString();
    const note: Note = { id: uid(), title: input.title ?? '', body: input.body ?? '', tags: input.tags ?? [], createdAt: now, updatedAt: now };
    setSchedule((prev) => ({ ...prev, notes: [note, ...(prev.notes ?? [])] }));
    return note.id;
  }

  function handleUpdateNote(id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'pinned' | 'tags' | 'linkedTaskIds' | 'linkedPlanIds'>>) {
    setSchedule((prev) => ({ ...prev, notes: (prev.notes ?? []).map((note) => (note.id === id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note)) }));
  }

  function handleDeleteNote(id: string) {
    setSchedule((prev) => ({ ...prev, notes: (prev.notes ?? []).filter((note) => note.id !== id) }));
  }

  const handleInitialNoteOpened = useCallback(() => setInitialNoteId(null), []);

  const notesLinkableTasks = useMemo(() => {
    const byId = new Map<string, Task>();
    for (const day of DAYS) for (const task of schedule.activities[day] ?? []) if (!byId.has(task.id)) byId.set(task.id, task);
    return Array.from(byId.values());
  }, [schedule.activities]);

  function handleCreateTaskFromNote(input: CreateTaskFromNoteInput): string | undefined {
    const current = scheduleRef.current;
    const note = current.notes.find((item) => item.id === input.noteId);
    const linkedPlanId = note?.linkedTaskIds?.map((taskId) => notesLinkableTasks.find((task) => task.id === taskId)?.planId).find(Boolean);
    const plan = current.plans.find((item) => item.id === (input.planId ?? linkedPlanId)) ?? current.plans[0];
    if (!plan) {
      setToast('Create a plan first');
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
        description: 'Created from note',
        ...quickTaskTimeRange(),
        categoryId: ensureCategoryIn(categoryDraft, plan.emoji),
        planId: plan.id,
        ...constrainTaskToPlanWindow({}, plan),
        taskType: 'task',
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
    setToast('Added to Today');
    return id;
  }

  // Android back walks out of the in-page detail views the way their own back
  // buttons do. Sheets and full-screen modals handle back themselves.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (detailRitualId) {
        setDetailRitualId(null);
        return true;
      }
      if (subtasksRef) {
        setSubtasksRef(null);
        return true;
      }
      if (selectedPlanId) {
        setSelectedPlanId(null);
        return true;
      }
      if (activeTab === 5 || activeTab === 6) {
        setActiveTab(4);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [detailRitualId, subtasksRef, selectedPlanId, activeTab]);

  const renderTaskList = (tasks: Task[], day: DayKey, dateISO: string, emptyAction?: () => void, editMode = true) => {
    // A task scheduled at several times appears as its own entry at each time —
    // expand multi-slot tasks into per-slot rows, ordered chronologically.
    const rows = tasks
      .flatMap((task) => {
        const slots = getSlots(task);
        return slots.length > 1 ? slots.map((_, i) => ({ task, slotIndex: i as number | undefined })) : [{ task, slotIndex: undefined as number | undefined }];
      })
      .sort((a, b) => {
        const at = getSlots(a.task)[a.slotIndex ?? 0]?.startTime ?? '';
        const bt = getSlots(b.task)[b.slotIndex ?? 0]?.startTime ?? '';
        const am = parseTimeToMinutes(at);
        const bm = parseTimeToMinutes(bt);
        return toScheduleDayMinutes(am ?? 0) - toScheduleDayMinutes(bm ?? 0);
      });

    // Two tasks sharing a `mergeGroupId` share one row. Only single rows keep
    // the progress-spine isCurrent/isPast treatment below.
    const mergePairs = findMergePairs(rows);
    const partnerOf = new Map<(typeof rows)[number], (typeof rows)[number]>();
    for (const [a, b] of mergePairs.values()) {
      partnerOf.set(a, b);
      partnerOf.set(b, a);
    }
    const consumedRows = new Set<(typeof rows)[number]>();
    const groupedRows: Array<{ kind: 'single'; row: (typeof rows)[number] } | { kind: 'merged'; primary: (typeof rows)[number]; partner: (typeof rows)[number] }> = [];
    for (const row of rows) {
      if (consumedRows.has(row)) continue;
      const partner = partnerOf.get(row);
      if (partner) {
        consumedRows.add(row);
        consumedRows.add(partner);
        groupedRows.push({ kind: 'merged', primary: row, partner });
      } else {
        groupedRows.push({ kind: 'single', row });
      }
    }

    // Progress spine, today only: currentKey = the row whose slot window
    // contains "now"; pastKeys = every row whose slot has already elapsed.
    const rowKeyOf = (task: Task, slotIndex?: number) => (slotIndex != null ? `${task.id}:${slotIndex}` : task.id);
    let currentKey: string | null = null;
    const pastKeys = new Set<string>();
    if (dateISO === todayISO()) {
      const nowSched = toScheduleDayMinutes(nowMinutes);
      for (const { task, slotIndex } of rows) {
        const s = getSlots(task)[slotIndex ?? 0];
        const sm = parseTimeToMinutes(s?.startTime ?? '');
        const em = parseTimeToMinutes(s?.endTime ?? '');
        if (sm == null || em == null) continue;
        const start = toScheduleDayMinutes(sm);
        let end = toScheduleDayMinutes(em);
        if (end <= start) end += 24 * 60; // spans midnight
        const key = rowKeyOf(task, slotIndex);
        if (nowSched >= end) pastKeys.add(key);
        if (currentKey == null && isTrackedTask(task) && nowSched >= start && nowSched < end) {
          const done = slotIndex != null ? (task.completedSlotIndices ?? []).includes(slotIndex) : !!task.completed;
          // Per-phase, not whole-task.
          const rowMissed = slotIndex != null ? (task.missedSlotIndices ?? []).includes(slotIndex) : !!task.missed;
          if (!done && !rowMissed) currentKey = key;
        }
      }
    }

    return (
      <View>
        {groupedRows.length === 0 ? (
          <EmptyPanel
            icon={IconCalendar}
            title="Nothing scheduled"
            description="Add your first task for this day to start building your schedule."
            action={emptyAction ? { label: 'Add task', onClick: emptyAction } : undefined}
          />
        ) : (
          groupedRows.map((entry, i) => {
            const isFirst = i === 0;
            const isLast = i === groupedRows.length - 1;
            if (entry.kind === 'merged') {
              const toHalf = ({ task, slotIndex }: (typeof rows)[number]) => ({
                task,
                slotIndex,
                linkedPlan: task.planId ? plansById.get(task.planId) ?? null : null,
                category: taskIdentity(task, categoryMap).category,
              });
              return (
                <IOSMergedTimelineRow
                  key={`merged-${rowKeyOf(entry.primary.task, entry.primary.slotIndex)}`}
                  primary={toHalf(entry.primary)}
                  partner={toHalf(entry.partner)}
                  isLast={isLast}
                  isFirst={isFirst}
                  readOnly={dateISO !== todayISO()}
                  editMode={editMode}
                  onToggleComplete={(id, ids) => handleToggleTaskComplete(id, ids, day, dateISO)}
                  onToggleSlot={(id, si) => handleToggleSlot(id, si, day, dateISO)}
                  onEdit={(task) => openEditSheet(task, dateISO)}
                />
              );
            }
            const { task, slotIndex } = entry.row;
            const rowKey = rowKeyOf(task, slotIndex);
            return (
              <IOSTimelineRow
                key={rowKey}
                task={task}
                slotIndex={slotIndex}
                isCurrent={rowKey === currentKey}
                isPast={pastKeys.has(rowKey)}
                isLast={isLast}
                isFirst={isFirst}
                linkedPlan={task.planId ? plansById.get(task.planId) ?? null : null}
                category={taskIdentity(task, categoryMap).category}
                readOnly={dateISO !== todayISO()}
                editMode={editMode}
                onToggleComplete={(id, ids) => handleToggleTaskComplete(id, ids, day, dateISO)}
                onMissed={(id, ids) => handleMarkTaskMissed(id, ids, day, dateISO)}
                onToggleSlot={(id, si) => handleToggleSlot(id, si, day, dateISO)}
                onEdit={() => openEditSheet(task, dateISO)}
                onOpenSubtasks={() => setSubtasksRef({ id: task.id, day, dateISO })}
                onQuickRetime={() =>
                  setQuickRetimeTarget({
                    taskId: task.id,
                    title: task.title,
                    startTime: task.startTime ?? '',
                    endTime: task.endTime ?? '',
                    day,
                    dateISO,
                  })
                }
              />
            );
          })
        )}
      </View>
    );
  };

  const content = (() => {
    if (!ready) {
      return (
        <View className="px-4 pt-6">
          <EmptyPanel icon={IconCalendar} title="Loading schedule" description="Preparing your local schedule and sync state." />
        </View>
      );
    }

    if (subtasksRef) {
      return (
        <ErrorBoundary section name="Task detail">
          <TaskDetailView
            task={subtasksTask}
            linkedPlan={subtasksTask?.planId ? plansById.get(subtasksTask.planId) ?? null : null}
            readOnly={subtasksRef.dateISO !== todayISO()}
            onClose={() => setSubtasksRef(null)}
            onToggleSubtask={(taskId, subtaskId) => handleToggleSubtask(taskId, subtaskId, subtasksRef.day, subtasksRef.dateISO)}
            onToggleComplete={(taskId, ids) => handleToggleTaskComplete(taskId, ids, subtasksRef.day, subtasksRef.dateISO)}
            onToggleSlot={(taskId, slotIndex) => handleToggleSlot(taskId, slotIndex, subtasksRef.day, subtasksRef.dateISO)}
            onMissed={(taskId, ids) => handleMarkTaskMissed(taskId, ids, subtasksRef.day, subtasksRef.dateISO)}
            onSnooze={(taskId) => handleSnoozeTaskLater(taskId, subtasksRef.day, subtasksRef.dateISO)}
            onSkip={(taskId) => handleSkipOccurrence(taskId, subtasksRef.dateISO)}
            skipped={!!subtasksTask?.exceptions?.[subtasksRef.dateISO]?.skipped}
            canSkip={subtasksRef.dateISO >= todayISO()}
            dayNote={subtasksTask ? occurrenceNote(subtasksTask, subtasksRef.dateISO) : undefined}
            onSaveDayNote={(taskId, note) => handleSaveDayNote(taskId, note, subtasksRef.dateISO)}
            dayLabel={formatDayNoteLabel(subtasksRef.dateISO)}
            onEdit={
              subtasksTask
                ? () => {
                    openEditSheet(subtasksTask, subtasksRef.dateISO);
                    setSubtasksRef(null);
                  }
                : undefined
            }
            presentation="page"
          />
        </ErrorBoundary>
      );
    }

    if (activeTab === 4) {
      const setupSteps = [
        { label: 'Create your first plan', tab: 1, done: schedule.plans.length > 0, icon: IconClipboardList },
        { label: "Schedule today's tasks", tab: 0, done: Object.values(schedule.activities).some((a) => (a?.length ?? 0) > 0), icon: IconCalendar },
        { label: 'Build a daily routine', tab: 2, done: (schedule.rituals?.length ?? 0) > 0, icon: IconRepeat },
      ];
      const setupDoneCount = setupSteps.filter((s) => s.done).length;
      const showSetup = !iosSetupDismissed && setupDoneCount < 2;
      const nextSetup = setupSteps.find((s) => !s.done) ?? setupSteps[0];

      return (
        <ErrorBoundary section name="Dashboard">
          <View testID="overview-dashboard" className="gap-4 px-4 pt-5">
            {showSetup && (
              // Same treatment as the web card (components/OverviewDashboard.tsx
              // GettingStarted): a soft green wash, honest per-step segments,
              // and saturated green only on progress and the one next action.
              <View className="rounded-2xl border border-emerald-600/15 bg-emerald-50/70 p-4 dark:border-emerald-400/15 dark:bg-emerald-400/[0.06]">
                <Text accessibilityRole="header" className="text-[19px] font-extrabold leading-tight tracking-[-0.01em] text-neutral-950 dark:text-white">
                  Set up your first day
                </Text>
                <Text className="mt-1 text-[13px] font-medium text-neutral-600 dark:text-neutral-400">Three steps, about two minutes.</Text>
                <View className="mt-3 flex-row items-center gap-3">
                  <View accessible accessibilityLabel={`${setupDoneCount} of 3 setup steps done`} className="flex-1 flex-row gap-1.5">
                    {setupSteps.map(({ label, done }) => (
                      <View
                        key={label}
                        className={`h-1.5 flex-1 rounded-full ${done ? 'bg-[#00A63E] dark:bg-[#2FD46E]' : 'bg-emerald-900/10 dark:bg-white/[0.10]'}`}
                      />
                    ))}
                  </View>
                  <Text className="shrink-0 text-[12px] font-bold tabular-nums text-emerald-800 dark:text-emerald-300">{setupDoneCount} of 3</Text>
                </View>
                <View className="mt-3 gap-1">
                  {setupSteps.map(({ label, tab, done, icon }, index) => {
                    const isNext = !done && label === nextSetup.label;
                    return (
                      <Pressable
                        key={label}
                        accessibilityRole="button"
                        accessibilityLabel={`Step ${index + 1}: ${label}${done ? ' (done)' : ''}`}
                        onPress={() => {
                          haptic('light');
                          setActiveTab(tab);
                        }}
                        className={`min-h-[52px] w-full flex-row items-center gap-3 rounded-xl px-3 py-2 active:bg-white/70 dark:active:bg-white/[0.06] ${
                          isNext ? 'bg-white/90 dark:bg-white/[0.05]' : ''
                        }`}
                      >
                        <View
                          className={`h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            done
                              ? 'bg-[#00A63E] dark:bg-[#2FD46E]'
                              : isNext
                                ? 'border-2 border-neutral-950 bg-white dark:border-white dark:bg-transparent'
                                : 'border border-emerald-900/15 bg-white/60 dark:border-white/[0.15] dark:bg-transparent'
                          }`}
                        >
                          {done ? (
                            <Icon icon={IconCheck} size={15} strokeWidth={3} className="text-white dark:text-neutral-950" />
                          ) : (
                            <Icon
                              icon={icon}
                              size={16}
                              strokeWidth={2}
                              className={isNext ? 'text-neutral-950 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}
                            />
                          )}
                        </View>
                        <Text
                          numberOfLines={1}
                          className={`min-w-0 flex-1 text-[14px] font-bold ${done ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-950 dark:text-white'}`}
                        >
                          {label}
                        </Text>
                        <Icon icon={IconChevronRight} size={16} strokeWidth={2.4} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
                      </Pressable>
                    );
                  })}
                </View>
                <View className="mt-3 flex-row items-center gap-2">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      haptic('light');
                      setActiveTab(nextSetup.tab);
                    }}
                    className="min-h-[44px] flex-1 items-center justify-center rounded-full bg-[#008236] active:scale-[0.98] active:bg-[#006B2C] dark:bg-[#2FD46E]"
                  >
                    <Text className="text-[14px] font-bold text-white dark:text-neutral-950">
                      {nextSetup.tab === 1 ? 'Create plan' : nextSetup.tab === 0 ? 'Schedule tasks' : 'Add routine'}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      haptic('light');
                      dismissIosSetup();
                    }}
                    className="min-h-[44px] items-center justify-center rounded-full px-3"
                  >
                    <Text className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">I'll do this later</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <View testID="overview-streak-card" className={`${CARD} p-4`}>
              <View className="flex-row items-center gap-3">
                <View
                  className={`h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                    executionStreak.atRisk ? 'bg-amber-500/12 dark:bg-amber-400/12' : 'bg-emerald-500/12 dark:bg-emerald-400/12'
                  }`}
                >
                  <Icon
                    icon={IconFlame}
                    size={22}
                    strokeWidth={2}
                    className={executionStreak.atRisk ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="truncate text-[16px] font-bold leading-none text-neutral-950 dark:text-white">
                    {executionStreak.streak === 0 ? 'No streak yet' : `${executionStreak.streak}-day streak`}
                  </Text>
                  <Text className="mt-1.5 truncate text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                    {executionStreak.atRisk
                      ? 'Complete one thing to keep it alive.'
                      : executionStreak.milestone
                        ? 'New milestone — keep the run going.'
                        : executionStreak.streak === 0
                          ? 'Finish a task or ritual to start.'
                          : 'You showed up. Keep the run going.'}
                  </Text>
                </View>
                {executionStreak.streak > 0 && (
                  <Text
                    className={`shrink-0 text-[24px] font-semibold tabular-nums leading-none ${
                      executionStreak.atRisk ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {executionStreak.streak}
                  </Text>
                )}
              </View>
            </View>

            {/* Recently missed / overdue — renders nothing when all clear. */}
            <NeedsAttentionCard
              data={needsAttention}
              onNavigate={setActiveTab}
              onHandleMissed={setMissedSheet}
              onAdaptMilestone={setAdaptingMilestoneId}
              onReviewUnreliableSlot={(row) => openEditSheet(row.task)}
              onClearAll={handleClearAttention}
              onDismissOne={handleDismissAttentionOne}
            />

            {/* Trackers waiting on this period's entry — nothing once all are in. */}
            <CheckInsDueCard
              trackers={schedule.progressTrackers}
              metricEntries={schedule.metricEntries}
              todayISO={todayISO()}
              trackingStart={schedule.preferences?.startDate}
              onLog={(tracker) => setEntryTracker(tracker)}
              onOpenTracking={() => setActiveTab(8)}
            />

            <View testID="overview-next-task" className={`${CARD} p-0`}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  haptic('light');
                  setActiveTab(0);
                }}
                className="min-h-[72px] w-full flex-row items-center gap-3 rounded-2xl px-4 py-3 active:bg-neutral-50 dark:active:bg-white/[0.04]"
              >
                <View className="h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 dark:bg-emerald-400/12">
                  <Icon icon={IconCalendar} size={19} strokeWidth={2.2} className="text-emerald-600 dark:text-emerald-400" />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">Next up</Text>
                  <Text className="mt-0.5 truncate text-[16px] font-bold text-neutral-950 dark:text-white">{todayOpenTasks[0]?.title ?? 'Plan your day'}</Text>
                  <Text className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                    {todayOpenTasks[0]
                      ? [todayOpenTasks[0].startTime && formatDisplayTime(todayOpenTasks[0].startTime), schedule.plans.find((plan) => plan.id === todayOpenTasks[0].planId)?.title]
                          .filter(Boolean)
                          .join(' · ') || 'Open Today to continue'
                      : todayTasks.length > 0
                        ? 'Everything scheduled is complete'
                        : 'Open Today to add your first task'}
                  </Text>
                </View>
                <Icon icon={IconChevronRight} size={18} strokeWidth={2.2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
              </Pressable>
            </View>

            <View testID="overview-week-summary" className={`${CARD} p-4`}>
              <View className="flex-row items-start justify-between gap-4">
                <View>
                  <Text className="text-[13px] font-bold text-neutral-950 dark:text-white">Today's execution</Text>
                  <Text className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-neutral-950 dark:text-white">{dashboardProgressPct}%</Text>
                </View>
                <View className={`rounded-full px-2.5 py-1 ${missedThisWeek > 0 ? 'bg-rose-500/10 dark:bg-rose-400/10' : 'bg-emerald-500/10 dark:bg-emerald-400/10'}`}>
                  <Text
                    className={`text-[12px] font-bold tabular-nums ${missedThisWeek > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}
                  >
                    {missedThisWeek > 0 ? `${missedThisWeek} missed` : 'On track'}
                  </Text>
                </View>
              </View>
              <View className="mt-4 flex-row gap-3 border-t border-neutral-200/70 pt-3 dark:border-white/[0.07]">
                <Text className="flex-1 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                  <Text className="font-bold tabular-nums text-neutral-950 dark:text-white">
                    {todayDone}/{todayTasks.length}
                  </Text>{' '}
                  done
                </Text>
                <Text className="flex-1 text-right text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                  <Text className="font-bold tabular-nums text-neutral-950 dark:text-white">{formatMinutesBrief(remainingPlannedMinutes)}</Text> remaining
                </Text>
              </View>
            </View>
          </View>
        </ErrorBoundary>
      );
    }

    if (activeTab === 0) {
      return (
        <ErrorBoundary section name="Today list">
          <TourTarget id="today-timeline" className="gap-5 px-4 pt-5">
            <View className="rounded-2xl bg-white py-4 dark:bg-neutral-950">
              <View className="mb-3 flex-row items-center justify-between px-4">
                {/* Shrinks rather than pushing the week arrows off the card. */}
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} className="mr-2 min-w-0 flex-1 text-[20px] font-bold text-neutral-900 dark:text-white">
                  {weekLabel}
                </Text>
                <View className="shrink-0 flex-row items-center">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setWeekOffset(0);
                      setActiveDay(todayKey);
                    }}
                    hitSlop={8}
                    className="min-h-[44px] justify-center px-1"
                  >
                    <Text className="text-[14px] font-bold text-emerald-600 dark:text-emerald-400">Today</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous week"
                    onPress={() => setWeekOffset((offset) => offset - 1)}
                    hitSlop={6}
                    className="h-8 w-8 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.07]"
                  >
                    <Icon icon={IconChevronLeft} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next week"
                    onPress={() => setWeekOffset((offset) => offset + 1)}
                    hitSlop={6}
                    className="h-8 w-8 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-white/[0.07]"
                  >
                    <Icon icon={IconChevronRight} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                  </Pressable>
                </View>
              </View>
              <View className="flex-row px-2">
                {weekDates.map(({ day, date }) => {
                  const isActive = day === activeDay;
                  const isToday = localISODate(date) === todayISO();
                  return (
                    <Pressable
                      key={day}
                      accessibilityRole="button"
                      accessibilityLabel={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                      accessibilityState={{ selected: isActive }}
                      onPress={() => setActiveDay(day)}
                      // gap/py tightened by the line-height added to the labels
                      // below, so the cell stays the same height at default size.
                      className={`flex-1 items-center gap-1 rounded-[14px] py-2.5 ${isActive ? 'bg-neutral-950 dark:bg-white' : ''}`}
                    >
                      <Text
                        className={`text-[11px] font-semibold leading-[14px] ${
                          isActive ? 'text-white opacity-60 dark:text-neutral-950' : isToday ? 'text-rose-500' : 'text-neutral-500 dark:text-neutral-400'
                        }`}
                      >
                        {DAY_LABELS[day]}
                      </Text>
                      <Text
                        className={`text-[18px] font-bold leading-[24px] tabular-nums ${
                          isActive ? 'text-white dark:text-neutral-950' : isToday ? 'text-rose-500' : 'text-neutral-900 dark:text-white'
                        }`}
                      >
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View className="flex-row items-center justify-between">
              <View className="min-w-0 flex-1">
                <Text accessibilityRole="header" className="text-[20px] font-semibold text-neutral-950 dark:text-white">
                  {activeDay === todayKey ? "Today's Task" : new Date(activeDateISO + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' })}
                </Text>
                <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                  {dayDone}/{dayTracked.length} done
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                {todayEditMode && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Lock screen wallpaper"
                    onPress={() => {
                      haptic('light');
                      setWallpaperOpen(true);
                    }}
                    className="h-12 w-12 items-center justify-center rounded-full bg-neutral-100 active:scale-[0.96] dark:bg-white/[0.08]"
                  >
                    <Icon icon={IconPhoto} size={24} strokeWidth={2} className="text-neutral-600 dark:text-neutral-300" />
                  </Pressable>
                )}
                {/* Adding to the day is a primary action, so it isn't hidden
                    behind edit mode — the tab bar no longer carries a + . */}
                <TourTarget id="new-item-button">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Add task"
                    onPress={() => {
                      haptic('light');
                      openCreateSheet();
                    }}
                    className="h-12 w-12 items-center justify-center rounded-full bg-neutral-950 active:scale-[0.96] dark:bg-white"
                  >
                    <Icon icon={IconPlus} size={24} strokeWidth={2.2} className="text-white dark:text-neutral-950" />
                  </Pressable>
                </TourTarget>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={todayEditMode ? 'Done editing' : 'Edit day'}
                  accessibilityState={{ selected: todayEditMode }}
                  onPress={() => {
                    haptic('light');
                    setTodayEditMode((v) => !v);
                  }}
                  className={`h-12 w-12 items-center justify-center rounded-full active:scale-[0.96] ${
                    todayEditMode ? 'bg-neutral-200 dark:bg-white/[0.18]' : 'bg-neutral-100 dark:bg-white/[0.08]'
                  }`}
                >
                  <Icon
                    icon={todayEditMode ? IconCheck : IconEdit}
                    size={24}
                    strokeWidth={2}
                    className={todayEditMode ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-300'}
                  />
                </Pressable>
              </View>
            </View>
            <SignInPrompt />
            {renderTaskList(dayTasksView, activeDay, activeDateISO, () => openCreateSheet(), todayEditMode)}
          </TourTarget>
        </ErrorBoundary>
      );
    }

    if (activeTab === 1) {
      if (selectedPlan) {
        return (
          <ErrorBoundary section name="Plans">
            <PlanDetailView
              plan={selectedPlan}
              schedule={schedule}
              milestones={schedule.milestones ?? []}
              // The header above already shows the title and the edit/delete actions.
              hideHeader
              onDeletePlan={handleDeletePlan}
              onEditPlan={(planId) => setEditingPlanId(planId)}
              onTogglePlanPaused={(planId) => setSchedule((prev) => togglePlanPaused(prev, planId))}
              onAdaptMilestone={(milestoneId) => setAdaptingMilestoneId(milestoneId)}
              onAddTask={(planId) => openCreateSheet(planId)}
              onEditTask={(task) => openEditSheet(task)}
              onDeleteLinkedTask={handleDeleteLinkedTask}
              onDeleteTaskSlot={handleDeleteTaskSlot}
              onAddTracker={(planId, title, unit, goalDirection, id, goalValue, startingValue, dailyTarget, cadence) => {
                setSchedule((prev) => ({
                  ...prev,
                  progressTrackers: [
                    ...prev.progressTrackers,
                    { id: id ?? uid(), planId, title, type: 'number', unit: unit || undefined, goalDirection, goalValue, startingValue, dailyTarget, cadence },
                  ],
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
              onDeleteEntry={handleDeleteEntry}
              onAddMilestone={(data) => handleAddMilestone(selectedPlan.id, data)}
              onUpdateMilestone={handleUpdateMilestone}
              onDeleteMilestone={handleDeleteMilestone}
              onMoveMilestone={handleMoveMilestone}
              onCompleteMilestone={handleCompleteMilestone}
              onLinkTrackerToMilestone={(milestoneId, trackerId) => {
                setSchedule((prev) => ({
                  ...prev,
                  milestones: (prev.milestones ?? []).map((milestone) =>
                    milestone.id === milestoneId ? { ...milestone, linkedTrackers: [...new Set([...(milestone.linkedTrackers ?? []), trackerId])] } : milestone,
                  ),
                }));
              }}
              onUnlinkTrackerFromMilestone={(milestoneId, trackerId) => {
                setSchedule((prev) => ({
                  ...prev,
                  milestones: (prev.milestones ?? []).map((milestone) =>
                    milestone.id === milestoneId ? { ...milestone, linkedTrackers: (milestone.linkedTrackers ?? []).filter((id) => id !== trackerId) } : milestone,
                  ),
                }));
              }}
              onLinkTaskToMilestone={(milestoneId, taskId) => {
                setSchedule((prev) => ({
                  ...prev,
                  milestones: (prev.milestones ?? []).map((milestone) =>
                    milestone.id === milestoneId ? { ...milestone, linkedActivities: [...new Set([...(milestone.linkedActivities ?? []), taskId])] } : milestone,
                  ),
                }));
              }}
              onUnlinkTaskFromMilestone={(milestoneId, taskId) => {
                setSchedule((prev) => ({
                  ...prev,
                  milestones: (prev.milestones ?? []).map((milestone) =>
                    milestone.id === milestoneId ? { ...milestone, linkedActivities: (milestone.linkedActivities ?? []).filter((id) => id !== taskId) } : milestone,
                  ),
                }));
              }}
            />
          </ErrorBoundary>
        );
      }
      return (
        <ErrorBoundary section name="Plans">
          <TourTarget id="plans-list" className="gap-3 px-4 pt-5">
            {schedule.plans.length === 0 ? (
              <EmptyPanel
                icon={IconClipboardData}
                title="No plans yet"
                description="Create a plan first, then add tasks to schedule your day."
                action={{ label: 'Create plan', onClick: () => setAddingPlan(true) }}
                secondaryAction={{ label: 'Browse templates', onClick: () => setTemplatesOpen(true) }}
              />
            ) : (
              schedule.plans.map((plan) => {
                const taskCount = DAYS.reduce((sum, day) => sum + schedule.activities[day].filter((task) => task.planId === plan.id).length, 0);
                const range =
                  plan.startDate || plan.endDate ? `${plan.startDate ? formatDate(plan.startDate) : 'Anytime'}${plan.endDate ? ` - ${formatDate(plan.endDate)}` : ''}` : 'No date range';
                const planGlyph = (SECTION_ICONS.find((entry) => entry.name === plan.emoji) ?? SECTION_ICONS[0]).icon;
                const planHex = categoryHex(resolveAccentColor(plan.color, plan.emoji));
                return (
                  <Pressable
                    key={plan.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${plan.title}, ${range}, ${taskCount} tasks`}
                    onPress={() => setSelectedPlanId(plan.id)}
                    className="w-full rounded-2xl border border-neutral-200 bg-white p-4 active:bg-neutral-50/80 dark:border-white/[0.08] dark:bg-neutral-900 dark:active:bg-[#1B1B1B]"
                  >
                    <View className="mb-3 flex-row items-start gap-3">
                      <View className="h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${planHex}1F` }}>
                        <Icon icon={planGlyph} size={24} strokeWidth={1.5} color={planHex} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text className="truncate text-[16px] font-semibold text-neutral-950 dark:text-white">{plan.title}</Text>
                        <Text className="mt-1 truncate text-[14px] font-medium text-neutral-500 dark:text-neutral-400">{range}</Text>
                      </View>
                      <View className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 dark:bg-white/[0.07]">
                        <Text className="text-[12px] font-bold text-neutral-500 dark:text-neutral-300">{taskCount} tasks</Text>
                      </View>
                    </View>
                    {!!plan.description && <Text className="line-clamp-2 text-[12px] font-normal leading-snug text-neutral-500 dark:text-neutral-400">{plan.description}</Text>}
                  </Pressable>
                );
              })
            )}
          </TourTarget>
        </ErrorBoundary>
      );
    }

    if (activeTab === 2) {
      return (
        <ErrorBoundary section name="Routine">
          <TourTarget id="routine-view">
            <RitualView
              rituals={schedule.rituals ?? []}
              ritualCompletions={schedule.ritualCompletions ?? []}
              trackingStart={schedule.preferences?.startDate}
              onMarkDone={handleMarkRitualDone}
              onUnmarkDone={handleUnmarkRitualDone}
              onOpenDetail={(ritual) => setDetailRitualId(ritual.id)}
              onAdd={handleAddRitual}
              onUpdate={handleUpdateRitual}
              onDelete={handleDeleteRitual}
              addOpen={ritualAddOpen}
              onAddOpenChange={setRitualAddOpen}
            />
          </TourTarget>
        </ErrorBoundary>
      );
    }

    if (activeTab === 5) {
      return (
        <ErrorBoundary section name="Settings">
          <SettingsView
            schedule={schedule}
            setSchedule={setSchedule}
            onClearData={clearData}
            onClearProgress={clearProgress}
            onRestoreData={restoreData}
            onUpdatePreferences={(patch) => setSchedule((prev) => ({ ...prev, preferences: { ...prev.preferences, ...patch } }))}
            onClose={() => setActiveTab(4)}
          />
        </ErrorBoundary>
      );
    }

    if (activeTab === 6) {
      return (
        <ErrorBoundary section name="Notes">
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
            onOpenTask={(taskId) => {
              const task = notesLinkableTasks.find((item) => item.id === taskId);
              if (task) openEditSheet(task);
            }}
          />
        </ErrorBoundary>
      );
    }

    if (activeTab === 8) {
      return (
        <ErrorBoundary section name="Tracking">
          <TourTarget id="tracking-view">
            <TrackingView
              trackers={schedule.progressTrackers}
              metricEntries={schedule.metricEntries}
              plans={schedule.plans}
              trackingStart={schedule.preferences?.startDate}
              milestoneByTrackerId={milestoneByTrackerId}
              onLog={handleLogTrackerAmount}
              onOpenAddEntry={(tracker) => setEntryTracker(tracker)}
              onDeleteEntry={handleDeleteEntry}
              onSetCadence={handleSetTrackerCadence}
              onNavigateToPlans={() => setActiveTab(1)}
            />
          </TourTarget>
        </ErrorBoundary>
      );
    }

    return null;
  })();

  // Task detail and Notes are full pages that own their scrolling and header.
  const fullPage = !!subtasksRef || activeTab === 6;
  const showBottomNav = activeTab !== 6 && !subtasksRef && !taskSheetOpen && !detailRitual;

  const toastElement = toastState ? (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 z-50 items-center px-4"
      style={{ bottom: Math.max(112, insets.bottom + 8 + 68 + 16), elevation: 12 }}
    >
      <View
        accessibilityLiveRegion="polite"
        className="flex-row items-center gap-4 rounded-full border border-neutral-800 bg-neutral-900 px-5 py-2.5 dark:border-white/[0.10] dark:bg-white"
      >
        <Text className="shrink text-[14px] font-semibold text-white dark:text-neutral-900">{toastState.message}</Text>
        {!!toastState.actionLabel && !!toastState.onAction && (
          <Pressable
            accessibilityRole="button"
            onPress={toastState.onAction}
            hitSlop={10}
            className="-mr-1 rounded-full bg-white/10 px-2.5 py-1 active:bg-white/20 dark:bg-neutral-900/10 dark:active:bg-neutral-900/20"
          >
            <Text className="text-[13px] font-bold text-white dark:text-neutral-900">{toastState.actionLabel}</Text>
          </Pressable>
        )}
      </View>
    </View>
  ) : null;

  return (
    <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]">
      {fullPage ? (
        <View className="flex-1 bg-white dark:bg-neutral-950" style={{ paddingTop: insets.top }}>
          {content}
        </View>
      ) : (
        <ScrollView
          // A fresh scroll position per page, like navigating on the web.
          key={`${activeTab}:${selectedPlanId ?? ''}`}
          className="flex-1"
          contentContainerStyle={{ paddingTop: insets.top + 76, paddingBottom: 144 }}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {content}
        </ScrollView>
      )}

      {!fullPage && (
        <IOSHeader
          title={
            selectedPlan
              ? selectedPlan.title
              : activeTab === 0
                ? 'Today'
                : activeTab === 1
                  ? 'Plans'
                  : activeTab === 2
                    ? 'Routine'
                    : activeTab === 8
                      ? 'Tracking'
                      : activeTab === 5
                        ? 'Settings'
                        : 'Dashboard'
          }
          onBack={selectedPlan ? () => setSelectedPlanId(null) : undefined}
          actions={
            selectedPlan
              ? [
                  {
                    icon: IconTrash,
                    label: 'Delete plan',
                    destructive: true,
                    onClick: () => {
                      haptic('light');
                      handleDeletePlan(selectedPlan.id);
                    },
                  },
                  {
                    icon: IconEdit,
                    label: 'Edit plan',
                    onClick: () => {
                      haptic('light');
                      setEditingPlanId(selectedPlan.id);
                    },
                  },
                ]
              : activeTab === 1
                ? [
                    {
                      icon: IconTemplate,
                      label: 'Browse templates',
                      onClick: () => {
                        haptic('light');
                        setTemplatesOpen(true);
                      },
                    },
                    {
                      icon: IconTargetArrow,
                      label: 'Goals',
                      onClick: () => {
                        haptic('light');
                        setGoalsSheetOpen(true);
                      },
                    },
                    {
                      icon: IconPlus,
                      label: 'New plan',
                      tour: 'new-item-button',
                      onClick: () => {
                        haptic('light');
                        setAddingPlan(true);
                      },
                    },
                  ]
                : undefined
          }
          onSettings={() => {
            setSelectedPlanId(null);
            setActiveTab(5);
          }}
          onNotes={() => {
            setSelectedPlanId(null);
            setActiveTab(6);
          }}
        />
      )}

      <DayActionsSheet
        open={dayActionsOpen}
        sourceDay={activeDay}
        onClose={() => setDayActionsOpen(false)}
        onSwap={(target) => setSchedule(swapDays(activeDay, target))}
        onDuplicate={(targets) => setSchedule(duplicateDay(activeDay, targets))}
        onClear={() => setDayClearRequest(activeDay)}
        taskCount={(schedule.activities[activeDay] ?? []).length}
      />

      {missedSheet && (
        <MissedTaskSheet
          missed={missedSheet}
          onClose={() => setMissedSheet(null)}
          onReschedule={(m, dateISO, startMinutes) => setSchedule((prev) => rescheduleMissedTaskOnce(prev, m.task, m.dateISO, dateISO, startMinutes))}
          onDismiss={(m) => setSchedule((prev) => acknowledgeMiss(prev, m.task.id, m.dateISO))}
        />
      )}

      <QuickRetimeSheet target={quickRetimeTarget} onClose={() => setQuickRetimeTarget(null)} onSave={handleQuickRetime} />


      <TemplatesSheet open={templatesOpen} onClose={() => setTemplatesOpen(false)} onApply={handleApplyTemplate} />

      {showBottomNav && (
        <IOSBottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setSelectedPlanId(null);
          }}
        />
      )}

      {/* Per-tab guided tour — short, skippable, once per device. */}
      {activeTourId && <CoachMarks key={activeTourId} open={tour.open} steps={NATIVE_TOUR_STEPS[activeTourId]} onFinish={tour.finish} />}

      {wallpaperOpen && <DayWallpaperSheet open={wallpaperOpen} onClose={() => setWallpaperOpen(false)} schedule={schedule} todayKey={todayKey} />}

      {(taskSheetOpen || addingPlan || editingPlanId || entryTracker || goalsSheetOpen || adaptingMilestoneId) && (
        <>
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
            overlay={toastElement}
            onClose={closeTaskSheet}
            onSave={handleTaskSheetSave}
            onDelete={
              taskSheetTask
                ? () => {
                    requestDeleteTask(taskSheetTask.id, activeDay);
                    closeTaskSheet();
                  }
                : undefined
            }
            onResetOccurrence={taskSheetTask && taskSheetDateISO ? () => setSchedule(clearTaskException(taskSheetTask.id, taskSheetDateISO)) : undefined}
            onCopySubtaskToTasks={(entry, targetTaskIds) => {
              setSchedule(addSubtaskToTasks(targetTaskIds, entry));
              setToast(`Subtask copied to ${targetTaskIds.length} task${targetTaskIds.length === 1 ? '' : 's'}`);
            }}
            onMergeTask={(taskId, partnerId) => {
              setSchedule(mergeTasks(taskId, partnerId));
              setToast('Tasks merged');
            }}
            onUnmergeTask={(taskId) => {
              setSchedule(unmergeTask(taskId));
              setToast('Tasks unmerged');
            }}
          />
          <AddPlanSheet open={addingPlan} onClose={() => setAddingPlan(false)} setSchedule={setSchedule} goals={schedule.goals ?? []} />
          {editingPlanId && (
            <EditPlanSheet planId={editingPlanId} plan={plansById.get(editingPlanId) ?? null} setSchedule={setSchedule} onClose={() => setEditingPlanId(null)} goals={schedule.goals ?? []} />
          )}
          {/* ── Adapt a milestone that is off pace ──────────────────────────── */}
          {adaptingMilestone && adaptingMilestonePlan && (
            <AdaptMilestoneSheet
              open
              onClose={() => setAdaptingMilestoneId(null)}
              milestone={adaptingMilestone}
              plan={adaptingMilestonePlan}
              state={calculateMilestoneState({
                milestone: adaptingMilestone,
                plan: adaptingMilestonePlan,
                activities: schedule.activities,
                trackers: schedule.progressTrackers,
                metricEntries: schedule.metricEntries,
                trackingStart: schedule.preferences?.startDate,
                milestones: schedule.milestones,
                rituals: schedule.rituals,
                ritualCompletions: schedule.ritualCompletions,
              })}
              schedule={schedule}
              onApply={(adaptation) => setSchedule((prev) => applyAdaptation(prev, adaptation))}
            />
          )}

          <GoalListSheet
            open={goalsSheetOpen}
            onClose={() => setGoalsSheetOpen(false)}
            schedule={schedule}
            setSchedule={setSchedule}
            // The confirm can't present over the open sheet on iOS (see the header note).
            onDeleteGoal={(goalId) => {
              setGoalsSheetOpen(false);
              handleDeleteGoal(goalId);
            }}
          />
          <AddEntryModal
            isOpen={!!entryTracker}
            onClose={() => setEntryTracker(null)}
            metric={entryTracker ? { name: entryTracker.title, unit: entryTracker.unit ?? '' } : undefined}
            quickAmounts={entryTracker ? quickAmountsForUnit(entryTracker.unit) : undefined}
            todayTotal={entryTracker ? sumEntriesForDate(schedule.metricEntries, entryTracker.id, todayISO()) : undefined}
            onSave={(value, date) => {
              if (!entryTracker) return;
              const entry: MetricEntry = { id: uid(), planId: entryTracker.planId, trackerId: entryTracker.id, value, date };
              setSchedule((prev) => ({
                ...prev,
                progressTrackers: prev.progressTrackers.some((tracker) => tracker.id === entryTracker.id) ? prev.progressTrackers : [...prev.progressTrackers, entryTracker],
                metricEntries: [...prev.metricEntries, entry],
              }));
            }}
          />
        </>
      )}

      {detailRitual && (
        <View className="absolute inset-0 z-50 bg-[#F5F5F5] dark:bg-[#0E0E0E]" style={{ paddingTop: insets.top }}>
          <RoutineDetailView
            ritual={detailRitual}
            ritualCompletions={schedule.ritualCompletions ?? []}
            trackingStart={schedule.preferences?.startDate}
            onBack={() => setDetailRitualId(null)}
            onMarkDone={(followed) => handleMarkRitualDone(detailRitual.id, todayISO(), followed)}
            onUnmarkDone={() => handleUnmarkRitualDone(detailRitual.id, todayISO())}
            onLogAmount={(amount) => handleLogRitualAmount(detailRitual.id, amount, todayISO())}
            onUndoLastLog={() => handleUndoRitualLog(detailRitual.id, todayISO())}
            onRemoveLog={(entryId) => setSchedule((prev) => ({ ...prev, ritualCompletions: removeRitualLog(prev.ritualCompletions ?? [], entryId) }))}
            onToggleStep={(stepId) => handleToggleRitualStep(detailRitual.id, stepId)}
            onEdit={() => {
              setEditRitualId(detailRitual.id);
              setDetailRitualId(null);
            }}
            onDelete={() => {
              setDetailRitualId(null);
              handleDeleteRitual(detailRitual.id);
            }}
          />
        </View>
      )}

      <RitualSheet
        open={!!editingRitual}
        onClose={() => setEditRitualId(null)}
        initial={editingRitual ?? undefined}
        onSave={(data) => {
          if (editingRitual) handleUpdateRitual(editingRitual.id, data);
          setEditRitualId(null);
        }}
        onDelete={() => {
          if (editingRitual) handleDeleteRitual(editingRitual.id);
          setEditRitualId(null);
        }}
      />

      {taskDeleteDetails && (
        <ConfirmOverlay
          state={{
            title: 'Delete task?',
            description:
              taskDeleteDetails.activeDays.length > 1
                ? `"${taskDeleteDetails.task.title}" appears on ${taskDeleteDetails.activeDays.length} days. Delete all copies?`
                : `"${taskDeleteDetails.task.title}" will be removed from this day.`,
            confirmLabel: taskDeleteDetails.activeDays.length > 1 ? 'Delete all' : 'Delete',
            destructive: true,
            onConfirm: () => performTaskDelete(taskDeleteDetails.activeDays.length > 1 ? 'all' : 'day'),
          }}
          onClose={() => setTaskDeleteRequest(null)}
        />
      )}
      {dayClearRequest &&
        (() => {
          const label = DAY_FULL_LABELS[dayClearRequest];
          const summary = summarizeDayClear(schedule, dayClearRequest);
          const resolved = summary.completed + summary.missed;
          // Names the weekday, not the date: this empties every Monday, not the
          // day being looked at. And it names what is actually being lost.
          const description = [
            `This deletes ${summary.total} ${summary.total === 1 ? 'task' : 'tasks'} from every ${label}, for good.`,
            resolved > 0 ? `${resolved} of them ${resolved === 1 ? 'has' : 'have'} a completion record that goes too.` : '',
            summary.alsoOnOtherDays > 0 ? `${summary.alsoOnOtherDays} also ${summary.alsoOnOtherDays === 1 ? 'runs' : 'run'} on other days and will stay there.` : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <ConfirmOverlay
              state={{ title: `Clear every ${label}?`, description, confirmLabel: 'Clear day', destructive: true, onConfirm: performDayClear }}
              onClose={() => setDayClearRequest(null)}
            />
          );
        })()}
      {confirmState && <ConfirmOverlay state={confirmState} onClose={() => setConfirmState(null)} />}
      {!taskSheetOpen && toastElement}
    </View>
  );
}
