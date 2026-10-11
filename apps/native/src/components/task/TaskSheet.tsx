import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconArrowLeft, IconCheck, IconClock, IconCopy, IconCopyPlus, IconTrash } from '@tabler/icons-react-native';
import type { DayKey, Plan, Schedule, Task, TaskCategory, TaskRecurrence, TaskSlot, TaskTypeValue } from '@planr/core/lib/scheduleTypes';
import type { ScheduleEntry } from '@planr/core/lib/scheduleEntry';
import { DAYS, DAY_LABELS, DAY_FULL_LABELS } from '@planr/core/lib/scheduleConstants';
import { findAvailableSlots, suggestSlots } from '@planr/core/lib/availableSlots';
import { computeUsualTimeSlot } from '@planr/core/lib/usualTimeSlot';
import { mergeCandidates, findMergePartner } from '@planr/core/lib/taskMerge';
import { localISODate, formatDate } from '@planr/core/lib/dateUtils';
import { uid } from '@planr/core/lib/id';
import { getSlots } from '@planr/core/lib/taskMutations';
import { displayToInputTime, inputToDisplayTime, parseTimeToMinutes, formatMinutes } from '@planr/core/lib/timeUtils';
import { resolveOccurrence } from '@planr/core/lib/taskOccurrence';
import { constrainTaskToPlanWindow } from '@planr/core/lib/planTaskWindow';
import { validateTaskSlots } from '@planr/core/lib/scheduleRules';
import { haptic } from '../../lib/haptics';
import { ModalNestingContext, useModalTurn } from '../../lib/modalTurn';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button, { BUTTON_TEXT } from '../ui/Button';
import IconButton from '../ui/IconButton';
import Input, { FORM_LABEL, Textarea } from '../ui/Input';
import AddRowButton from '../ui/AddRowButton';
import SegmentedControl from '../ui/SegmentedControl';
import WeekdayPicker from '../ui/WeekdayPicker';
import DateInput from '../ui/DateInput';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text, type TextInputRef } from '../ui/Text';
import TimeSlotPicker, { type EditableSlot } from '../TimeSlotPicker';
import { CategorySelector } from './CategorySelector';
import CategorySheet, { type CategoryDraft } from '../category/CategorySheet';
import { PlanSelector } from './PlanSelector';
import SubtaskDraftRow, { type SubtaskDraft } from './SubtaskDraftRow';

export interface TaskSaveData {
  taskDraft: Omit<Task, 'id'>;
  taskId?: string;
  repeatDays: DayKey[];
  planItems: { planId: string; items: ScheduleEntry[] } | null;
  scope?: 'all' | 'occurrence';
  recurrence?: TaskRecurrence;
  perDaySlots?: Partial<Record<DayKey, TaskSlot[]>>;
}

const JS_DAYS: DayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function weekdayOfISO(iso: string): DayKey {
  return JS_DAYS[new Date(iso + 'T00:00:00').getDay()];
}

function formatPlanRange(plan: Pick<Plan, 'startDate' | 'endDate'> | null): string {
  if (!plan || (!plan.startDate && !plan.endDate)) return '';
  if (plan.startDate && plan.endDate) return `${formatDate(plan.startDate)} – ${formatDate(plan.endDate)}`;
  if (plan.startDate) return `Starts ${formatDate(plan.startDate)}`;
  return `Ends ${formatDate(plan.endDate ?? '')}`;
}

export interface TaskSheetProps {
  mode: 'create' | 'edit';
  task?: Task | null;
  plans: Plan[];
  categories: TaskCategory[];
  onCreateCategory: (draft: CategoryDraft) => string;
  onUpdateCategory?: (id: string, draft: CategoryDraft) => void;
  onDeleteCategory?: (id: string) => void;
  categoryUsage?: ReadonlyMap<string, number>;
  activeDay: DayKey;
  activeDays?: DayKey[];
  activities?: Partial<Record<DayKey, Task[]>>;
  preferences?: Schedule['preferences'];
  isOpen: boolean;
  initialPlanId?: string | null;
  initialTaskType?: TaskTypeValue;
  initialStartTime?: string;
  initialEndTime?: string;
  occurrenceDateISO?: string;
  canEditOccurrence?: boolean;
  onClose: () => void;
  onSave: (data: TaskSaveData) => void;
  onDuplicate?: (data: TaskSaveData) => void;
  onCopySubtaskToTasks?: (entry: ScheduleEntry, targetTaskIds: string[]) => void;
  onDelete?: () => void;
  onResetOccurrence?: () => void;
  onMergeTask?: (taskId: string, partnerId: string) => void;
  onUnmergeTask?: (taskId: string) => void;
  presentation?: 'sheet' | 'page';
  /** Rendered over the page editor (inside its modal) — the shell's toast,
   *  which would otherwise sit unseen in the window underneath. */
  overlay?: ReactNode;
}

function entryToSubtaskDraft(e: ScheduleEntry): SubtaskDraft {
  return {
    id: e.id,
    title: e.task,
    info: e.info ?? '',
    duration: e.duration ?? '',
    timeMinutes: e.timeMinutes,
    deadline: e.deadline,
    deadlineScope: e.deadlineScope,
  };
}

function subtaskDraftToEntry(d: SubtaskDraft): ScheduleEntry {
  return {
    id: d.id,
    task: d.title.trim(),
    info: (d.info ?? '').trim() || undefined,
    duration: (d.duration ?? '').trim() || undefined,
    timeMinutes: d.timeMinutes != null && d.timeMinutes > 0 ? d.timeMinutes : undefined,
    deadline: d.deadline || undefined,
    deadlineScope: d.deadline ? d.deadlineScope ?? 'day' : undefined,
  };
}

