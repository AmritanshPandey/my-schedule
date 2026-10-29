import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, View } from 'react-native';
import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowDownRight,
  IconArrowUp,
  IconArrowUpRight,
  IconCalendar,
  IconChartLine,
  IconRepeat,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconEdit,
  IconListCheck,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconStack2,
  IconTrash,
  IconWand,
} from '@tabler/icons-react-native';
import type { DayKey, GoalDirection, MetricEntry, Milestone, Plan, ProgressTracker, Schedule, Task, TrackerCadence } from '@planr/core/lib/scheduleTypes';
import { trackerCadence } from '@planr/core/lib/trackerCadence';
import { CadencePicker } from '../tracking/CadencePicker';
import { DAYS } from '@planr/core/lib/scheduleConstants';
import { computeRoadmapStats } from '@planr/core/lib/roadmapEngine';
import { calculateMilestoneProgress, type MilestoneProgress } from '@planr/core/lib/planProgress';
import { calculateMilestoneState, type MilestoneState } from '@planr/core/lib/milestoneHealth';
import type { MilestoneLinkKind } from '@planr/core/lib/milestoneLinks';
import { milestoneSpan } from '@planr/core/lib/milestoneTargets';
import MilestoneLinks from '../milestone/MilestoneLinks';
import { paceNarrative } from '@planr/core/lib/paceModel';
import { isPlanRunning, planLifecycleLabel } from '@planr/core/lib/planLifecycle';
import { sumEntriesForDate } from '@planr/core/lib/metricEntries';
import { planEffectiveEndDate, resolveMilestoneStatus } from '@planr/core/lib/roadmapDates';
import { computeTrend, type TrendResult } from '@planr/core/lib/trendUtils';
import { getTaskCheckableItems, isTrackedTask } from '@planr/core/lib/taskCompletion';
import { formatDisplayTime, formatDuration } from '@planr/core/lib/timeUtils';
import { formatDate, formatDateShort, todayISO } from '@planr/core/lib/dateUtils';
import { getSlots } from '@planr/core/lib/taskMutations';
import { haptic } from '../../lib/haptics';
import ProgressChart from '../ProgressChart';
import BottomSheet from '../ui/BottomSheet';
import ProgressBar from '../ui/ProgressBar';
import HealthBadge from '../ui/HealthBadge';
import SheetHeader from '../ui/SheetHeader';
import Button, { BUTTON_TEXT } from '../ui/Button';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import Input from '../ui/Input';
import { DayPill } from '../ui/Badge';
import { InternalSectionTitle, SectionIconButton } from '../ui/InternalSectionTitle';
import { TrackerTabs } from '../ui/TrackerTabs';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';
import AccuracyCalendar from './AccuracyCalendar';
import MilestoneSheet, { type MilestoneSaveData } from './MilestoneSheet';

// ── Local constants ───────────────────────────────────────────────────────────

const WEEKDAY_ORDER: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const WEEKDAY_SHORT: Record<DayKey, string> = {
  sunday: 'Su',
  monday: 'Mo',
  tuesday: 'Tu',
  wednesday: 'We',
  thursday: 'Th',
  friday: 'Fr',
  saturday: 'Sa',
};

const formatPlanDate = formatDate;

const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400';

function formatPlanRange(plan: Plan): string {
  if (!plan.startDate && !plan.endDate) return '';
  if (plan.startDate && plan.endDate) return `${formatPlanDate(plan.startDate)} – ${formatPlanDate(plan.endDate)}`;
  if (plan.startDate) return `Starts ${formatPlanDate(plan.startDate)}`;
  return `Ends ${formatPlanDate(plan.endDate ?? '')}`;
}

function getUniquePlanTasks(planId: string, activities: Schedule['activities']): Array<{ task: Task; activeDays: DayKey[] }> {
  const seen = new Map<string, { task: Task; activeDays: DayKey[] }>();
  for (const day of DAYS) {
    for (const task of activities[day]) {
      if (task.planId !== planId) continue;

      if (!seen.has(task.id)) seen.set(task.id, { task, activeDays: [day] });
      else seen.get(task.id)!.activeDays.push(day);
    }
  }
  return Array.from(seen.values());
}

/**
 * A vertical dashed (or solid) 2px rule. RN draws a dashed border reliably
 * only on all four sides, so the left edge is shown by clipping a wider
 * dashed box to 2px — the web's `border-l-2 border-dashed`.
 */
function ConnectorLine({ dashed, colorClassName, style }: { dashed: boolean; colorClassName: string; style: object }) {
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', width: 2, overflow: 'hidden' }, style]}>
      <View
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 8, borderWidth: 2, borderStyle: dashed ? 'dashed' : 'solid' }}
        className={colorClassName}
      />
    </View>
  );
}

// ── Trend badge ───────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: TrendResult }) {
  const isPositive = trend.state === 'positive';
  const isUp = trend.direction === 'up';
  const colorClass = isPositive ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400';
  const pctText = trend.pct !== null ? ` by ${Math.abs(trend.pct).toFixed(1)}%` : '';
  return (
    <View className="mt-1.5 flex-row items-center gap-0.5">
      <Text className={`text-[12px] font-medium ${colorClass}`}>
        Trending {isUp ? 'up' : 'down'}
        {pctText}
      </Text>
      <Icon icon={isUp ? IconArrowUpRight : IconArrowDownRight} size={12} strokeWidth={1.5} className={`shrink-0 ${colorClass}`} />
    </View>
  );
}

// ── Milestone health badge ──────────────────────────────────────────────────
// The live trajectory signal (calculateMilestoneState), distinct from the
// date-derived lifecycle status (resolveMilestoneStatus) shown next to it.

function MilestoneHealthBadge({ health, size = 'sm' }: { health: MilestoneState['health']; size?: 'sm' | 'md' }) {
  return <HealthBadge health={health} size={size} />;
}

// ── Goal direction picker ─────────────────────────────────────────────────────