const SCOPE_OPTIONS = [
  { value: 'all', label: 'All days' },
  { value: 'occurrence', label: 'This day only' },
] as const satisfies readonly { value: 'all' | 'occurrence'; label: string }[];

const TYPE_OPTIONS = [
  { value: 'task', label: 'Task' },
  { value: 'session', label: 'Session' },
  { value: 'commitment', label: 'Commitment' },
] as const satisfies readonly { value: TaskTypeValue; label: string }[];

const PER_DAY_OPTIONS = [
  { value: 'same', label: 'Same every day' },
  { value: 'custom', label: 'Custom per day' },
] as const;

const REPEAT_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'interval', label: 'Multi-week' },
  { value: 'once', label: 'One-off' },
] as const;

function isValidInputTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toInputSlots(source: { startTime: string; endTime: string; slots?: TaskSlot[] }): EditableSlot[] {
  return getSlots(source).map((s) => ({ startTime: displayToInputTime(s.startTime), endTime: displayToInputTime(s.endTime) }));
}

function toDisplaySlots(slots: EditableSlot[]): TaskSlot[] {
  return slots.map((s) => ({ startTime: inputToDisplayTime(s.startTime), endTime: inputToDisplayTime(s.endTime) }));
}

function slotsAllValid(slots: EditableSlot[]): boolean {
  return slots.length > 0 && slots.every((s) => isValidInputTime(s.startTime) && isValidInputTime(s.endTime));
}

/**
 * Native port of components/task/TaskSheet.tsx — create/edit a task: type,
 * plan, title, category, "Occurs with" merging, note, same-vs-custom per-day
 * times, time slots with presets, repeat (weekly / multi-week / one-off),
 * active window, subtasks or session steps with the time-budget check,
 * "This day only" scoped edits, duplicate, and delete. Validation and the
 * saved shape match the web exactly (the shell's handlers are shared logic).
 */
export function TaskSheet({
  mode,
  task,
  plans,
  categories,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  categoryUsage,
  activeDay,
  activeDays,
  activities,
  preferences,
  isOpen,
  initialPlanId,
  initialTaskType,
  initialStartTime,
  initialEndTime,
  occurrenceDateISO,
  canEditOccurrence = false,
  onClose,
  onSave,
  onDuplicate,
  onCopySubtaskToTasks,
  onDelete,
  onResetOccurrence,
  onMergeTask,
  onUnmergeTask,
  presentation = 'sheet',
  overlay,
}: TaskSheetProps) {
  const insets = useSafeAreaInsets();
  // The page editor is a root-level modal: it waits its turn on iOS (lib/modalTurn).
  const pageTurn = useModalTurn(presentation === 'page' && isOpen, 450);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [planId, setPlanId] = useState('');
  const [taskType, setTaskType] = useState<TaskTypeValue>('task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [slots, setSlots] = useState<EditableSlot[]>([{ startTime: '', endTime: '' }]);
  const [sameEveryDay, setSameEveryDay] = useState(true);
  const [perDaySlots, setPerDaySlots] = useState<Partial<Record<DayKey, EditableSlot[]>>>({});
  const [editDay, setEditDay] = useState<DayKey>(activeDay);
  const [repeatDays, setRepeatDays] = useState<DayKey[]>([activeDay]);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [stepBuffer, setStepBuffer] = useState<number | undefined>(undefined);
  const [focusNewSubtask, setFocusNewSubtask] = useState(false);
  const [duplicateStep, setDuplicateStep] = useState<'idle' | 'picking'>('idle');
  const [duplicateDays, setDuplicateDays] = useState<DayKey[]>([]);
  const [editScope, setEditScope] = useState<'all' | 'occurrence'>('all');
  const [categoryId, setCategoryId] = useState<string>('');
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TaskCategory | null>(null);
  const [repeatMode, setRepeatMode] = useState<'weekly' | 'interval' | 'once'>('weekly');
  const [intervalWeeks, setIntervalWeeks] = useState(2);
  const [onceDate, setOnceDate] = useState('');
  const [activeFrom, setActiveFrom] = useState('');
  const [activeUntil, setActiveUntil] = useState('');

  const titleRef = useRef<TextInputRef | null>(null);

  const baseDateISO = occurrenceDateISO || localISODate(new Date());

  const canScopeToOccurrence = mode === 'edit' && !!occurrenceDateISO && canEditOccurrence;
  const isOccurrenceScope = canScopeToOccurrence && editScope === 'occurrence';
  const occurrenceDateLabel = occurrenceDateISO
    ? new Date(occurrenceDateISO + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  const hasOccurrenceOverride = !!(
    task &&
    occurrenceDateISO &&
    (() => {
      const ex = task.exceptions?.[occurrenceDateISO];
      return ex && (ex.title !== undefined || ex.startTime !== undefined || ex.endTime !== undefined || ex.description !== undefined);
    })()
  );

  // ── Initialise on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'edit' && task) {
      const linkedPlan = plans.find((p) => p.id === task.planId);
      const selectedDays = activeDays && activeDays.length > 0 ? activeDays : [activeDay];
      setPlanId(task.planId);
      setTaskType(task.taskType ?? 'task');
      setTitle(task.title);
      setDescription(task.description ?? '');
      const perDay: Partial<Record<DayKey, EditableSlot[]>> = {};
      for (const d of selectedDays) {
        const dayTask = activities?.[d]?.find((t) => t.id === task.id);
        perDay[d] = toInputSlots(dayTask ?? task);
      }
      const baseSlots = toInputSlots(task);
      const uniform = selectedDays.every((d) => JSON.stringify(perDay[d]) === JSON.stringify(baseSlots));
      setSlots(baseSlots);
      setPerDaySlots(perDay);
      setSameEveryDay(uniform);
      setEditDay(selectedDays.includes(activeDay) ? activeDay : selectedDays[0]);
      setRepeatDays(selectedDays);
      setCategoryId(task.categoryId ?? '');
      const taskSubtasks = task.subtasks ?? linkedPlan?.items ?? [];
      setSubtasks(taskSubtasks.map(entryToSubtaskDraft));
      setStepBuffer(task.stepBufferMinutes);
      const r = task.recurrence;
      if (r?.type === 'once') {
        setRepeatMode('once');
        setOnceDate(r.dateISO);
      } else if (r?.type === 'weekly' && r.interval > 1) {
        setRepeatMode('interval');
        setIntervalWeeks(r.interval);
        setOnceDate(baseDateISO);
      } else {
        setRepeatMode('weekly');
        setOnceDate(baseDateISO);
      }
      setActiveFrom(task.activeFrom ?? '');
      setActiveUntil(task.activeUntil ?? '');
    } else {
      const pid = initialPlanId ?? plans[0]?.id ?? '';
      setPlanId(pid);
      setTaskType(initialTaskType ?? 'task');
      setTitle('');
      setDescription('');
      setSlots([{ startTime: initialStartTime ?? '', endTime: initialEndTime ?? '' }]);
      setPerDaySlots({});
      setSameEveryDay(true);
      setEditDay(activeDay);
      setRepeatDays([activeDay]);
      setSubtasks([]);
      setStepBuffer(undefined);
      const seedIcon = plans.find((p) => p.id === pid)?.emoji || '';
      setCategoryId(categories.find((c) => c.icon === seedIcon)?.id ?? '');
      setRepeatMode('weekly');
      setIntervalWeeks(2);
      setOnceDate(baseDateISO);
      setActiveFrom('');
      setActiveUntil('');
    }
    setFocusNewSubtask(false);
    setDuplicateStep('idle');
    setEditScope('all');
    if (mode === 'create') setTimeout(() => titleRef.current?.focus(), 350);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyScope(scope: 'all' | 'occurrence') {
    setEditScope(scope);
    if (mode !== 'edit' || !task) return;
    const src = scope === 'occurrence' && occurrenceDateISO ? resolveOccurrence(task, occurrenceDateISO) : task;
    setTitle(src.title);
    setDescription(src.description ?? '');
    if (scope === 'occurrence') {
      setSlots([{ startTime: displayToInputTime(src.startTime), endTime: displayToInputTime(src.endTime) }]);
    } else {
      setSlots(toInputSlots(task));
    }
  }

  function handleSelectPlan(plan: Plan) {
    setPlanId(plan.id);
    if (mode === 'create') setSubtasks([]);
  }

  // ── Subtask management ─────────────────────────────────────────────────────
  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: uid(), title: '', info: '', duration: '' }]);
    setFocusNewSubtask(true);
  }

  const updateSubtask = useCallback((id: string, updated: SubtaskDraft) => {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, []);

  const removeSubtask = useCallback((id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const duplicateSubtask = useCallback((id: string) => {
    setSubtasks((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i === -1) return prev;
      const copy: SubtaskDraft = { ...prev[i], id: uid() };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }, []);

  /** The web's drag-to-reorder, as move up/down. */
  const moveSubtask = useCallback((id: string, direction: 'up' | 'down') => {
    setSubtasks((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = direction === 'up' ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const [copySubtaskId, setCopySubtaskId] = useState<string | null>(null);
  const [copyTargetIds, setCopyTargetIds] = useState<string[]>([]);

  const copyCandidates = useMemo(() => {
    const map = new Map<string, { id: string; title: string; planId: string }>();
    for (const day of DAYS) {
      for (const t of activities?.[day] ?? []) {
        if (t.id === task?.id) continue;
        if (!map.has(t.id)) map.set(t.id, { id: t.id, title: t.title, planId: t.planId });
      }
    }
    return [...map.values()];
  }, [activities, task?.id]);

  function openCopyToTask(id: string) {
    setCopySubtaskId(id);
    setCopyTargetIds([]);
  }

  function confirmCopyToTask() {
    if (!copySubtaskId || !onCopySubtaskToTasks || copyTargetIds.length === 0) return;
    const draft = subtasks.find((s) => s.id === copySubtaskId);
    if (draft && draft.title.trim()) onCopySubtaskToTasks(subtaskDraftToEntry(draft), copyTargetIds);
    setCopySubtaskId(null);
    setCopyTargetIds([]);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;

  const canCustomizePerDay = !isOccurrenceScope && repeatMode !== 'once' && repeatDays.length > 1;
  const perDayActive = canCustomizePerDay && !sameEveryDay;
  const showRepeatDays = !isOccurrenceScope && repeatMode !== 'once' && !perDayActive;
  const resolvedEditDay = repeatDays.includes(editDay) ? editDay : repeatDays[0] ?? activeDay;

  const editorSlots = perDayActive ? perDaySlots[resolvedEditDay] ?? slots : slots;
  function setEditorSlots(next: EditableSlot[]) {
    if (perDayActive) setPerDaySlots((prev) => ({ ...prev, [resolvedEditDay]: next }));
    else setSlots(next);
  }

  const suggestedSlots = useMemo(() => {
    if (!preferences) return undefined;
    const dayTasks = activities?.[resolvedEditDay] ?? activities?.[activeDay] ?? [];
    const gaps = findAvailableSlots(dayTasks, baseDateISO, preferences);
    const firstSlot = editorSlots[0];
    const start = firstSlot ? parseTimeToMinutes(firstSlot.startTime) : null;
    const end = firstSlot ? parseTimeToMinutes(firstSlot.endTime) : null;
    const activeDuration = start !== null && end !== null && end > start ? end - start : 30;
    return suggestSlots(gaps, activeDuration);
  }, [activities, resolvedEditDay, activeDay, baseDateISO, preferences, editorSlots]);

  const usualTimeSlot = useMemo(() => {
    if (!activities || !planId) return null;
    const candidate = computeUsualTimeSlot(activities, { categoryId: categoryId || undefined, planId }, task?.id);
    if (!candidate) return null;
    const dayTasks = activities[resolvedEditDay] ?? activities[activeDay] ?? [];
    const gaps = findAvailableSlots(dayTasks, baseDateISO, preferences);
    const fits = gaps.some((g) => candidate.startMinutes >= g.startMinutes && candidate.endMinutes <= g.endMinutes);
    return fits ? candidate : null;
  }, [activities, categoryId, planId, task?.id, resolvedEditDay, activeDay, baseDateISO, preferences]);

  const mergePartner = useMemo(() => (task ? findMergePartner(task, activities ?? {}) : null), [task, activities]);
  const mergeCandidateTasks = useMemo(() => {
    if (!task || task.mergeGroupId || !activities) return [];
    const dayTasks = activities[resolvedEditDay] ?? activities[activeDay] ?? [];
    return mergeCandidates(task, dayTasks);
  }, [activities, task, resolvedEditDay, activeDay]);

  const daysToValidate: EditableSlot[][] = isOccurrenceScope || !perDayActive ? [slots] : repeatDays.map((d) => perDaySlots[d] ?? slots);
  const allSlotsValidNow = daysToValidate.every(slotsAllValid);
  const timeError = allSlotsValidNow
    ? daysToValidate.map((ds) => validateTaskSlots(ds, { title: title.trim() || 'Task', day: activeDay })).find(Boolean) ?? null
    : null;

  const subtaskTotalMinutes = useMemo(() => {
    let total = 0;
    let any = false;
    for (const s of subtasks) {
      if (!s.title.trim()) continue;
      if (s.timeMinutes != null && s.timeMinutes > 0) {
        total += s.timeMinutes;
        any = true;
      }
    }
    return any ? total : null;
  }, [subtasks]);

  const stepCount = useMemo(() => subtasks.filter((s) => s.title.trim().length > 0).length, [subtasks]);
  const stepBufferTotalMinutes = taskType === 'session' && stepBuffer && stepCount > 1 ? stepBuffer * (stepCount - 1) : 0;
  const combinedStepMinutes = subtaskTotalMinutes != null || stepBufferTotalMinutes > 0 ? (subtaskTotalMinutes ?? 0) + stepBufferTotalMinutes : null;

  const allottedMinutes = useMemo(() => {
    let total = 0;
    for (const s of slots) {
      const start = parseTimeToMinutes(s.startTime);
      let end = parseTimeToMinutes(s.endTime);
      if (start == null || end == null) continue;
      if (end < start) end += 1440;
      if (end > start) total += end - start;
    }
    return total > 0 ? total : null;
  }, [slots]);

  const subtaskDurationError =
    taskType !== 'commitment' && combinedStepMinutes != null && allottedMinutes != null && combinedStepMinutes > allottedMinutes
      ? `${taskType === 'session' ? 'Steps' : 'Subtasks'} add up to ${formatMinutes(combinedStepMinutes)}${
          stepBufferTotalMinutes > 0 ? ` (incl. ${formatMinutes(stepBufferTotalMinutes)} buffer)` : ''
        }, but this task only has ${formatMinutes(allottedMinutes)}. Trim durations or extend the time.`
      : null;

  const showActiveWindow = !isOccurrenceScope && repeatMode !== 'once';
  const dateWindowError = showActiveWindow && activeFrom && activeUntil && activeFrom > activeUntil ? 'Start date must be on or before the end date.' : null;

  const repeatOk = isOccurrenceScope ? true : repeatMode === 'once' ? !!onceDate : repeatDays.length > 0;
  const isCommitment = taskType === 'commitment';
  const canSave =
    (isCommitment || (!!selectedPlan && !!categoryId)) &&
    title.trim().length > 0 &&
    allSlotsValidNow &&
    !timeError &&
    !subtaskDurationError &&
    !dateWindowError &&
    repeatOk;

  function handleSave() {
    if (!canSave || (!isCommitment && !selectedPlan)) return;
    const validSubtasks = subtasks.filter((s) => s.title.trim().length > 0).map(subtaskDraftToEntry);

    let recurrence: TaskRecurrence | undefined;
    let effectiveRepeatDays = repeatDays;
    if (repeatMode === 'once') {
      recurrence = { type: 'once', dateISO: onceDate };
      effectiveRepeatDays = [weekdayOfISO(onceDate)];
    } else if (repeatMode === 'interval') {
      recurrence = { type: 'weekly', interval: intervalWeeks, anchorISO: baseDateISO };
    }

    const baseDisplaySlots = toDisplaySlots(slots);
    const primary = baseDisplaySlots[0] ?? {
      startTime: inputToDisplayTime(slots[0]?.startTime ?? ''),
      endTime: inputToDisplayTime(slots[0]?.endTime ?? ''),
    };

    let perDaySlotsOut: Partial<Record<DayKey, TaskSlot[]>> | undefined;
    if (perDayActive) {
      perDaySlotsOut = {};
      for (const d of effectiveRepeatDays) perDaySlotsOut[d] = toDisplaySlots(perDaySlots[d] ?? slots);
    }

    const taskWindow = selectedPlan
      ? constrainTaskToPlanWindow(
          {
            activeFrom: showActiveWindow && activeFrom ? activeFrom : undefined,
            activeUntil: showActiveWindow && activeUntil ? activeUntil : undefined,
          },
          selectedPlan,
        )
      : { activeFrom: undefined, activeUntil: undefined };
    const taskDraft: Omit<Task, 'id'> = {
      title: title.trim(),
      description: description.trim() || undefined,
      startTime: primary.startTime,
      endTime: primary.endTime,
      slots: baseDisplaySlots.length > 1 ? baseDisplaySlots : undefined,
      categoryId: categoryId || undefined,
      planId: isCommitment ? '' : selectedPlan!.id,
      taskType,
      subtasks: mode === 'edit' ? validSubtasks : validSubtasks.length > 0 ? validSubtasks : undefined,
      recurrence,
      activeFrom: taskWindow.activeFrom,
      activeUntil: taskWindow.activeUntil,
      stepBufferMinutes: taskType === 'session' && stepBuffer ? stepBuffer : undefined,
    };

    onSave({
      taskDraft,
      taskId: mode === 'edit' ? task?.id : undefined,
      repeatDays: effectiveRepeatDays,
      planItems: mode === 'create' && taskType === 'task' && selectedPlan && validSubtasks.length > 0 ? { planId: selectedPlan.id, items: validSubtasks } : null,
      scope: isOccurrenceScope ? 'occurrence' : 'all',
      recurrence,
      perDaySlots: perDaySlotsOut,
    });
  }

  function openDuplicatePicker() {
    setDuplicateDays(repeatDays);
    setDuplicateStep('picking');
  }

  function confirmDuplicate() {
    if (!canSave || !selectedPlan || !onDuplicate) return;
    const validSubtasks = subtasks.filter((s) => s.title.trim().length > 0).map(subtaskDraftToEntry);
    const dupSlots = toDisplaySlots(slots);
    onDuplicate({
      taskDraft: {
        title: `Copy of ${title.trim()}`,
        description: description.trim() || undefined,
        startTime: dupSlots[0]?.startTime ?? '',
        endTime: dupSlots[0]?.endTime ?? '',
        slots: dupSlots.length > 1 ? dupSlots : undefined,
        categoryId: categoryId || undefined,
        planId: selectedPlan.id,
        taskType,
        subtasks: validSubtasks.length > 0 ? validSubtasks : undefined,
      },
      taskId: undefined,
      repeatDays: duplicateDays.length > 0 ? duplicateDays : repeatDays,
      planItems: null,
    });
    setDuplicateStep('idle');
  }

  const eyebrow = mode === 'create' ? 'Add' : 'Edit';
  const headingTitle = mode === 'create' ? 'New task' : task?.title ?? 'Task';
  const saveLabel = mode === 'create' ? 'Add task' : isOccurrenceScope ? 'Save this day' : 'Save changes';

  // ── Duplicate day-picker ───────────────────────────────────────────────────
  const duplicatePicker = (
    <View className="px-5 pb-6 pt-4">
      <View className="mb-5 flex-row items-center gap-3">
        <IconButton label="Back" variant="soft" size="md" radius="full" onPress={() => setDuplicateStep('idle')}>
          <Icon icon={IconArrowLeft} size={18} strokeWidth={2} className="text-neutral-600 dark:text-neutral-300" />
        </IconButton>
        <Text className="text-[18px] font-bold text-neutral-900 dark:text-white">Duplicate task</Text>
      </View>
      <View className="mb-5 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <Text className={`mb-0.5 ${typography.eyebrow}`}>New title</Text>
        <Text className="text-[16px] font-semibold text-neutral-900 dark:text-white">Copy of {title}</Text>
      </View>
      <View className="mb-6">
        <Text className={`mb-2.5 ${typography.eyebrow}`}>Copy to days</Text>
        <WeekdayPicker selected={duplicateDays} onChange={setDuplicateDays} allowEmpty />
      </View>
      <Button fullWidth onPress={confirmDuplicate} disabled={duplicateDays.length === 0}>
        <Icon icon={IconCopy} size={15} className={BUTTON_TEXT.primary} />
        Create copy
      </Button>
    </View>
  );

  // ── Main form ──────────────────────────────────────────────────────────────
  const formBody = (
    <View className="mt-4 gap-5">
      {canScopeToOccurrence && (
        <View>
          <Text className={FORM_LABEL}>Apply changes to</Text>
          <SegmentedControl ariaLabel="Apply changes to" options={SCOPE_OPTIONS} value={editScope} onChange={applyScope} />
          {isOccurrenceScope && (
            <Text className="mt-2 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
              Changes apply only to {occurrenceDateLabel} — title, time & note.
              {hasOccurrenceOverride && onResetOccurrence ? (
                <Text
                  accessibilityRole="button"
                  onPress={() => {
                    haptic('light');
                    onResetOccurrence();
                  }}
                  className="font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  {' '}
                  Reset this day
                </Text>
              ) : null}
            </Text>
          )}
        </View>
      )}

      {!isOccurrenceScope && (
        <View>
          <Text className={FORM_LABEL}>Type</Text>
          <SegmentedControl ariaLabel="Task type" options={TYPE_OPTIONS} value={taskType} onChange={setTaskType} />
          {taskType === 'commitment' && (
            <Text className="mt-2 text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">
              Blocks your calendar but is never tracked — no checkbox, and it stays out of your streak, consistency and completion stats.
            </Text>
          )}
        </View>
      )}

      {!isOccurrenceScope && !isCommitment && <PlanSelector plans={plans} selectedId={planId} onSelect={handleSelectPlan} />}

      <Input
        ref={titleRef}
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="What are you working on?"
        onSubmitEditing={handleSave}
        autoComplete="off"
        returnKeyType="done"
        accessibilityLabel="Task title"
      />

      {!isOccurrenceScope && (
        <CategorySelector
          categories={categories}
          selectedId={categoryId}
          onSelect={(category) => setCategoryId(category.id)}
          onClear={() => setCategoryId('')}
          onCreate={() => {
            setEditingCategory(null);
            setCategorySheetOpen(true);
          }}
          onEdit={
            onUpdateCategory
              ? (category) => {
                  setEditingCategory(category);
                  setCategorySheetOpen(true);
                }
              : undefined
          }
          onDelete={
            onDeleteCategory
              ? (category) => {
                  onDeleteCategory(category.id);
                  if (categoryId === category.id) setCategoryId('');
                }
              : undefined
          }
          usage={categoryUsage}
          optional={isCommitment}
        />
      )}

      {!isOccurrenceScope && task && (onMergeTask || onUnmergeTask) && (
        <View>
          <Text className={FORM_LABEL}>Occurs with</Text>
          {mergePartner ? (
            <View className="flex-row items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 dark:border-white/10">
              <Text className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-800 dark:text-neutral-200">{mergePartner.title}</Text>
              {onUnmergeTask && (
                <Pressable accessibilityRole="button" onPress={() => onUnmergeTask(task.id)} className="shrink-0">
                  <Text className="text-[12.5px] font-bold text-rose-600 dark:text-rose-400">Unmerge</Text>
                </Pressable>
              )}
            </View>
          ) : onMergeTask && mergeCandidateTasks.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5">
              {mergeCandidateTasks.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  onPress={() => onMergeTask(task.id, c.id)}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 active:bg-neutral-50 dark:border-white/10 dark:active:bg-white/[0.04]"
                >
                  <Text className="text-[12.5px] font-semibold text-neutral-600 dark:text-neutral-300">+ {c.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="text-[13px] text-neutral-400 dark:text-neutral-500">No overlapping tasks scheduled</Text>
          )}
        </View>
      )}

      <Textarea label="Note (optional)" value={description} onChangeText={setDescription} placeholder="Short note or context…" autoComplete="off" accessibilityLabel="Task note" />

      {canCustomizePerDay && (
        <View>
          <Text className={FORM_LABEL}>Schedule</Text>
          <SegmentedControl
            ariaLabel="Schedule"
            options={PER_DAY_OPTIONS}
            value={sameEveryDay ? 'same' : 'custom'}
            onChange={(value) => setSameEveryDay(value === 'same')}
          />
          {perDayActive && (
            <View accessibilityRole="radiogroup" accessibilityLabel="Day to edit" className="mt-2.5 flex-row flex-wrap gap-2">
              {DAYS.filter((d) => repeatDays.includes(d)).map((day) => {
                const on = resolvedEditDay === day;
                return (
                  <Pressable
                    key={day}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={DAY_FULL_LABELS[day]}
                    onPress={() => setEditDay(day)}
                    className={`h-8 w-10 items-center justify-center rounded-full border ${
                      on ? 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white' : 'border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]'
                    }`}
                  >
                    <Text className={`text-[12px] font-semibold ${on ? 'text-white dark:text-neutral-900' : 'text-neutral-500 dark:text-neutral-400'}`}>{DAY_LABELS[day]}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}

      <View>
        <TimeSlotPicker slots={editorSlots} onSlotsChange={setEditorSlots} suggestedSlots={suggestedSlots} usualTimeSlot={usualTimeSlot} />
        {timeError && <Text className="mt-2 text-[12px] font-semibold text-rose-500 dark:text-rose-400">{timeError.message}</Text>}
      </View>

      {!isOccurrenceScope && (
        <View className="gap-2">
          <Text className={FORM_LABEL}>Repeat</Text>
          <SegmentedControl ariaLabel="Repeat" options={REPEAT_OPTIONS} value={repeatMode} onChange={setRepeatMode} />
          {showRepeatDays && (
            <View className="flex-row items-start gap-3 pt-1">
              <Text className="w-[52px] shrink-0 pt-[7px] text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">On</Text>
              <WeekdayPicker className="min-w-0 flex-1" selected={repeatDays} onChange={setRepeatDays} allDaysOption fallbackDay={activeDay} />
            </View>
          )}
          {repeatMode === 'interval' && (
            <View className="flex-row items-center gap-2 pt-1">
              <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">Every</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Fewer weeks"
                onPress={() => setIntervalWeeks((n) => Math.max(2, n - 1))}
                className="h-8 w-8 items-center justify-center rounded-full border border-neutral-200 dark:border-white/10"
              >
                <Text className="text-[16px] font-bold text-neutral-600 dark:text-neutral-300">−</Text>
              </Pressable>
              <Text className="w-6 text-center text-[16px] font-bold tabular-nums text-neutral-900 dark:text-white">{intervalWeeks}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More weeks"
                onPress={() => setIntervalWeeks((n) => Math.min(8, n + 1))}
                className="h-8 w-8 items-center justify-center rounded-full border border-neutral-200 dark:border-white/10"
              >
                <Text className="text-[16px] font-bold text-neutral-600 dark:text-neutral-300">+</Text>
              </Pressable>
              <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">weeks</Text>
            </View>
          )}
          {repeatMode === 'once' && <DateInput label="Date" value={onceDate} onChange={setOnceDate} />}
        </View>
      )}

      {showActiveWindow && (
        <View className="gap-2">
          <View className="mb-1.5 flex-row items-baseline justify-between gap-2">
            <Text className={typography.eyebrow}>Active dates (optional)</Text>
            {selectedPlan && formatPlanRange(selectedPlan) ? (
              <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">Plan: {formatPlanRange(selectedPlan)}</Text>
            ) : null}
          </View>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <DateInput label="Starts" value={activeFrom} max={activeUntil || undefined} onChange={setActiveFrom} placeholder="Any" />
            </View>
            <View className="flex-1">
              <DateInput label="Ends" value={activeUntil} min={activeFrom || undefined} onChange={setActiveUntil} placeholder="Any" />
            </View>
          </View>
          {!!(activeFrom || activeUntil) && (
            <View className="flex-row items-center justify-between">
              <Text className="text-[12px] leading-snug text-neutral-500 dark:text-neutral-400">Only shows on the schedule within this range.</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setActiveFrom('');
                  setActiveUntil('');
                }}
              >
                <Text className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">Clear</Text>
              </Pressable>
            </View>
          )}
          {dateWindowError && <Text className="text-[12px] font-semibold text-rose-500 dark:text-rose-400">{dateWindowError}</Text>}
        </View>
      )}

      {selectedPlan && !isOccurrenceScope && taskType !== 'commitment' && (
        <View className="gap-3">
          <Text className={typography.eyebrow}>{taskType === 'session' ? 'Session steps' : 'Subtasks'}</Text>
          {subtasks.map((s, i) => (
            <SubtaskDraftRow
              key={s.id}
              draft={s}
              autoFocus={focusNewSubtask && i === subtasks.length - 1}
              showDeadline={taskType === 'task'}
              onChange={updateSubtask}
              onDelete={removeSubtask}
              onDuplicate={duplicateSubtask}
              onMove={moveSubtask}
              canMoveUp={i > 0}
              canMoveDown={i < subtasks.length - 1}
              onCopyToTask={onCopySubtaskToTasks && copyCandidates.length > 0 ? openCopyToTask : undefined}
            />
          ))}
          <AddRowButton label={taskType === 'session' ? 'Add step' : 'Add subtask'} onClick={addSubtask} />

          {taskType === 'session' && stepCount > 0 && (
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Buffer between steps</Text>
              <View className="flex-row gap-1">
                {[0, 1, 2, 5, 10].map((m) => {
                  const on = (stepBuffer ?? 0) === m;
                  return (
                    <Pressable
                      key={m}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        haptic('light');
                        setStepBuffer(m === 0 ? undefined : m);
                      }}
                      className={`h-8 min-w-[36px] items-center justify-center rounded-full px-2.5 ${
                        on ? 'bg-blue-600 dark:bg-blue-500' : 'border border-neutral-200 dark:border-white/10'
                      }`}
                    >
                      <Text className={`text-[12px] font-bold tabular-nums ${on ? 'text-white' : 'text-neutral-500 dark:text-neutral-400'}`}>
                        {m === 0 ? 'None' : `${m}m`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {(stepCount > 0 || combinedStepMinutes != null) && (
            <View
              className={`flex-row items-center justify-between gap-3 rounded-xl border px-3 py-2 ${
                subtaskDurationError
                  ? 'border-rose-300/60 bg-rose-50/60 dark:border-rose-400/25 dark:bg-rose-500/[0.06]'
                  : 'border-blue-200/60 bg-blue-50/50 dark:border-blue-400/20 dark:bg-blue-500/[0.06]'
              }`}
            >
              <View className="flex-1 flex-row items-center gap-1.5">
                <Icon icon={IconClock} size={13} strokeWidth={2.2} className={subtaskDurationError ? 'text-rose-500 dark:text-rose-400' : 'text-blue-500 dark:text-blue-400'} />
                <Text className="flex-1 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">
                  Total {taskType === 'session' ? 'step' : 'subtask'} time
                  {stepBufferTotalMinutes > 0 ? ` (incl. ${formatMinutes(stepBufferTotalMinutes)} buffer)` : ''}
                </Text>
              </View>
              <Text
                className={`text-[13px] font-extrabold tabular-nums ${subtaskDurationError ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'}`}
              >
                {combinedStepMinutes != null ? formatMinutes(combinedStepMinutes) : '—'}
                {allottedMinutes != null ? <Text className="text-neutral-500 dark:text-neutral-400"> / {formatMinutes(allottedMinutes)}</Text> : null}
              </Text>
            </View>
          )}
          {subtaskDurationError && <Text className="text-[12px] font-semibold text-rose-500 dark:text-rose-400">{subtaskDurationError}</Text>}
        </View>
      )}
    </View>
  );

  const footer = (
    <View className="flex-row items-center gap-2">
      <Button className="min-w-0 flex-1" onPress={handleSave} disabled={!canSave}>
        <Icon icon={IconCheck} size={18} strokeWidth={2.5} className={BUTTON_TEXT.primary} />
        {saveLabel}
      </Button>
      {mode === 'edit' && !isOccurrenceScope && onDuplicate && (
        <Button
          variant="secondary"
          onPress={openDuplicatePicker}
          disabled={!canSave}
          accessibilityLabel="Duplicate task"
          className="h-12 w-12 shrink-0 px-0 dark:bg-white/[0.06]"
        >
          <Icon icon={IconCopyPlus} size={20} strokeWidth={2} className="text-neutral-700 dark:text-neutral-200" />
        </Button>
      )}
      {mode === 'edit' && !isOccurrenceScope && onDelete && (
        <Button
          variant="dangerSecondary"
          onPress={() => {
            haptic('light');
            onDelete();
          }}
          accessibilityLabel="Delete task"
          className="h-12 w-12 shrink-0 px-0 dark:bg-rose-500/[0.08]"
        >
          <Icon icon={IconTrash} size={20} strokeWidth={2} className="text-rose-500 dark:text-rose-300" />
        </Button>
      )}
    </View>
  );

  const categorySheet = (
    <CategorySheet
      open={categorySheetOpen}
      category={editingCategory}
      onClose={() => {
        setCategorySheetOpen(false);
        setEditingCategory(null);
      }}
      onSave={(draft) => {
        if (editingCategory) onUpdateCategory?.(editingCategory.id, draft);
        else setCategoryId(onCreateCategory(draft));
        setCategorySheetOpen(false);
        setEditingCategory(null);
      }}
    />
  );

  const copySubtaskSheet = (
    <BottomSheet open={copySubtaskId !== null} onClose={() => setCopySubtaskId(null)}>
      <View className="px-5 pb-6 pt-4">
        <SheetHeader eyebrow="Copy subtask" title="Add to other tasks" onClose={() => setCopySubtaskId(null)} />
        <Text className="mb-3 mt-3 text-[13px] text-neutral-500 dark:text-neutral-400">Pick the tasks that should also get this subtask.</Text>
        <View className="mb-5 gap-2">
          {copyCandidates.length === 0 ? (
            <Text className="py-6 text-center text-[13px] text-neutral-500 dark:text-neutral-400">No other tasks to copy into yet.</Text>
          ) : (
            copyCandidates.map((c) => {
              const sel = copyTargetIds.includes(c.id);
              const planTitle = plans.find((p) => p.id === c.planId)?.title;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: sel }}
                  onPress={() => setCopyTargetIds((prev) => (sel ? prev.filter((id) => id !== c.id) : [...prev, c.id]))}
                  className={`w-full flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${
                    sel ? 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white' : 'border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]'
                  }`}
                >
                  <View
                    className={`h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      sel ? 'border-transparent bg-white/20 dark:bg-black/10' : 'border-neutral-300 dark:border-white/20'
                    }`}
                  >
                    {sel && <Icon icon={IconCheck} size={13} strokeWidth={3} className="text-white dark:text-neutral-900" />}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className={`truncate text-[14px] font-semibold ${sel ? 'text-white dark:text-neutral-900' : 'text-neutral-700 dark:text-neutral-200'}`}>{c.title}</Text>
                    {planTitle ? (
                      <Text className={`truncate text-[12px] ${sel ? 'text-white/70 dark:text-neutral-900/70' : 'text-neutral-500 dark:text-neutral-400'}`}>{planTitle}</Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
        <Button fullWidth onPress={confirmCopyToTask} disabled={copyTargetIds.length === 0}>
          <Icon icon={IconCopy} size={15} className={BUTTON_TEXT.primary} />
          {`Copy to ${copyTargetIds.length || ''} task${copyTargetIds.length === 1 ? '' : 's'}`}
        </Button>
      </View>
    </BottomSheet>
  );

  if (presentation === 'page') {
    // The iOS shell's full-screen editor: sticky header, scrolling form,
    // pinned footer — the web's `presentation="page"` layout.
    return (
      <Modal visible={pageTurn} animationType="slide" presentationStyle="fullScreen" onRequestClose={duplicateStep === 'picking' ? () => setDuplicateStep('idle') : onClose}>
        <ModalNestingContext.Provider value>
        <View className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" style={{ paddingTop: insets.top }}>
          {duplicateStep === 'picking' ? (
            <ScrollView keyboardShouldPersistTaps="handled">{duplicatePicker}</ScrollView>
          ) : (
            <>
              <View className="border-b border-neutral-200 bg-white px-5 py-3 dark:border-white/[0.08] dark:bg-neutral-950">
                <SheetHeader eyebrow={eyebrow} title={headingTitle} onClose={onClose} />
              </View>
              <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
                <View className="px-5 pb-8 pt-0">{formBody}</View>
              </ScrollView>
              <View
                className="border-t border-neutral-200 bg-white px-5 pt-3 dark:border-white/[0.08] dark:bg-neutral-950"
                style={{ paddingBottom: Math.max(12, insets.bottom) }}
              >
                {footer}
              </View>
            </>
          )}
          {categorySheet}
          {copySubtaskSheet}
          {overlay}
        </View>
        </ModalNestingContext.Provider>
      </Modal>
    );
  }

  return (
    <>
      <BottomSheet open={isOpen} onClose={duplicateStep === 'picking' ? () => setDuplicateStep('idle') : onClose}>
        {duplicateStep === 'picking' ? (
          duplicatePicker
        ) : (
          <View className="px-5 pb-6 pt-4">
            <SheetHeader eyebrow={eyebrow} title={headingTitle} onClose={onClose} />
            {formBody}
            <View className="mt-6">{footer}</View>
          </View>
        )}
        {/* Nested inside the sheet so they present over it on iOS (lib/modalTurn). */}
        {categorySheet}
        {copySubtaskSheet}
      </BottomSheet>
    </>
  );
}