function GoalDirectionPicker({ value, onChange }: { value: GoalDirection; onChange: (v: GoalDirection) => void }) {
  const opts: { value: GoalDirection; Glyph: typeof IconArrowUp; label: string }[] = [
    { value: 'increase_good', Glyph: IconArrowUp, label: 'Increasing is good' },
    { value: 'decrease_good', Glyph: IconArrowDown, label: 'Decreasing is good' },
  ];
  return (
    <View>
      <Text className={`mb-1.5 ${typography.eyebrow}`}>Goal direction</Text>
      <View className="flex-row gap-1.5">
        {opts.map((opt) => {
          const sel = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              onPress={() => onChange(opt.value)}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 ${
                sel ? 'border-neutral-950 bg-neutral-950 dark:border-white dark:bg-white' : 'border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]'
              }`}
            >
              <Icon icon={opt.Glyph} size={16} strokeWidth={1.5} className={`shrink-0 ${sel ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400'}`} />
              <Text className={`shrink text-[13px] font-semibold ${sel ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400'}`}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {/* Ties the abstract choice to what it actually changes below — the
          trend badge and entry-list arrows silently flip color on this. */}
      <Text className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
        Going {value === 'increase_good' ? 'up' : 'down'} will show <Text className="font-semibold text-green-600 dark:text-green-400">green</Text>
      </Text>
    </View>
  );
}

/** The web's animated segmented tab switcher (a sliding white pill). */
function PlanTabSwitcher<T extends string>({ tabs, value, onChange, label }: { tabs: T[]; value: T; onChange: (t: T) => void; label: (t: T) => string }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(tabs.indexOf(value), 0);
  const x = useRef(new Animated.Value(0)).current;
  const segment = width > 0 ? (width - 8) / tabs.length : 0;

  useEffect(() => {
    Animated.spring(x, { toValue: index * segment, stiffness: 400, damping: 30, mass: 0.8, useNativeDriver: true }).start();
  }, [index, segment, x]);

  return (
    <View className="relative flex-row rounded-2xl bg-neutral-100 p-1 dark:bg-white/[0.06]" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {segment > 0 && (
        // Classes go on the inner View: NativeWind doesn't style Animated.View.
        <Animated.View style={{ position: 'absolute', top: 4, bottom: 4, left: 4, width: segment, transform: [{ translateX: x }] }}>
          <View className="flex-1 rounded-xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-800" />
        </Animated.View>
      )}
      {tabs.map((tab) => (
        <Pressable
          key={tab}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === tab }}
          onPress={() => onChange(tab)}
          className="relative z-10 flex-1 items-center rounded-xl py-2.5"
        >
          <Text className={`text-[13px] font-semibold ${value === tab ? 'text-neutral-950 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>{label(tab)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlanDetailViewProps {
  plan: Plan;
  schedule: Schedule;
  milestones: Milestone[];
  /** Set when the surrounding shell already renders the plan title and its
   *  edit/delete actions — the iOS shell does. */
  hideHeader?: boolean;
  onDeletePlan?: (planId: string) => void;
  onEditPlan?: (planId: string) => void;
  /** Absent = the pause affordance is not offered on this surface. */
  onTogglePlanPaused?: (planId: string) => void;
  /** Absent = the adapt affordance is not offered on this surface. */
  onAdaptMilestone?: (milestoneId: string) => void;
  // Task handlers
  onAddTask: (planId: string) => void;
  onEditTask: (task: Task) => void;
  onDeleteLinkedTask: (task: Task, activeDays: DayKey[]) => void;
  onDeleteTaskSlot: (task: Task, day: DayKey, slotIndex: number) => void;
  // Tracker handlers
  onAddTracker: (
    planId: string,
    title: string,
    unit: string,
    goalDirection: GoalDirection,
    id?: string,
    goalValue?: number,
    startingValue?: number,
    dailyTarget?: number,
    cadence?: TrackerCadence,
  ) => void;
  onUpdateTracker: (
    trackerId: string,
    data: { title: string; unit: string; goalDirection: GoalDirection; goalValue?: number; startingValue?: number; dailyTarget?: number; cadence?: TrackerCadence },
  ) => void;
  onDeleteTracker: (trackerId: string) => void;
  // Entry handlers
  onOpenAddEntry: (tracker: ProgressTracker) => void;
  onDeleteEntry: (entryId: string) => void;
  // Milestone handlers
  onAddMilestone: (data: MilestoneSaveData) => void;
  onUpdateMilestone: (id: string, data: Partial<Milestone>) => void;
  onDeleteMilestone: (id: string) => void;
  onMoveMilestone: (id: string, direction: 'up' | 'down') => void;
  onCompleteMilestone: (id: string) => void;
  // Milestone <-> tracker linking — the "success metric" a milestone's
  // metric progress is computed from (lib/milestoneHealth.ts).
  onLinkTrackerToMilestone?: (milestoneId: string, trackerId: string) => void;
  onUnlinkTrackerFromMilestone?: (milestoneId: string, trackerId: string) => void;
  // Milestone <-> task linking — the activity signal calculateMilestoneState
  // reads for task progress/consistency.
  onLinkTaskToMilestone?: (milestoneId: string, taskId: string) => void;
  onUnlinkTaskFromMilestone?: (milestoneId: string, taskId: string) => void;
  /** Milestone <-> routine linking, and the generic form the item views use. */
  onSetMilestoneLink?: (milestoneId: string, kind: MilestoneLinkKind, itemId: string, linked: boolean) => void;
}

type PlanTab = 'planning' | 'roadmap';

/**
 * Native port of components/plan/PlanDetailView.tsx at phone width — the plan
 * header info (held-state banner, description, roadmap date range), the Tasks
 * / Milestones tab switcher, and every section the PWA shows under them:
 * planned tasks, the accuracy calendar, progress trackers (chart, stats strip,
 * entry history, inline edit), the plan-progress roadmap overview and the
 * milestone timeline with move controls — plus the milestone, tracker and
 * task sheets. The PWA's third "Coach" tab is part of the on-device AI scope
 * and isn't offered here; with AI off, the PWA shows these same two tabs.
 */
export default function PlanDetailView({
  plan,
  schedule,
  milestones,
  hideHeader = false,
  onDeletePlan,
  onEditPlan,
  onTogglePlanPaused,
  onAdaptMilestone,
  onAddTask,
  onEditTask,
  onDeleteLinkedTask,
  onDeleteTaskSlot,
  onAddTracker,
  onUpdateTracker,
  onDeleteTracker,
  onOpenAddEntry,
  onDeleteEntry,
  onAddMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onMoveMilestone,
  onCompleteMilestone,
  onLinkTrackerToMilestone,
  onUnlinkTrackerFromMilestone,
  onLinkTaskToMilestone,
  onUnlinkTaskFromMilestone,
  onSetMilestoneLink,
}: PlanDetailViewProps) {
  // Whether this plan is still expected to run. Drives the pause affordance
  // and the held-state banner (lib/planLifecycle.ts).
  const running = isPlanRunning(plan);

  // ── Tab state ───────────────────────────────────────────────────────────
  const [planTab, setPlanTab] = useState<PlanTab>('planning');
  const mobileTabs: PlanTab[] = ['planning', 'roadmap'];

  // ── Tracker edit state ──────────────────────────────────────────────────
  const [editingTrackerId, setEditingTrackerId] = useState<string | null>(null);
  const [editTrackerDraft, setEditTrackerDraft] = useState<{
    title: string;
    unit: string;
    goalDirection: GoalDirection;
    goalValue?: number;
    startingValue?: number;
    dailyTarget?: number;
    cadence: TrackerCadence;
  }>({
    title: '',
    unit: '',
    goalDirection: 'increase_good',
    cadence: 'weekly',
  });

  // ── Add tracker state ───────────────────────────────────────────────────
  const [addingTracker, setAddingTracker] = useState(false);
  const [newTrackerTitle, setNewTrackerTitle] = useState('');
  const [newTrackerUnit, setNewTrackerUnit] = useState('');
  const [newTrackerGoalValue, setNewTrackerGoalValue] = useState('');
  const [newTrackerStartingValue, setNewTrackerStartingValue] = useState('');
  const [newTrackerDailyTarget, setNewTrackerDailyTarget] = useState('');
  const [newTrackerGoalDirection, setNewTrackerGoalDirection] = useState<GoalDirection>('increase_good');
  const [newTrackerCadence, setNewTrackerCadence] = useState<TrackerCadence>('weekly');

  // ── Selected tracker state ──────────────────────────────────────────────
  const [selectedTrackerIdRaw, setSelectedTrackerId] = useState<string | null>(null);

  // ── Milestone sheet state ───────────────────────────────────────────────
  const [milestoneSheetOpen, setMilestoneSheetOpen] = useState(false);
  const [milestoneSheetMode, setMilestoneSheetMode] = useState<'create' | 'edit'>('create');
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  // ── Task detail sheet ────────────────────────────────────────────────────
  const [viewingTask, setViewingTask] = useState<{ task: Task; activeDays: DayKey[]; sourceDay: DayKey } | null>(null);

  // ── Milestone detail sheet ───────────────────────────────────────────────
  const [viewingMilestone, setViewingMilestone] = useState<Milestone | null>(null);

  // ── Section edit modes ──────────────────────────────────────────────────
  const [trackersEditMode, setTrackersEditMode] = useState(false);

  // ── Derived data ────────────────────────────────────────────────────────
  const uniqueTasks = useMemo(() => getUniquePlanTasks(plan.id, schedule.activities), [plan.id, schedule.activities]);

  // Task-id → title lookup for the milestone task-breakdown list.
  const taskTitleById = useMemo(() => new Map(uniqueTasks.map(({ task }) => [task.id, task.title])), [uniqueTasks]);

  const trackers = useMemo(() => schedule.progressTrackers.filter((t) => t.planId === plan.id), [plan.id, schedule.progressTrackers]);

  const selectedTrackerId = useMemo(() => {
    if (trackers.length === 0) return null;
    if (selectedTrackerIdRaw && trackers.some((t) => t.id === selectedTrackerIdRaw)) return selectedTrackerIdRaw;
    return trackers[0].id;
  }, [trackers, selectedTrackerIdRaw]);

  const selectedTracker = useMemo(
    () => (selectedTrackerId ? trackers.find((t) => t.id === selectedTrackerId) ?? null : null),
    [trackers, selectedTrackerId],
  );

  const planMilestones = useMemo(() => milestones.filter((m) => m.planId === plan.id).sort((a, b) => a.sortOrder - b.sortOrder), [milestones, plan.id]);

  // Live linked-task/subtask completion per milestone — computed once for the
  // whole list and reused by both the row's progress bar and the detail sheet.
  const milestoneProgressById = useMemo(() => {
    const map = new Map<string, MilestoneProgress>();
    for (const m of planMilestones) {
      map.set(m.id, calculateMilestoneProgress(m, schedule.activities as unknown as Record<string, Task[]>, plan));
    }
    return map;
  }, [planMilestones, schedule.activities, plan]);

  // Live health/forecast layer — task progress, recurring-task consistency,
  // and (when a tracker is linked) metric progress, combined into one health
  // state + forecasted completion date.
  const milestoneStateById = useMemo(() => {
    const map = new Map<string, MilestoneState>();
    for (const m of planMilestones) {
      map.set(
        m.id,
        calculateMilestoneState({
          milestone: m,
          plan,
          activities: schedule.activities as unknown as Record<string, Task[]>,
          trackers: schedule.progressTrackers,
          metricEntries: schedule.metricEntries,
          trackingStart: schedule.preferences?.startDate,
          milestones: schedule.milestones,
          rituals: schedule.rituals,
          ritualCompletions: schedule.ritualCompletions,
        }),
      );
    }
    return map;
  }, [planMilestones, schedule.activities, schedule.progressTrackers, schedule.metricEntries, schedule.preferences?.startDate, schedule.milestones, schedule.rituals, schedule.ritualCompletions, plan]);

  const roadmapStats = useMemo(
    () => computeRoadmapStats(plan.id, schedule.activities as unknown as Record<string, Task[]>, milestones, plan),
    [plan, schedule.activities, milestones],
  );

  const roadmapEndDate = planEffectiveEndDate(plan, planMilestones);
  const dateRange = plan.startDate && roadmapEndDate ? `${formatPlanDate(plan.startDate)} – ${formatPlanDate(roadmapEndDate)}` : formatPlanRange(plan);

  // ── Tracker handlers ────────────────────────────────────────────────────

  function handleAddTracker() {
    const title = newTrackerTitle.trim();
    if (!title) return;
    const goalValue = newTrackerGoalValue.trim() ? Number(newTrackerGoalValue) : undefined;
    const startingValue = newTrackerStartingValue.trim() ? Number(newTrackerStartingValue) : undefined;
    const dailyTarget = newTrackerDailyTarget.trim() ? Number(newTrackerDailyTarget) : undefined;
    onAddTracker(
      plan.id,
      title,
      newTrackerUnit.trim(),
      newTrackerGoalDirection,
      undefined,
      Number.isFinite(goalValue) ? goalValue : undefined,
      Number.isFinite(startingValue) ? startingValue : undefined,
      Number.isFinite(dailyTarget) ? dailyTarget : undefined,
      newTrackerCadence,
    );
    setNewTrackerTitle('');
    setNewTrackerUnit('');
    setNewTrackerGoalValue('');
    setNewTrackerStartingValue('');
    setNewTrackerDailyTarget('');
    setNewTrackerGoalDirection('increase_good');
    setNewTrackerCadence('weekly');
    setAddingTracker(false);
  }

  function handleSaveEditTracker(trackerId: string) {
    const title = editTrackerDraft.title.trim();
    if (!title) return;
    onUpdateTracker(trackerId, {
      title,
      unit: editTrackerDraft.unit.trim(),
      goalDirection: editTrackerDraft.goalDirection,
      goalValue: editTrackerDraft.goalValue,
      startingValue: editTrackerDraft.startingValue,
      dailyTarget: editTrackerDraft.dailyTarget,
      cadence: editTrackerDraft.cadence,
    });
    setEditingTrackerId(null);
  }

  function closeAddTracker() {
    setAddingTracker(false);
    setNewTrackerTitle('');
    setNewTrackerUnit('');
    setNewTrackerGoalValue('');
    setNewTrackerGoalDirection('increase_good');
  }

  // ── Milestone handlers ──────────────────────────────────────────────────

  function openAddMilestone() {
    setEditingMilestone(null);
    setMilestoneSheetMode('create');
    setMilestoneSheetOpen(true);
  }

  function openEditMilestone(m: Milestone) {
    setEditingMilestone(m);
    setMilestoneSheetMode('edit');
    setMilestoneSheetOpen(true);
  }

  function handleMilestoneSave(data: MilestoneSaveData) {
    // A brand-new success-metric tracker is created first, so it exists before
    // the milestone is saved pointing at it (data.linkedTrackers is already
    // set to [newTracker.id] by MilestoneSheet).
    if (data.newTracker) {
      const { id, title: trackerTitle, unit, goalDirection, goalValue, startingValue } = data.newTracker;
      onAddTracker(plan.id, trackerTitle, unit, goalDirection, id, goalValue, startingValue);
    }
    if (milestoneSheetMode === 'edit' && editingMilestone) {
      onUpdateMilestone(editingMilestone.id, data);
    } else {
      // Assign sortOrder = current length
      onAddMilestone({ ...data, sortOrder: planMilestones.length });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  const editFieldClass =
    'h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300';

  function renderLinkedTaskRow(task: Task, activeDays: DayKey[], isLastRow: boolean) {
    const duration = formatDuration(task.startTime, task.endTime);
    const subtaskCount = getTaskCheckableItems(task, plan).length;
    const isRoutine = task.taskType === 'session';
    const hasTime = task.startTime || task.endTime;

    return (
      <Pressable
        key={`${task.id}-${activeDays.join('')}`}
        accessibilityRole="button"
        onPress={() => setViewingTask({ task, activeDays, sourceDay: activeDays[0] })}
        className={`w-full flex-row items-center gap-3 rounded-xl px-3 py-3.5 active:bg-neutral-100 dark:active:bg-white/[0.06] ${
          isLastRow ? '' : 'border-b border-neutral-100 dark:border-white/[0.05]'
        }`}
      >
        <View className="min-w-0 flex-1">
          {/* Line 1: Title */}
          <Text className="text-[16px] font-semibold leading-tight text-neutral-900 dark:text-white">{task.title}</Text>
          {/* Line 2: Time + duration + subtask count */}
          <View className="mt-1.5 flex-row flex-wrap items-center gap-2">
            {hasTime ? (
              <Text className="shrink-0 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                {formatDisplayTime(task.startTime)}
                {task.endTime ? ` – ${formatDisplayTime(task.endTime)}` : ''}
                {duration ? ` · ${duration}` : ''}
              </Text>
            ) : null}
            {subtaskCount > 0 && (
              <View className="shrink-0 flex-row items-center gap-1">
                <Icon icon={IconListCheck} size={13} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{subtaskCount}</Text>
              </View>
            )}
          </View>
          {/* Line 3: Session badge (only for session tasks) */}
          {isRoutine && (
            <View className="mt-1.5 flex-row">
              <View className="flex-row items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 dark:bg-amber-900/25">
                <Icon icon={IconStack2} size={10} strokeWidth={2.5} className="text-amber-600 dark:text-amber-400" />
                <Text className="text-[11px] font-bold text-amber-600 dark:text-amber-400">Session</Text>
              </View>
            </View>
          )}
          {/* Line 4: Active days */}
          <View className="mt-2 flex-row items-center gap-[5px]">
            {WEEKDAY_ORDER.map((day) => (
              <DayPill key={day} label={WEEKDAY_SHORT[day]} active={activeDays.includes(day)} />
            ))}
          </View>
        </View>
        <Icon icon={IconChevronRight} size={16} strokeWidth={2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
      </Pressable>
    );
  }

  function renderTrackerCard(tracker: ProgressTracker) {
    const entries: MetricEntry[] = schedule.metricEntries.filter((e) => e.trackerId === tracker.id).sort((a, b) => a.date.localeCompare(b.date));
    const lastTwo = entries.slice(-2);
    const goalDir = tracker.goalDirection ?? 'increase_good';
    const trendResult =
      lastTwo.length === 2
        ? computeTrend({
            previous: lastTwo[0].value,
            current: lastTwo[1].value,
            goalDirection: goalDir,
          })
        : null;
    const isEditingThis = editingTrackerId === tracker.id;

    const entryRows = [...entries].reverse().map((entry, index) => {
      const chronIdx = entries.length - 1 - index;
      const prev = chronIdx > 0 ? entries[chronIdx - 1] : null;
      const entryTrend = prev ? computeTrend({ previous: prev.value, current: entry.value, goalDirection: goalDir }) : null;
      return (
        <View
          key={entry.id}
          className={`flex-row items-center justify-between py-2.5 ${index === entries.length - 1 ? '' : 'border-b border-neutral-100 dark:border-white/[0.06]'}`}
        >
          <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{formatDateShort(entry.date)}</Text>
          <View className="flex-row items-center gap-2">
            {entryTrend && entryTrend.direction !== 'neutral' && (
              <Icon
                icon={entryTrend.direction === 'up' ? IconArrowUpRight : IconArrowDownRight}
                size={16}
                strokeWidth={1.5}
                className={`shrink-0 ${entryTrend.state === 'positive' ? 'text-green-500' : 'text-rose-500'}`}
              />
            )}
            <Text className="text-[14px] font-semibold tabular-nums text-neutral-950 dark:text-white">
              {entry.value}
              {tracker.unit ? <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400"> {tracker.unit}</Text> : null}
            </Text>
            <IconButton label="Delete entry" variant="dangerGhost" size="xxs" radius="lg" onPress={() => onDeleteEntry(entry.id)}>
              <Icon icon={IconTrash} size={14} strokeWidth={1.5} className={ICON_BUTTON_TONE.dangerGhost} />
            </IconButton>
          </View>
        </View>
      );
    });

    return (
      <View key={tracker.id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
        {/* Tracker header */}
        <View className="px-5 pb-4 pt-5">
          {isEditingThis ? (
            <View className="gap-2">
              <TextInput
                value={editTrackerDraft.title}
                onChangeText={(v) => setEditTrackerDraft((d) => ({ ...d, title: v }))}
                placeholder="Tracker name"
                autoFocus
                className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-medium text-neutral-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
              />
              <TextInput
                value={editTrackerDraft.unit}
                onChangeText={(v) => setEditTrackerDraft((d) => ({ ...d, unit: v }))}
                placeholder="Unit (optional)"
                className={editFieldClass}
              />
              <TextInput
                keyboardType="decimal-pad"
                value={editTrackerDraft.goalValue !== undefined ? String(editTrackerDraft.goalValue) : ''}
                onChangeText={(v) => setEditTrackerDraft((d) => ({ ...d, goalValue: v ? Number(v) : undefined }))}
                placeholder={`Goal value${editTrackerDraft.unit ? ` (${editTrackerDraft.unit})` : ''} — optional`}
                className={editFieldClass}
              />
              <TextInput
                keyboardType="decimal-pad"
                value={editTrackerDraft.startingValue !== undefined ? String(editTrackerDraft.startingValue) : ''}
                onChangeText={(v) => setEditTrackerDraft((d) => ({ ...d, startingValue: v ? Number(v) : undefined }))}
                placeholder={`Starting value${editTrackerDraft.unit ? ` (${editTrackerDraft.unit})` : ''} — optional, defaults to your first log`}
                className={editFieldClass}
              />
              {/* A per-day amount, distinct from the goal value above: this one
                  resets every night. Setting it is what turns the tracker into a
                  daily ring on the Tracking page instead of a running value. */}
              <TextInput
                keyboardType="decimal-pad"
                value={editTrackerDraft.dailyTarget !== undefined ? String(editTrackerDraft.dailyTarget) : ''}
                onChangeText={(v) => setEditTrackerDraft((d) => ({ ...d, dailyTarget: v ? Number(v) : undefined }))}
                placeholder={`Daily target${editTrackerDraft.unit ? ` (${editTrackerDraft.unit})` : ''} — optional, resets each day`}
                className={editFieldClass}
              />
              <GoalDirectionPicker value={editTrackerDraft.goalDirection} onChange={(gd) => setEditTrackerDraft((d) => ({ ...d, goalDirection: gd }))} />
              <CadencePicker value={editTrackerDraft.cadence} onChange={(cadence) => setEditTrackerDraft((d) => ({ ...d, cadence }))} />
              <View className="flex-row gap-2 pt-1">
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleSaveEditTracker(tracker.id)}
                  className="h-9 flex-1 flex-row items-center justify-center gap-1 rounded-xl bg-neutral-950 dark:bg-white"
                >
                  <Icon icon={IconCheck} size={16} className="text-white dark:text-neutral-950" />
                  <Text className="text-[13px] font-semibold text-white dark:text-neutral-950">Save</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setEditingTrackerId(null)}
                  className="h-9 flex-row items-center gap-1 rounded-xl border border-neutral-200 px-4 dark:border-white/10"
                >
                  <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text accessibilityRole="header" className="text-[20px] font-bold leading-tight text-neutral-950 dark:text-white">
                  {tracker.title}
                  {tracker.unit ? <Text className="text-[16px] font-normal text-neutral-500 dark:text-neutral-400"> ({tracker.unit})</Text> : null}
                </Text>
                {trendResult !== null && trendResult.direction !== 'neutral' && <TrendBadge trend={trendResult} />}
              </View>
              {trackersEditMode && (
                <View className="-mt-0.5 shrink-0 flex-row items-center gap-0.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit tracker"
                    onPress={() => {
                      setEditingTrackerId(tracker.id);
                      setEditTrackerDraft({
                        title: tracker.title,
                        unit: tracker.unit ?? '',
                        goalDirection: tracker.goalDirection ?? 'increase_good',
                        goalValue: tracker.goalValue,
                        startingValue: tracker.startingValue,
                        dailyTarget: tracker.dailyTarget,
                        cadence: trackerCadence(tracker),
                      });
                    }}
                    className="h-8 w-8 items-center justify-center rounded-lg"
                  >
                    <Icon icon={IconEdit} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                  </Pressable>
                  <IconButton label="Delete tracker" variant="dangerGhost" size="xs" radius="lg" onPress={() => onDeleteTracker(tracker.id)}>
                    <Icon icon={IconTrash} size={16} strokeWidth={2} className={ICON_BUTTON_TONE.dangerGhost} />
                  </IconButton>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Chart */}
        {!isEditingThis && (
          <View className="px-3 pb-3">
            {entries.length > 0 ? (
              <>
                <ProgressChart entries={entries} color={plan.color} metric={{ name: tracker.title, unit: tracker.unit ?? '' }} goalValue={tracker.goalValue} />
                {/* The chart/trend-badge color is driven by goalDirection, set
                    once in the tracker form and otherwise invisible here. */}
                <Text className="mt-1.5 text-[10px] text-neutral-500 dark:text-neutral-400">
                  <Text className="font-semibold text-green-600 dark:text-green-400">Green</Text> = trending toward your goal
                </Text>
              </>
            ) : (
              <View className="rounded-xl bg-neutral-50 py-8 dark:bg-white/[0.03]">
                <Text className="text-center text-[13px] text-neutral-500 dark:text-neutral-400">No entries yet</Text>
              </View>
            )}
          </View>
        )}

        {/* Stats strip */}
        {!isEditingThis &&
          entries.length > 0 &&
          (() => {
            const last = entries[entries.length - 1];
            const avg = entries.reduce((s, e) => s + e.value, 0) / entries.length;
            const unit = tracker.unit ? ` ${tracker.unit}` : '';
            const fmtAvg = Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
            const todayTotal = sumEntriesForDate(schedule.metricEntries, tracker.id, todayISO());
            return (
              <View className="flex-row items-stretch border-t border-neutral-100 dark:border-white/[0.06]">
                {[
                  ...(todayTotal > 0 ? [{ label: 'Today', value: `${todayTotal}${unit}` }] : []),
                  { label: 'Last', value: `${last.value}${unit}` },
                  { label: 'Avg (all)', value: `${fmtAvg}${unit}` },
                  { label: 'Logged', value: `${entries.length}` },
                ].map(({ label, value }, i) => (
                  <View key={label} className={`flex-1 px-4 py-3 ${i > 0 ? 'border-l border-neutral-100 dark:border-white/[0.06]' : ''}`}>
                    <Text className="text-center text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">{label}</Text>
                    <Text className="mt-0.5 text-center text-[16px] font-bold tabular-nums text-neutral-950 dark:text-white">{value}</Text>
                  </View>
                ))}
              </View>
            );
          })()}

        {/* All entries */}
        {!isEditingThis && (
          <View className="border-t border-neutral-100 px-5 pb-5 dark:border-white/[0.06]">
            <View className="flex-row items-center justify-between py-3.5">
              <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                {entries.length > 0 ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : 'Entries'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => onOpenAddEntry(tracker)} hitSlop={8} className="flex-row items-center gap-1.5">
                <Icon icon={IconPlus} size={12} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Add entry</Text>
              </Pressable>
            </View>
            {entries.length === 0 ? (
              <Text className="pb-1 text-[12px] text-neutral-500 dark:text-neutral-400">Tap Add Entry to start tracking.</Text>
            ) : entries.length > 6 ? (
              <ScrollView nestedScrollEnabled style={{ maxHeight: 280 }}>
                {entryRows}
              </ScrollView>
            ) : (
              <View>{entryRows}</View>
            )}
          </View>
        )}
      </View>
    );
  }

  function renderMilestoneCard(m: Milestone, isFirst: boolean, isLast: boolean) {
    const status = resolveMilestoneStatus(m);
    const isCompleted = status === 'completed';
    const progress = milestoneProgressById.get(m.id);
    const health = milestoneStateById.get(m.id);
    const isActive = status === 'active';
    const isDelayed = status === 'delayed';
    const daysLabel = `${m.plannedDurationDays} Day${m.plannedDurationDays === 1 ? '' : 's'}`;
    const rangeLabel = `${formatDate(m.startDate)} – ${formatDate(m.plannedEndDate)}`;
    // Only worth a second badge once it says something the lifecycle status
    // pill doesn't already.
    const showHealthBadge = health && !['not_started', 'completed', 'getting_started'].includes(health.health);

    return (
      <View className="relative flex-row items-center gap-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={m.title}
          onPress={() => {
            haptic('light');
            setViewingMilestone(m);
          }}
          className="relative min-w-0 flex-1 flex-row gap-[14px] rounded-xl px-3 pb-[18px] pt-[14px] active:bg-white/60 dark:active:bg-white/[0.03]"
        >
          {/* Connector line to next item — runs past this row's bottom edge so
              it reaches the following marker. */}
          {!isLast && (
            <ConnectorLine
              dashed={!isCompleted}
              colorClassName={isCompleted ? 'border-green-500' : isDelayed ? 'border-amber-400 dark:border-amber-600' : 'border-green-200 dark:border-green-800/60'}
              style={{ top: 44, bottom: -16, left: 26 }}
            />
          )}

          {/* Marker. The 4px ring masks the connector, so it matches the page
              background behind it (#F3F4F1 / #0E0E0E). */}
          <View className="relative z-10 -m-1 mt-[-2px] rounded-full bg-[#F3F4F1] p-1 dark:bg-[#0E0E0E]">
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              className={`h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                isCompleted
                  ? 'bg-green-500'
                  : isDelayed
                    ? 'border-2 border-amber-500 bg-amber-50 dark:bg-amber-950/30'
                    : isActive
                      ? 'border-2 border-green-500 bg-green-100 dark:bg-green-950'
                      : 'border-[2.5px] border-green-500 bg-white dark:bg-neutral-950'
              }`}
            >
              {isCompleted ? (
                <Icon icon={IconCheck} size={14} strokeWidth={3} className="text-white" />
              ) : isDelayed ? (
                <Icon icon={IconAlertTriangle} size={11} strokeWidth={2.5} className="text-amber-500" />
              ) : isActive ? (
                <View className="h-[9px] w-[9px] rounded-full bg-green-500" />
              ) : null}
            </View>
          </View>

          {/* Body */}
          <View className="min-w-0 flex-1">
            {isActive && <Text className="mb-0.5 text-[12px] font-bold tracking-[-0.1px] text-green-600 dark:text-green-400">Current milestone</Text>}
            {isDelayed && <Text className="mb-0.5 text-[12px] font-bold tracking-[-0.1px] text-amber-600 dark:text-amber-400">Overdue</Text>}
            <View className="mb-1 flex-row flex-wrap items-center gap-2">
              <Text
                className={`shrink text-[16px] leading-snug tracking-[-0.3px] ${
                  isCompleted ? 'font-semibold text-neutral-400 line-through dark:text-neutral-500' : 'font-bold text-neutral-950 dark:text-white'
                }`}
              >
                {m.title}
              </Text>
              {showHealthBadge && <MilestoneHealthBadge health={health.health} />}
            </View>
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">{rangeLabel}</Text>
              <View
                className={`shrink-0 flex-row items-center rounded-full border px-[10px] py-[3px] ${
                  isActive
                    ? 'border-neutral-950 bg-neutral-950 dark:border-white dark:bg-white'
                    : isDelayed
                      ? 'border-amber-400/60 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10'
                      : 'border-neutral-200 dark:border-white/[0.12]'
                }`}
              >
                <Text
                  className={`text-[10.5px] font-bold ${
                    isActive ? 'text-neutral-50 dark:text-neutral-950' : isDelayed ? 'text-amber-700 dark:text-amber-400' : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  {daysLabel}
                </Text>
              </View>
            </View>
            {/* Linked tasks + tracker badges — live linked-task/subtask
                completion when there's anything to show. */}
            {((m.linkedActivities?.length ?? 0) > 0 || (m.linkedTrackers?.length ?? 0) > 0 || (m.linkedRituals?.length ?? 0) > 0) && (
              <View className="mt-1.5 flex-row items-center gap-2">
                {(m.linkedActivities?.length ?? 0) > 0 && (
                  <View className="flex-row items-center gap-1">
                    <Icon icon={IconCheck} size={11} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />
                    <Text className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {progress?.hasLinkedTasks
                        ? `${progress.completedCount}/${progress.totalCount} tasks · ${progress.pct}%`
                        : `${m.linkedActivities!.length} task${m.linkedActivities!.length !== 1 ? 's' : ''}`}
                    </Text>
                  </View>
                )}
                {(m.linkedTrackers?.length ?? 0) > 0 && (
                  <View className="flex-row items-center gap-1">
                    <Icon icon={IconChartLine} size={12} strokeWidth={2} className="shrink-0 text-violet-600 dark:text-violet-400" />
                    <Text className="text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                      {m.linkedTrackers!.length} tracker{m.linkedTrackers!.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
                {(m.linkedRituals?.length ?? 0) > 0 && (
                  <View className="flex-row items-center gap-1">
                    <Icon icon={IconRepeat} size={12} strokeWidth={2} className="shrink-0 text-neutral-600 dark:text-neutral-400" />
                    <Text className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                      {m.linkedRituals!.length} routine{m.linkedRituals!.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {health?.overallProgress !== null && health?.overallProgress !== undefined && (
              <ProgressBar
                pct={health.overallProgress}
                height={4}
                fillClassName={isCompleted ? 'bg-neutral-300 dark:bg-white/20' : 'bg-emerald-500'}
                className="mt-1.5 max-w-[160px]"
              />
            )}
            {/* Forecast vs target — only once there's an actual projection. */}
            {health?.forecastDate && showHealthBadge && (
              <Text className="mt-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Projected {formatDateShort(health.forecastDate)} · Target {formatDateShort(m.plannedEndDate)}
              </Text>
            )}
          </View>

          <Icon icon={IconChevronRight} size={16} strokeWidth={2} className="shrink-0 self-center text-neutral-400 dark:text-neutral-500" />
        </Pressable>
        {/* Sequence controls — a sibling of the row, so "move" never also
            opens the detail sheet. */}
        <View className="shrink-0 gap-0.5">
          <IconButton
            label={`Move "${m.title}" earlier`}
            size="xxs"
            variant="ghost"
            disabled={isFirst}
            onPress={() => {
              haptic('light');
              onMoveMilestone(m.id, 'up');
            }}
          >
            <Icon icon={IconArrowUp} size={13} strokeWidth={2} className={ICON_BUTTON_TONE.ghost} />
          </IconButton>
          <IconButton
            label={`Move "${m.title}" later`}
            size="xxs"
            variant="ghost"
            disabled={isLast}
            onPress={() => {
              haptic('light');
              onMoveMilestone(m.id, 'down');
            }}
          >
            <Icon icon={IconArrowDown} size={13} strokeWidth={2} className={ICON_BUTTON_TONE.ghost} />
          </IconButton>
        </View>
      </View>
    );
  }

  // ── Roadmap overview ─────────────────────────────────────────────────────

  function renderRoadmapOverview() {
    const { currentPhaseName, consistencyPct, overallPct, overallPctFromLinkedTasks, totalMilestones } = roadmapStats;
    const targetLabel = roadmapStats.targetDate ? formatPlanDate(roadmapStats.targetDate) : '—';
    const progressSummary =
      overallPct === 0 ? 'Complete a task in this plan to start progress.' : overallPct >= 80 ? "You're on track." : 'Progress is building as you complete plan tasks.';
    // Names the source so Plan Progress, Task Consistency and Accuracy read as
    // complementary, not disagreeing.
    const progressBlendNote =
      totalMilestones === 0
        ? '= Task Consistency (no milestones yet)'
        : overallPctFromLinkedTasks
          ? 'Based on linked task & subtask completion'
          : '= Task Consistency (no linked tasks yet)';

    const tiles: { label: string; value: string; caption: string | null }[] = [
      { label: 'Current focus', value: currentPhaseName ?? 'Starting out', caption: null },
      { label: 'Task consistency', value: `${consistencyPct}%`, caption: 'Since plan start' },
      {
        label: 'Days left',
        value: roadmapStats.targetDate ? String(Math.max(0, Math.ceil((new Date(roadmapStats.targetDate).getTime() - Date.now()) / 86_400_000))) : '—',
        caption: null,
      },
      { label: 'Target date', value: targetLabel, caption: null },
    ];

    return (
      <View className="gap-[10px]">
        {/* Plan Progress card */}
        <View className="rounded-2xl border border-neutral-200 bg-white px-[18px] pb-4 pt-[18px] dark:border-white/[0.08] dark:bg-neutral-900">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-[16px] font-bold tracking-[-0.4px] text-neutral-950 dark:text-white">Plan progress</Text>
            <Text className="text-[20px] font-extrabold tracking-[-0.5px] text-green-600 dark:text-green-400">{overallPct}%</Text>
          </View>

          <ProgressBar pct={overallPct} height={10} fillClassName="bg-green-600" className="mb-3" />

          <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{progressSummary}</Text>
          <Text className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">{progressBlendNote}</Text>
        </View>

        {/* 2×2 stats grid */}
        <View className="flex-row flex-wrap" style={{ margin: -5 }}>
          {tiles.map(({ label, value, caption }) => (
            <View key={label} style={{ width: '50%', padding: 5 }}>
              <View className="flex-1 rounded-[14px] border border-neutral-200 bg-neutral-50 px-[14px] py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
                <Text className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.7px] text-neutral-500 dark:text-neutral-400">{label}</Text>
                <Text className="text-[19px] font-extrabold leading-[1.1] tracking-[-0.5px] text-neutral-950 dark:text-white">{value}</Text>
                {caption && <Text className="mt-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">{caption}</Text>}
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  /* ── Sections ──────────────────────────────────────────────────────────── */

  function plannedTasksSection() {
    return (
      <View>
        <InternalSectionTitle
          title="Planned tasks"
          className="mb-4"
          actions={
            <View className="flex-row items-center gap-1">
              <SectionIconButton
                icon={<Icon icon={IconPlus} size={20} strokeWidth={2} className="text-neutral-700 dark:text-neutral-300" />}
                onClick={() => onAddTask(plan.id)}
                label="Add task"
              />
            </View>
          }
        />

        <View className="rounded-2xl border border-neutral-200 bg-white px-4 dark:border-white/[0.08] dark:bg-neutral-900">
          {uniqueTasks.length === 0 ? (
            <View className="items-center py-10">
              <Text className="max-w-[220px] text-center text-[14px] font-medium text-neutral-500 dark:text-neutral-400">
                Link tasks to this plan to keep everything connected.
              </Text>
            </View>
          ) : (
            uniqueTasks.map(({ task, activeDays }, i) => renderLinkedTaskRow(task, activeDays, i === uniqueTasks.length - 1))
          )}
        </View>
      </View>
    );
  }

  function progressTrackingSection() {
    return (
      <View>
        <InternalSectionTitle
          title="Progress tracking"
          className="mb-4"
          actions={
            <>
              <SectionIconButton
                icon={<Icon icon={IconPlus} size={20} strokeWidth={2} className="text-neutral-700 dark:text-neutral-300" />}
                onClick={() => setAddingTracker(true)}
                label="Add tracker"
              />
              {trackers.length > 0 && (
                <SectionIconButton
                  icon={<Icon icon={IconEdit} size={20} strokeWidth={2} className="text-neutral-700 dark:text-neutral-300" />}
                  saveIcon={<Icon icon={IconCheck} size={20} strokeWidth={2} className="text-white dark:text-neutral-950" />}
                  saving={trackersEditMode}
                  onClick={() => setTrackersEditMode((v) => !v)}
                  label={trackersEditMode ? 'Done editing' : 'Edit trackers'}
                />
              )}
            </>
          }
        />

        {trackers.length === 0 ? (
          <View className="items-center rounded-2xl border border-neutral-200 bg-white py-10 dark:border-white/[0.08] dark:bg-neutral-900">
            <Text className="text-[14px] font-medium text-neutral-500 dark:text-neutral-400">No progress trackers yet.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setAddingTracker(true)}
              className="mt-3 flex-row items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 active:bg-neutral-50 dark:border-white/10 dark:active:bg-white/[0.04]"
            >
              <Icon icon={IconPlus} size={16} strokeWidth={2} className="text-neutral-600 dark:text-neutral-400" />
              <Text className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">Create tracker</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {trackers.length > 1 && selectedTrackerId && (
              <View className="mb-4">
                <TrackerTabs tabs={trackers.map((t) => ({ id: t.id, label: t.title }))} activeId={selectedTrackerId} onChange={setSelectedTrackerId} />
              </View>
            )}
            {selectedTracker && renderTrackerCard(selectedTracker)}
          </>
        )}
      </View>
    );
  }

  function accuracySection() {
    return (
      <View>
        {/* planEndDate is the ROADMAP's end, not the typed one: days past the
            stored endDate but inside a milestone are real plan days. */}
        <AccuracyCalendar
          planId={plan.id}
          activities={schedule.activities}
          planStartDate={plan.startDate}
          planEndDate={roadmapEndDate}
          trackingStart={schedule.preferences?.startDate}
          onAddTask={() => onAddTask(plan.id)}
        />
      </View>
    );
  }

  /** Plan Progress + stat tiles + the milestone timeline, under one heading. */
  function milestonesSection() {
    return (
      <View>
        <InternalSectionTitle
          title="Milestones"
          className="mb-4"
          actions={
            <SectionIconButton
              icon={<Icon icon={IconPlus} size={20} strokeWidth={2} className="text-neutral-700 dark:text-neutral-300" />}
              onClick={openAddMilestone}
              label="Add milestone"
            />
          }
        />

        <View className="mb-6">{renderRoadmapOverview()}</View>

        {planMilestones.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-neutral-200 py-12 dark:border-white/[0.08]">
            <Text className="max-w-[220px] text-center text-[14px] font-medium text-neutral-500 dark:text-neutral-400">Add milestones to track your progress journey.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={openAddMilestone}
              className="mt-3 flex-row items-center gap-1.5 rounded-xl border border-neutral-200 px-4 py-2 active:bg-neutral-50 dark:border-white/10 dark:active:bg-white/[0.04]"
            >
              <Icon icon={IconPlus} size={16} strokeWidth={1.5} className="text-neutral-600 dark:text-neutral-400" />
              <Text className="text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">Add first milestone</Text>
            </Pressable>
          </View>
        ) : (
          <View accessibilityRole="list">
            {planMilestones.map((m, idx) => (
              <View key={m.id}>{renderMilestoneCard(m, idx === 0, idx === planMilestones.length - 1)}</View>
            ))}
          </View>
        )}
      </View>
    );
  }

  const sheetMax = Dimensions.get('window').height * 0.85;

  // ─────────────────────────────────────────────────────────────────────────
  // Main render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View>
      {/* Plan info. When the shell owns the header (hideHeader), it already
          pads the content below its fixed header — no top padding here. */}
      <View className={`gap-2 px-4 ${hideHeader ? 'pt-0' : 'pt-3'}`}>
        {!hideHeader && (
          <View className="flex-row items-start justify-between gap-4">
            <Text accessibilityRole="header" className="min-w-0 flex-1 text-[32px] font-bold leading-tight text-neutral-950 dark:text-white">
              {plan.title}
            </Text>
            <View className="shrink-0 flex-row items-center gap-2">
              {onTogglePlanPaused && (
                <IconButton
                  label={running ? 'Pause plan' : 'Resume plan'}
                  variant="ghost"
                  size="md"
                  radius="xl"
                  onPress={() => {
                    haptic('light');
                    onTogglePlanPaused(plan.id);
                  }}
                  className="h-10 w-10 border border-neutral-200 dark:border-white/10"
                >
                  <Icon icon={running ? IconPlayerPause : IconPlayerPlay} size={18} strokeWidth={1.9} className={ICON_BUTTON_TONE.ghost} />
                </IconButton>
              )}
              {onEditPlan && (
                <IconButton
                  label="Edit plan"
                  variant="ghost"
                  size="md"
                  radius="xl"
                  onPress={() => {
                    haptic('light');
                    onEditPlan(plan.id);
                  }}
                  className="h-10 w-10 border border-neutral-200 dark:border-white/10"
                >
                  <Icon icon={IconEdit} size={18} strokeWidth={1.9} className={ICON_BUTTON_TONE.ghost} />
                </IconButton>
              )}
              {onDeletePlan && (
                <IconButton
                  label="Delete plan"
                  variant="dangerGhost"
                  size="md"
                  radius="xl"
                  onPress={() => {
                    haptic('light');
                    onDeletePlan(plan.id);
                  }}
                  className="h-10 w-10 border border-neutral-200 dark:border-white/10"
                >
                  <Icon icon={IconTrash} size={18} strokeWidth={1.9} className={ICON_BUTTON_TONE.dangerGhost} />
                </IconButton>
              )}
            </View>
          </View>
        )}
        {/* Held state, stated plainly. Neutral, never alarm-coloured. */}
        {!running && (
          <View className="flex-row items-start gap-2.5 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
            <Icon icon={IconPlayerPause} size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-neutral-500 dark:text-neutral-400" />
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] font-bold text-neutral-800 dark:text-neutral-200">{planLifecycleLabel(plan)}</Text>
              <Text className="text-[12.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                Its tasks aren't expected while it's {planLifecycleLabel(plan).toLowerCase()} — nothing is marked missed and no streak counts against you. Everything is
                kept, and resuming puts it back exactly as it was.
              </Text>
            </View>
          </View>
        )}
        {plan.description ? <Text className="text-[16px] leading-relaxed text-neutral-600 dark:text-neutral-400">{plan.description}</Text> : null}
        {dateRange ? <Text className="text-[14px] font-medium text-neutral-500 dark:text-neutral-400">{dateRange}</Text> : null}
      </View>

      {/* ── Tab switcher ── */}
      <View className="mx-4 mt-6">
        <PlanTabSwitcher tabs={mobileTabs} value={planTab} onChange={setPlanTab} label={(tab) => (tab === 'planning' ? 'Tasks' : 'Milestones')} />
      </View>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <View className="mt-6 px-4">
        {planTab === 'planning' ? (
          <>
            <View className="min-w-0 gap-8">{plannedTasksSection()}</View>
            <View className="mt-8 min-w-0 gap-8">
              {accuracySection()}
              {progressTrackingSection()}
            </View>
          </>
        ) : (
          <View className="min-w-0 gap-8">{milestonesSection()}</View>
        )}
      </View>

      {/* Milestone sheet */}
      <MilestoneSheet
        mode={milestoneSheetMode}
        milestone={editingMilestone}
        milestones={planMilestones}
        trackers={trackers}
        planStartDate={plan.startDate}
        isOpen={milestoneSheetOpen}
        onClose={() => {
          setMilestoneSheetOpen(false);
          setEditingMilestone(null);
          setMilestoneSheetMode('create');
        }}
        onSave={handleMilestoneSave}
      />

      {/* Add tracker sheet */}
      <BottomSheet open={addingTracker} onClose={closeAddTracker} maxHeight={Dimensions.get('window').height * 0.8}>
        <View className="gap-4 p-5 pb-8">
          <SheetHeader eyebrow="New" title="Create tracker" onClose={closeAddTracker} />
          <View className="gap-2.5">
            <Input
              value={newTrackerTitle}
              onChangeText={setNewTrackerTitle}
              placeholder="Tracker name"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => {
                if (newTrackerTitle.trim()) handleAddTracker();
              }}
            />
            <Input value={newTrackerUnit} onChangeText={setNewTrackerUnit} placeholder="Unit (optional)" />
            <Input
              keyboardType="decimal-pad"
              value={newTrackerGoalValue}
              onChangeText={setNewTrackerGoalValue}
              placeholder={`Goal value${newTrackerUnit.trim() ? ` (${newTrackerUnit.trim()})` : ''} — optional`}
            />
            <Input
              keyboardType="decimal-pad"
              value={newTrackerStartingValue}
              onChangeText={setNewTrackerStartingValue}
              placeholder={`Starting value${newTrackerUnit.trim() ? ` (${newTrackerUnit.trim()})` : ''} — optional, defaults to your first log`}
            />
            {/* Distinct from the goal value above: this one resets every night,
                and gives the tracker a daily ring on the Tracking page. */}
            <Input
              keyboardType="decimal-pad"
              value={newTrackerDailyTarget}
              onChangeText={setNewTrackerDailyTarget}
              placeholder={`Daily target${newTrackerUnit.trim() ? ` (${newTrackerUnit.trim()})` : ''} — optional, resets each day`}
            />
          </View>
          <GoalDirectionPicker value={newTrackerGoalDirection} onChange={setNewTrackerGoalDirection} />
          <CadencePicker value={newTrackerCadence} onChange={setNewTrackerCadence} />
          <View className="rounded-2xl bg-neutral-50 px-4 py-3 dark:bg-white/[0.04]">
            <Text className="mb-1.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Examples</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {(
                [
                  ['Weight', 'kg', 'decrease_good'],
                  ['Distance', 'km', 'increase_good'],
                  ['Study Hours', 'hr', 'increase_good'],
                  ['Calories', 'kcal', 'increase_good'],
                  ['Water', 'ml', 'increase_good'],
                ] as [string, string, GoalDirection][]
              ).map(([name, unit, gd]) => (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  onPress={() => {
                    setNewTrackerTitle(name);
                    setNewTrackerUnit(unit);
                    setNewTrackerGoalDirection(gd);
                  }}
                  className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                    {name} / {unit}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Button fullWidth onPress={handleAddTracker} disabled={!newTrackerTitle.trim()}>
            Create tracker
          </Button>
        </View>
      </BottomSheet>

      {/* Milestone detail sheet */}
      <BottomSheet open={!!viewingMilestone} onClose={() => setViewingMilestone(null)} maxHeight={sheetMax}>
        {viewingMilestone &&
          (() => {
            // Re-resolve the live milestone each render — link/unlink actions
            // mutate `schedule`, not this frozen snapshot.
            const m = planMilestones.find((pm) => pm.id === viewingMilestone.id) ?? viewingMilestone;
            const status = resolveMilestoneStatus(m);
            const isCompleted = status === 'completed';
            const isDelayed = status === 'delayed';
            const isActive = status === 'active';
            const progress = milestoneProgressById.get(m.id);
            const health = milestoneStateById.get(m.id);
            const readyToComplete = !!progress?.hasLinkedTasks && progress.pct === 100 && !isCompleted;
            const showHealthBadge = health && !['not_started', 'completed', 'getting_started'].includes(health.health);
            // The first linked tracker is the success metric that counts.
            const linkedTrackerId = m.linkedTrackers?.[0];
            const linkedTracker = linkedTrackerId ? trackers.find((t) => t.id === linkedTrackerId) ?? null : null;
            const linkableTrackers = trackers.filter((t) => !(m.linkedTrackers ?? []).includes(t.id));
            // Tasks this milestone could still link — excludes commitments.
            const linkableTasks = uniqueTasks.filter(({ task }) => isTrackedTask(task) && !(m.linkedActivities ?? []).includes(task.id));
            // This milestone's own stretch of the tracker's planned path.
            const linkedSpan = linkedTracker
              ? milestoneSpan(m, linkedTracker, schedule.milestones, schedule.metricEntries, schedule.preferences?.startDate)
              : null;
            const routines = schedule.rituals ?? [];
            const linkedRoutineIds = m.linkedRituals ?? [];
            const linkableRoutines = routines.filter((r) => !linkedRoutineIds.includes(r.id));

            const chip = 'rounded-full border border-neutral-200 px-3 py-1.5 active:bg-neutral-50 dark:border-white/10 dark:active:bg-white/[0.04]';
            const chipText = 'text-[12.5px] font-semibold text-neutral-600 dark:text-neutral-300';

            return (
              <View className="px-5 pb-8 pt-4">
                {/* Status badge(s) */}
                {(isCompleted || isDelayed || isActive || showHealthBadge) && (
                  <View className="mb-3 flex-row flex-wrap items-center gap-2">
                    {(isCompleted || isDelayed || isActive) && (
                      <View
                        className={`flex-row items-center gap-1.5 rounded-full px-2.5 py-1 ${isDelayed ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}
                      >
                        <Icon
                          icon={isDelayed ? IconAlertTriangle : IconCheck}
                          size={12}
                          strokeWidth={2.5}
                          className={isDelayed ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}
                        />
                        <Text className={`text-[12px] font-bold ${isDelayed ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
                          {isCompleted ? 'Completed' : isDelayed ? 'Overdue' : 'In progress'}
                        </Text>
                      </View>
                    )}
                    {showHealthBadge && <MilestoneHealthBadge health={health.health} size="md" />}
                  </View>
                )}

                {/* Title */}
                <Text
                  accessibilityRole="header"
                  className={`mb-5 text-[22px] font-bold leading-snug ${isCompleted ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-neutral-900 dark:text-white'}`}
                >
                  {m.title}
                </Text>

                {/* Meta */}
                <View className="mb-5 gap-3">
                  <View className="flex-row items-center gap-3">
                    <Icon icon={IconCalendar} size={16} strokeWidth={1.8} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                    <Text className="flex-1 text-[16px] font-medium text-neutral-700 dark:text-neutral-300">
                      {formatDate(m.startDate)} – {formatDate(m.plannedEndDate)}
                      <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">
                        {'  '}· {m.plannedDurationDays} day{m.plannedDurationDays === 1 ? '' : 's'}
                      </Text>
                    </Text>
                  </View>
                  {isCompleted && m.actualCompletedDate && (
                    <View className="flex-row items-center gap-3">
                      <Icon icon={IconCheck} size={16} strokeWidth={2} className="shrink-0 text-green-500" />
                      <Text className="text-[16px] font-medium text-neutral-700 dark:text-neutral-300">Completed {formatDate(m.actualCompletedDate)}</Text>
                    </View>
                  )}
                </View>

                {/* Live health breakdown — calculateMilestoneState recomputed live. */}
                {health && health.hasData && (
                  <View className="mb-5 gap-3">
                    {health.metricCurrentValue !== null && health.metricTargetValue !== null && (
                      <View className="flex-row items-baseline justify-between">
                        <Text className="text-[22px] font-bold tracking-[-0.3px] text-neutral-900 dark:text-white">
                          {health.metricCurrentValue}
                          {health.metricUnit ? ` ${health.metricUnit}` : ''}
                        </Text>
                        <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                          Target: {health.metricTargetValue}
                          {health.metricUnit ? ` ${health.metricUnit}` : ''}
                        </Text>
                      </View>
                    )}
                    {health.overallProgress !== null && (
                      <ProgressBar pct={health.overallProgress} height={6} fillClassName={isCompleted ? 'bg-neutral-300 dark:bg-white/20' : 'bg-emerald-500'} />
                    )}
                    {health.metricMovedWrongDirection && (
                      <Text className="text-[12.5px] font-medium text-rose-600 dark:text-rose-400">This has moved away from your target since you started.</Text>
                    )}
                    {health.forecastDate && !['not_started', 'completed', 'getting_started'].includes(health.health) && (
                      <Text className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
                        Projected {formatDateShort(health.forecastDate)} · Target {formatDateShort(m.plannedEndDate)}
                      </Text>
                    )}
                    {/* What the headline blends — each linked source on its own. */}
                    {(health.progressSources.length > 1 || health.consistency !== null) && (
                      <View testID="milestone-sources" className="flex-row flex-wrap items-center gap-x-5 gap-y-2 pt-1">
                        {health.progressSources.length > 1 &&
                          health.progressSources.map((src) => (
                            <View key={src.kind}>
                              <Text className="text-[12px] font-bold text-neutral-500 dark:text-neutral-400">
                                {src.kind === 'metric' ? 'Metric' : src.kind === 'tasks' ? 'Tasks' : 'Routines'}
                              </Text>
                              <Text className="text-[14px] font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">{src.pct}%</Text>
                            </View>
                          ))}
                        {health.consistency !== null && (
                          <View>
                            <Text className="text-[12px] font-bold text-neutral-500 dark:text-neutral-400">Consistency</Text>
                            <Text className="text-[14px] font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">{health.consistency}%</Text>
                          </View>
                        )}
                      </View>
                    )}
                    <Text className="text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">{health.statusMessage}</Text>
                    {/* The rate gap under the forecast date. "You'll finish 12
                        days late" is the diagnosis; "you need 1.4 kg/week and
                        you're averaging 0.6" is the size of the thing to
                        change. Silent when the trend is too scattered for the
                        slope to mean anything (see packages/core/lib/paceModel.ts). */}
                    {(() => {
                      // The state's own pace gap — against this milestone's
                      // figure and counting its routines, like the verdict.
                      const text = paceNarrative(health.paceGap);
                      return text ? (
                        <Text testID="milestone-pace" className="mt-1.5 text-[13px] font-semibold leading-relaxed text-neutral-700 dark:text-neutral-300">
                          {text}
                        </Text>
                      ) : null;
                    })()}
                    {/* The diagnosis has to lead somewhere — offered only when
                        the milestone is actually off pace. */}
                    {onAdaptMilestone && !isCompleted && (health.health === 'at_risk' || health.health === 'delayed') && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-3 self-start"
                        onPress={() => {
                          haptic('light');
                          onAdaptMilestone(m.id);
                          // iOS can't present the adapt sheet over this one (lib/modalTurn).
                          setViewingMilestone(null);
                        }}
                      >
                        <Icon icon={IconWand} size={14} strokeWidth={2} className={BUTTON_TEXT.secondary} />
                        <Text className={`text-[13px] font-semibold ${BUTTON_TEXT.secondary}`}>Adjust this milestone</Text>
                      </Button>
                    )}
                  </View>
                )}

                {/* Description */}
                {m.description ? (
                  <View className="mb-5">
                    <Text className={`mb-1.5 ${EYEBROW}`}>Description</Text>
                    <Text className="text-[16px] leading-relaxed text-neutral-700 dark:text-neutral-300">{m.description}</Text>
                  </View>
                ) : null}

                {/* Notes */}
                {m.notes ? (
                  <View className="mb-5">
                    <Text className={`mb-1.5 ${EYEBROW}`}>Notes</Text>
                    <Text className="text-[16px] leading-relaxed text-neutral-700 dark:text-neutral-300">{m.notes}</Text>
                  </View>
                ) : null}

                {/* Linked tasks — each row can be unlinked (the task itself is
                    untouched); unlinked plan tasks can be added below. */}
                {(progress?.hasLinkedTasks || onLinkTaskToMilestone) && (
                  <View className="mb-5">
                    <Text className={`mb-2 ${EYEBROW}`}>Linked tasks</Text>
                    {progress?.hasLinkedTasks && (
                      <View className="mb-2 gap-2">
                        {progress.taskBreakdown.map((t) => (
                          <View key={t.taskId} className="flex-row items-center justify-between gap-3">
                            <Text className="min-w-0 flex-1 truncate text-[14px] font-medium text-neutral-700 dark:text-neutral-300">
                              {taskTitleById.get(t.taskId) ?? 'Deleted task'}
                            </Text>
                            <View className="shrink-0 flex-row items-center gap-2">
                              <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                                {t.completedCount}/{t.totalCount}
                              </Text>
                              {onUnlinkTaskFromMilestone && (
                                <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onUnlinkTaskFromMilestone(m.id, t.taskId)}>
                                  <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Unlink</Text>
                                </Pressable>
                              )}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                    {onLinkTaskToMilestone &&
                      (linkableTasks.length > 0 ? (
                        <View className="flex-row flex-wrap gap-1.5">
                          {linkableTasks.map(({ task }) => (
                            <Pressable key={task.id} accessibilityRole="button" onPress={() => onLinkTaskToMilestone(m.id, task.id)} className={chip}>
                              <Text className={chipText}>+ {task.title}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : !progress?.hasLinkedTasks ? (
                        <Text className="text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                          No tasks on this plan yet — add one to track activity toward this milestone.
                        </Text>
                      ) : null)}
                  </View>
                )}

                {/* Linked routines — due days count toward consistency and
                    pace; follow-through is one of the blended sources. */}
                {onSetMilestoneLink && (linkedRoutineIds.length > 0 || routines.length > 0) && (
                  <View className="mb-5" testID="milestone-routines">
                    <Text className={`mb-2 ${EYEBROW}`}>Linked routines</Text>
                    {linkedRoutineIds.length > 0 && (
                      <View className="mb-2">
                        {linkedRoutineIds.map((rid) => {
                          const r = routines.find((x) => x.id === rid);
                          return (
                            <View key={rid} className="min-h-11 flex-row items-center justify-between gap-3">
                              <Text className="min-w-0 flex-1 truncate text-[14px] font-medium text-neutral-700 dark:text-neutral-300">
                                {r?.title ?? 'Deleted routine'}
                              </Text>
                              <Pressable accessibilityRole="button" hitSlop={10} onPress={() => onSetMilestoneLink(m.id, 'ritual', rid, false)}>
                                <Text className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Unlink</Text>
                              </Pressable>
                            </View>
                          );
                        })}
                      </View>
                    )}
                    {linkableRoutines.length > 0 && (
                      <View className="flex-row flex-wrap gap-1.5">
                        {linkableRoutines.map((r) => (
                          <Pressable key={r.id} accessibilityRole="button" onPress={() => onSetMilestoneLink(m.id, 'ritual', r.id, true)} className={chip}>
                            <Text className={chipText}>+ {r.title}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                )}

                {/* Success metric — the tracker this milestone's metric
                    progress/forecast is computed from. */}
                {(onLinkTrackerToMilestone || onUnlinkTrackerFromMilestone) && (
                  <View className="mb-5">
                    <Text className={`mb-2 ${EYEBROW}`}>Success metric</Text>
                    {linkedTracker ? (
                      <View className="flex-row items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
                        <View className="min-w-0 flex-1">
                          <Text className="truncate text-[14px] font-semibold text-neutral-800 dark:text-neutral-100">{linkedTracker.title}</Text>
                          <Text className="text-[12px] text-neutral-500 dark:text-neutral-400">
                            {linkedSpan ? linkedSpan.from : linkedTracker.startingValue ?? '–'} → {linkedSpan ? linkedSpan.to : linkedTracker.goalValue ?? '–'}
                            {linkedTracker.unit ? ` ${linkedTracker.unit}` : ''}
                            {linkedTracker.goalDirection === 'decrease_good' ? ' ↓' : ' ↑'}
                            {m.targetValue === undefined && linkedSpan ? ' · implied by the plan' : ''}
                          </Text>
                        </View>
                        {onUnlinkTrackerFromMilestone && (
                          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onUnlinkTrackerFromMilestone(m.id, linkedTracker.id)} className="shrink-0">
                            <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Unlink</Text>
                          </Pressable>
                        )}
                      </View>
                    ) : linkableTrackers.length > 0 && onLinkTrackerToMilestone ? (
                      <View className="flex-row flex-wrap gap-1.5">
                        {linkableTrackers.map((t) => (
                          <Pressable key={t.id} accessibilityRole="button" onPress={() => onLinkTrackerToMilestone(m.id, t.id)} className={chip}>
                            <Text className={chipText}>
                              + {t.title}
                              {t.unit ? ` (${t.unit})` : ''}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : (
                      <Text className="text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                        No trackers yet on this plan — create one under Progress Tracking to measure this milestone's outcome (e.g. weight, savings).
                      </Text>
                    )}
                  </View>
                )}

                {/* Ready-to-complete nudge — informational; never auto-completes. */}
                {readyToComplete && (
                  <Text className="mb-2 text-center text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
                    All linked tasks are complete — ready to mark this milestone done.
                  </Text>
                )}

                {/* Mark Done — any non-completed milestone */}
                {!isCompleted && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onCompleteMilestone(m.id);
                      setViewingMilestone(null);
                    }}
                    className={`mb-3 w-full flex-row items-center justify-center gap-2 rounded-2xl py-3.5 ${
                      readyToComplete ? 'border-2 border-emerald-300 bg-emerald-600 active:bg-emerald-700 dark:border-emerald-500/40' : 'bg-green-600 active:bg-green-700'
                    }`}
                  >
                    <Icon icon={IconCheck} size={16} strokeWidth={2.5} className="text-white" />
                    <Text className="text-[16px] font-semibold text-white">Mark as Done</Text>
                  </Pressable>
                )}

                {/* Edit + Delete */}
                <View className="flex-row gap-3">
                  <IconButton
                    label="Delete milestone"
                    variant="dangerGhost"
                    size="md"
                    radius="xl"
                    onPress={() => {
                      onDeleteMilestone(m.id);
                      setViewingMilestone(null);
                    }}
                    className="h-12 w-12 rounded-2xl border border-neutral-200 dark:border-white/10"
                  >
                    <Icon icon={IconTrash} size={18} strokeWidth={1.8} className={ICON_BUTTON_TONE.dangerGhost} />
                  </IconButton>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setViewingMilestone(null);
                      openEditMilestone(m);
                    }}
                    className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-neutral-900 dark:bg-white"
                  >
                    <Icon icon={IconEdit} size={16} strokeWidth={2} className="text-white dark:text-neutral-900" />
                    <Text className="text-[16px] font-semibold text-white dark:text-neutral-900">Edit milestone</Text>
                  </Pressable>
                </View>
              </View>
            );
          })()}
      </BottomSheet>

      {/* Task detail sheet */}
      <BottomSheet open={!!viewingTask} onClose={() => setViewingTask(null)} maxHeight={sheetMax}>
        {viewingTask &&
          (() => {
            const { task, activeDays: taskDays, sourceDay } = viewingTask;
            const duration = formatDuration(task.startTime, task.endTime);
            const slots = getSlots(task);
            const taskItems = getTaskCheckableItems(task, plan);
            const subtaskCount = taskItems.length;
            const isRoutine = task.taskType === 'session';

            return (
              <View className="px-5 pb-8 pt-4">
                {/* Type badge */}
                {isRoutine && (
                  <View className="mb-3 flex-row">
                    <View className="flex-row items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 dark:bg-amber-900/20">
                      <Icon icon={IconStack2} size={12} strokeWidth={2.5} className="text-amber-600 dark:text-amber-400" />
                      <Text className="text-[12px] font-bold text-amber-600 dark:text-amber-400">Session</Text>
                    </View>
                  </View>
                )}

                {/* Title */}
                <Text accessibilityRole="header" className="mb-5 text-[22px] font-bold leading-snug text-neutral-900 dark:text-white">
                  {task.title}
                </Text>

                {/* Meta info */}
                <View className="mb-6 gap-3">
                  {(task.startTime || task.endTime) && (
                    <View className="flex-row items-center gap-3">
                      <Icon icon={IconClock} size={16} strokeWidth={1.8} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                      <Text className="text-[16px] font-medium text-neutral-700 dark:text-neutral-300">
                        {formatDisplayTime(task.startTime)}
                        {task.endTime ? ` – ${formatDisplayTime(task.endTime)}` : ''}
                        {duration ? <Text className="text-[13px] text-neutral-500 dark:text-neutral-400"> · {duration}</Text> : null}
                      </Text>
                    </View>
                  )}
                  <View className="flex-row items-start gap-3">
                    <Icon icon={IconCalendar} size={16} strokeWidth={1.8} className="mt-[3px] shrink-0 text-neutral-500 dark:text-neutral-400" />
                    <View className="flex-row flex-wrap gap-[5px]">
                      {WEEKDAY_ORDER.map((day) => (
                        <DayPill key={day} label={WEEKDAY_SHORT[day]} active={taskDays.includes(day)} />
                      ))}
                    </View>
                  </View>
                </View>

                {slots.length > 1 && (
                  <View className="mb-6">
                    <Text className={`mb-2.5 ${EYEBROW}`}>Time blocks</Text>
                    <View className="gap-1.5">
                      {slots.map((slot, slotIndex) => (
                        <View
                          key={`${slot.startTime}-${slot.endTime}-${slotIndex}`}
                          className="flex-row items-center justify-between gap-3 rounded-xl bg-neutral-50 px-3.5 py-2 dark:bg-white/[0.04]"
                        >
                          <Text className="text-[14px] font-medium text-neutral-700 dark:text-neutral-300">
                            {formatDisplayTime(slot.startTime)}
                            {slot.endTime ? ` - ${formatDisplayTime(slot.endTime)}` : ''}
                          </Text>
                          <IconButton
                            label={`Delete ${formatDisplayTime(slot.startTime)} time block`}
                            variant="dangerGhost"
                            size="xs"
                            radius="xl"
                            onPress={() => {
                              onDeleteTaskSlot(task, sourceDay, slotIndex);
                              setViewingTask(null);
                            }}
                          >
                            <Icon icon={IconTrash} size={15} strokeWidth={1.8} className={ICON_BUTTON_TONE.dangerGhost} />
                          </IconButton>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Subtasks */}
                {subtaskCount > 0 && (
                  <View className="mb-6">
                    <Text className={`mb-2.5 ${EYEBROW}`}>Subtasks · {subtaskCount}</Text>
                    <View className="gap-1.5">
                      {taskItems.map((st) => (
                        <View key={st.id} className="flex-row items-center gap-2.5 rounded-xl bg-neutral-50 px-3.5 py-2.5 dark:bg-white/[0.04]">
                          <View className="h-4 w-4 shrink-0 rounded-[4px] border-[1.5px] border-neutral-300 dark:border-white/20" />
                          <Text className="flex-1 text-[14px] font-medium text-neutral-700 dark:text-neutral-300">{st.task}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Which milestones this task moves forward. */}
                {onSetMilestoneLink && isTrackedTask(task) ? (
                  <MilestoneLinks
                    className="mb-5"
                    milestones={schedule.milestones}
                    kind="task"
                    itemId={task.id}
                    planId={plan.id}
                    onSetLink={onSetMilestoneLink}
                  />
                ) : null}

                {/* Actions */}
                <View className="flex-row gap-3">
                  <IconButton
                    label="Delete task"
                    variant="dangerGhost"
                    size="md"
                    radius="xl"
                    onPress={() => {
                      onDeleteLinkedTask(task, taskDays);
                      setViewingTask(null);
                    }}
                    className="h-12 w-12 rounded-2xl border border-neutral-200 dark:border-white/10"
                  >
                    <Icon icon={IconTrash} size={18} strokeWidth={1.8} className={ICON_BUTTON_TONE.dangerGhost} />
                  </IconButton>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      onEditTask(task);
                      setViewingTask(null);
                    }}
                    className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-neutral-900 dark:bg-white"
                  >
                    <Icon icon={IconEdit} size={16} strokeWidth={2} className="text-white dark:text-neutral-900" />
                    <Text className="text-[16px] font-semibold text-white dark:text-neutral-900">Edit task</Text>
                  </Pressable>
                </View>
              </View>
            );
          })()}
      </BottomSheet>
    </View>
  );
}
