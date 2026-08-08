"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconCopyPlus,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { streamGenerateSubtasks, parseGeneratedSubtasks } from "@/lib/aiActions";
import AIActionSheet, { type ResultItem } from "@/components/ai/AIActionSheet";
import { useAIRuntime } from "@/lib/ai/useAIRuntime";
import { resolveAIRoute } from "@/lib/ai/runtime";
import { AI_ENABLED } from "@/lib/featureFlags";
import { getDeviceCapabilities } from "@/lib/performance/detectLowEndDevice";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Input, { FORM_INPUT_CLASS, FORM_LABEL, Textarea } from "@/components/ui/Input";
import TimeSlotPicker, { type EditableSlot } from "@/components/TimeSlotPicker";
import { CategorySelector } from "./CategorySelector";
import CategorySheet, { type CategoryDraft } from "@/components/category/CategorySheet";
import { haptic } from "@/lib/haptics";
import type { DayKey, Plan, Task, TaskCategory, TaskRecurrence, TaskTypeValue } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
import { localISODate } from "@/lib/dateUtils";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import {
  uid,
  displayToInputTime,
  inputToDisplayTime,
  getSlots,
} from "@/lib/taskMutations";
import type { TaskSlot } from "@/lib/useScheduleDB";
import { parseTimeToMinutes, parseDurationMinutes, formatMinutes } from "@/lib/timeUtils";
import { resolveOccurrence } from "@/lib/taskOccurrence";
import { PlanSelector } from "./PlanSelector";
import SubtaskDraftRow, { type SubtaskDraft } from "./SubtaskDraftRow";
import { validateTaskSlots } from "@/lib/scheduleRules";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskSaveData {
  taskDraft: Omit<Task, "id">;
  taskId?: string;          // only present in edit mode
  repeatDays: DayKey[];
  planItems: {
    planId: string;
    items: ScheduleEntry[];
  } | null;
  /** "occurrence" = apply edits to just `occurrenceDateISO` (per-date override). */
  scope?: "all" | "occurrence";
  /** Recurrence rule (absent = plain weekly on the repeatDays). */
  recurrence?: TaskRecurrence;
  /**
   * When set, each listed weekday gets its own slots (custom-per-day). Routes to
   * updateTaskPerDay. Absent = the uniform slots on `taskDraft` apply to all days.
   */
  perDaySlots?: Partial<Record<DayKey, TaskSlot[]>>;
}

const JS_DAYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function weekdayOfISO(iso: string): DayKey {
  return JS_DAYS[new Date(iso + "T00:00:00").getDay()];
}

export interface TaskSheetProps {
  mode: "create" | "edit";
  task?: Task | null;
  plans: Plan[];
  /** Owns every task's icon and colour; see lib/taskCategories.ts. */
  categories: TaskCategory[];
  /** Persist a category created from inside this sheet, returning its id. */
  onCreateCategory: (draft: CategoryDraft) => string;
  /**
   * Rename / recolour an existing category without leaving the task. Omitted →
   * the picker rows show no pencil.
   */
  onUpdateCategory?: (id: string, draft: CategoryDraft) => void;
  /** Omitted → no trash on the picker rows. Guarded by `categoryUsage`. */
  onDeleteCategory?: (id: string) => void;
  /**
   * Task counts per category, from `categoryUsageCounts`. Deleting one that is
   * in use is blocked rather than cascading, and the count is what makes the
   * refusal explainable.
   */
  categoryUsage?: ReadonlyMap<string, number>;
  activeDay: DayKey;
  activeDays?: DayKey[];
  /** All weekday task lists — lets edit mode load each day's own slots (per-day times). */
  activities?: Partial<Record<DayKey, Task[]>>;
  isOpen: boolean;
  initialPlanId?: string | null;
  initialTaskType?: TaskTypeValue;
  /** Pre-fill start time on create (HH:MM 24-hour format, e.g. "09:30"). */
  initialStartTime?: string;
  /** Pre-fill end time on create (HH:MM 24-hour format, e.g. "10:30"). */
  initialEndTime?: string;
  /** The specific date being edited — enables the "This day only" scope toggle. */
  occurrenceDateISO?: string;
  /** Whether editing just this occurrence is allowed (today/future only). */
  canEditOccurrence?: boolean;
  ollamaUrl?: string;
  ollamaModel?: string;
  onClose: () => void;
  onSave: (data: TaskSaveData) => void;
  onDuplicate?: (data: TaskSaveData) => void;
  /**
   * Copy a subtask into other existing tasks. Persists immediately (outside this
   * sheet's draft) via the parent's schedule reducer. Omitted → the row's
   * "copy to another task" affordance is hidden.
   */
  onCopySubtaskToTasks?: (entry: ScheduleEntry, targetTaskIds: string[]) => void;
  onDelete?: () => void;
  /** Clear this date's per-date override (restore the recurring template). */
  onResetOccurrence?: () => void;
  presentation?: "sheet" | "page";
}

function entryToSubtaskDraft(e: ScheduleEntry): SubtaskDraft {
  return {
    id: e.id,
    title: e.task,
    info: e.info ?? "",
    duration: e.duration ?? "",
    deadline: e.deadline,
    deadlineScope: e.deadlineScope,
  };
}

function subtaskDraftToEntry(d: SubtaskDraft): ScheduleEntry {
  return {
    id: d.id,
    task: d.title.trim(),
    info: (d.info ?? "").trim() || undefined,
    duration: (d.duration ?? "").trim() || undefined,
    deadline: d.deadline || undefined,
    deadlineScope: d.deadline ? d.deadlineScope ?? "day" : undefined,
  };
}

// ── Label style (shared with TimeSlotPicker) ─────────────────────────────────

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

function isValidInputTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Convert a task's display-format time blocks into editable (input-format) slots. */
function toInputSlots(source: { startTime: string; endTime: string; slots?: TaskSlot[] }): EditableSlot[] {
  return getSlots(source).map((s) => ({
    startTime: displayToInputTime(s.startTime),
    endTime: displayToInputTime(s.endTime),
  }));
}

/** Convert editable (input-format) slots back into display-format time blocks. */
function toDisplaySlots(slots: EditableSlot[]): TaskSlot[] {
  return slots.map((s) => ({
    startTime: inputToDisplayTime(s.startTime),
    endTime: inputToDisplayTime(s.endTime),
  }));
}

function slotsAllValid(slots: EditableSlot[]): boolean {
  return slots.length > 0 && slots.every((s) => isValidInputTime(s.startTime) && isValidInputTime(s.endTime));
}

// ── Main sheet ────────────────────────────────────────────────────────────────

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
  isOpen,
  initialPlanId,
  initialTaskType,
  initialStartTime,
  initialEndTime,
  occurrenceDateISO,
  canEditOccurrence = false,
  ollamaUrl,
  ollamaModel,
  onClose,
  onSave,
  onDuplicate,
  onCopySubtaskToTasks,
  onDelete,
  onResetOccurrence,
  presentation = "sheet",
}: TaskSheetProps) {
  // ── AI routing ────────────────────────────────────────────────────────────
  const aiRuntime = useAIRuntime();
  const { tier, isDesktop } = getDeviceCapabilities();
  const aiRoute = resolveAIRoute("generate-subtasks", {
    tier,
    isDesktop,
    ollamaConnected: !!(ollamaUrl && ollamaModel),
    aiEnabled: aiRuntime.enabled,
  });
  const keepBackdropLight = mode === "create" && (!!initialStartTime || !!initialEndTime);
  // AI is globally hidden for now — gate the "Expand" affordance behind the flag.
  const canExpand = AI_ENABLED && aiRoute.backend !== "none";

  // ── Form state ─────────────────────────────────────────────────────────────
  const [planId, setPlanId] = useState("");
  const [expandSheetOpen, setExpandSheetOpen] = useState(false);
  const [taskType, setTaskType] = useState<TaskTypeValue>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // Time blocks in HTML input format ("HH:MM"). One = single block; many = phases.
  const [slots, setSlots] = useState<EditableSlot[]>([{ startTime: "", endTime: "" }]);
  // Custom-per-day: when false, `slots` applies to every repeat day. When true,
  // each repeat day has its own slots (editDay picks which one the editor edits).
  const [sameEveryDay, setSameEveryDay] = useState(true);
  const [perDaySlots, setPerDaySlots] = useState<Partial<Record<DayKey, EditableSlot[]>>>({});
  const [editDay, setEditDay] = useState<DayKey>(activeDay);
  const [repeatDays, setRepeatDays] = useState<DayKey[]>([activeDay]);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [focusNewSubtask, setFocusNewSubtask] = useState(false);
  const [duplicateStep, setDuplicateStep] = useState<"idle" | "picking">("idle");
  const [duplicateDays, setDuplicateDays] = useState<DayKey[]>([]);
  const [editScope, setEditScope] = useState<"all" | "occurrence">("all");
  // Recurrence: weekly (every matching weekday), interval (every N weeks), or once (single date).
  // Identity comes from the task's category, so there is nothing to pick here
  // beyond which category it is. See components/category/CategorySheet.tsx.
  const [categoryId, setCategoryId] = useState<string>("");
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  /** Non-null puts the category sheet in edit mode for that category. */
  const [editingCategory, setEditingCategory] = useState<TaskCategory | null>(null);
  const [repeatMode, setRepeatMode] = useState<"weekly" | "interval" | "once">("weekly");
  const [intervalWeeks, setIntervalWeeks] = useState(2);
  const [onceDate, setOnceDate] = useState("");
  // Optional active window — the task only appears within [activeFrom, activeUntil].
  const [activeFrom, setActiveFrom] = useState("");
  const [activeUntil, setActiveUntil] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);

  // Anchor for "every N weeks" + default date for a one-off: the viewed date, else today.
  const baseDateISO = occurrenceDateISO || localISODate(new Date());

  // The "This day only" scope is offered when editing an existing task on a known
  // current/future date. Per-date overrides cover title/time/note (not subtasks).
  const canScopeToOccurrence = mode === "edit" && !!occurrenceDateISO && canEditOccurrence;
  const isOccurrenceScope = canScopeToOccurrence && editScope === "occurrence";
  const occurrenceDateLabel = occurrenceDateISO
    ? new Date(occurrenceDateISO + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    : "";
  const hasOccurrenceOverride = !!(
    task && occurrenceDateISO && (() => {
      const ex = task.exceptions?.[occurrenceDateISO];
      return ex && (ex.title !== undefined || ex.startTime !== undefined || ex.endTime !== undefined || ex.description !== undefined);
    })()
  );

  // ── Initialise on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    if (mode === "edit" && task) {
      const linkedPlan = plans.find((p) => p.id === task.planId);
      const selectedDays = activeDays && activeDays.length > 0 ? activeDays : [activeDay];
      setPlanId(task.planId);
      setTaskType(task.taskType ?? "task");
      setTitle(task.title);
      setDescription(task.description ?? "");
      // Load each weekday's own slots so per-day differences round-trip; detect
      // whether they're all identical to preselect Same-vs-Custom.
      const perDay: Partial<Record<DayKey, EditableSlot[]>> = {};
      for (const d of selectedDays) {
        const dayTask = activities?.[d]?.find((t) => t.id === task.id);
        perDay[d] = toInputSlots(dayTask ?? task);
      }
      const baseSlots = toInputSlots(task);
      const uniform = selectedDays.every(
        (d) => JSON.stringify(perDay[d]) === JSON.stringify(baseSlots)
      );
      setSlots(baseSlots);
      setPerDaySlots(perDay);
      setSameEveryDay(uniform);
      setEditDay(selectedDays.includes(activeDay) ? activeDay : selectedDays[0]);
      setRepeatDays(selectedDays);
      setCategoryId(task.categoryId ?? "");
      // Load per-task subtasks; fall back to plan template for tasks created before this fix
      const taskSubtasks = task.subtasks ?? linkedPlan?.items ?? [];
      setSubtasks(taskSubtasks.map(entryToSubtaskDraft));
      const r = task.recurrence;
      if (r?.type === "once") { setRepeatMode("once"); setOnceDate(r.dateISO); }
      else if (r?.type === "weekly" && r.interval > 1) { setRepeatMode("interval"); setIntervalWeeks(r.interval); setOnceDate(baseDateISO); }
      else { setRepeatMode("weekly"); setOnceDate(baseDateISO); }
      setActiveFrom(task.activeFrom ?? "");
      setActiveUntil(task.activeUntil ?? "");
    } else {
      const pid = initialPlanId ?? plans[0]?.id ?? "";
      setPlanId(pid);
      setTaskType(initialTaskType ?? "task");
      setTitle("");
      setDescription("");
      setSlots([{ startTime: initialStartTime ?? "", endTime: initialEndTime ?? "" }]);
      setPerDaySlots({});
      setSameEveryDay(true);
      setEditDay(activeDay);
      setRepeatDays([activeDay]);
      setSubtasks([]);
      // Seed from the category matching the plan's icon when the user already
      // has one — a fresh task then lands in the right bucket without a pick.
      const seedIcon = plans.find((p) => p.id === pid)?.emoji || "";
      setCategoryId(categories.find((c) => c.icon === seedIcon)?.id ?? "");
      setRepeatMode("weekly");
      setIntervalWeeks(2);
      setOnceDate(baseDateISO);
      setActiveFrom("");
      setActiveUntil("");
    }
    setFocusNewSubtask(false);
    setDuplicateStep("idle");
    setEditScope("all");
    setTimeout(() => titleRef.current?.focus(), 80);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switching scope reloads the editable fields from the matching base: the
  // recurring template for "all", or this date's resolved occurrence for "this
  // day only" (so an existing per-date override pre-fills).
  function applyScope(scope: "all" | "occurrence") {
    setEditScope(scope);
    if (mode !== "edit" || !task) return;
    const src = scope === "occurrence" && occurrenceDateISO ? resolveOccurrence(task, occurrenceDateISO) : task;
    setTitle(src.title);
    setDescription(src.description ?? "");
    // Per-date overrides cover a single block only; slots stay a template concept.
    if (scope === "occurrence") {
      setSlots([{ startTime: displayToInputTime(src.startTime), endTime: displayToInputTime(src.endTime) }]);
    } else {
      setSlots(toInputSlots(task));
    }
  }

  function handleSelectPlan(plan: Plan) {
    setPlanId(plan.id);
    if (mode === "create") setSubtasks([]);
  }


  // ── Subtask management ─────────────────────────────────────────────────────
  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: uid(), title: "", info: "", duration: "" }]);
    setFocusNewSubtask(true);
  }

  const updateSubtask = useCallback((id: string, updated: SubtaskDraft) => {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, []);

  const removeSubtask = useCallback((id: string) => {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Duplicate a subtask within this task — insert a fresh-id copy right below it.
  const duplicateSubtask = useCallback((id: string) => {
    setSubtasks((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      if (i === -1) return prev;
      const copy: SubtaskDraft = { ...prev[i], id: uid() };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }, []);

  // Copy a subtask into *other* tasks — opens a picker of candidate tasks.
  const [copySubtaskId, setCopySubtaskId] = useState<string | null>(null);
  const [copyTargetIds, setCopyTargetIds] = useState<string[]>([]);

  // Every other task (deduped across weekday buckets), for the copy-to picker.
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
    if (draft && draft.title.trim()) {
      onCopySubtaskToTasks(subtaskDraftToEntry(draft), copyTargetIds);
    }
    setCopySubtaskId(null);
    setCopyTargetIds([]);
  }

  const subtaskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const subtaskIds = useMemo(() => subtasks.map((s) => s.id), [subtasks]);

  function handleSubtasksDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSubtasks((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id);
      const newIndex = prev.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }

  async function* subtaskStream(goal: string, picks: string[]): AsyncGenerator<string> {
    if (!title.trim()) return;
    const hints = [goal.trim(), ...picks].filter(Boolean).join(". ");
    const taskLabel = hints ? `${title.trim()} — ${hints}` : title.trim();

    if (aiRoute.backend === "ollama" && ollamaUrl && ollamaModel) {
      yield* streamGenerateSubtasks(ollamaUrl, ollamaModel, taskLabel, selectedPlan?.title);
      return;
    }

    if (aiRoute.backend === "transformers") {
      const results = await aiRuntime.generateSubtasks(taskLabel, selectedPlan?.title);
      yield JSON.stringify(results);
    }
  }

  function parseSubtaskResults(raw: string): ResultItem[] {
    return parseGeneratedSubtasks(raw).map((s, i) => ({ id: String(i), label: s }));
  }

  function commitSubtasks(items: ResultItem[]) {
    setSubtasks((prev) => [
      ...prev,
      ...items.map((r) => ({ id: uid(), title: r.label, info: "", duration: "" })),
    ]);
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;

  // Custom-per-day is only meaningful when the task spans >1 weekday.
  const canCustomizePerDay = !isOccurrenceScope && repeatMode !== "once" && repeatDays.length > 1;
  const perDayActive = canCustomizePerDay && !sameEveryDay;
  const resolvedEditDay = repeatDays.includes(editDay) ? editDay : repeatDays[0] ?? activeDay;

  // Which slots the picker edits, and where edits are written.
  const editorSlots = perDayActive ? perDaySlots[resolvedEditDay] ?? slots : slots;
  function setEditorSlots(next: EditableSlot[]) {
    if (perDayActive) setPerDaySlots((prev) => ({ ...prev, [resolvedEditDay]: next }));
    else setSlots(next);
  }

  // Validate every day that will be written (each day's own slots in custom mode).
  const daysToValidate: EditableSlot[][] = isOccurrenceScope || !perDayActive
    ? [slots]
    : repeatDays.map((d) => perDaySlots[d] ?? slots);
  const allSlotsValidNow = daysToValidate.every(slotsAllValid);
  const timeError = allSlotsValidNow
    ? daysToValidate
        .map((ds) => validateTaskSlots(ds, { title: title.trim() || "Task", day: activeDay }))
        .find(Boolean) ?? null
    : null;

  // Subtask durations must add up to no more than the task's allotted time.
  // `duration` is free text, so unparseable entries are treated as unknown
  // (skipped) rather than zero — we only block when the *known* durations
  // already overflow the schedule window.
  const subtaskTotalMinutes = useMemo(() => {
    let total = 0;
    let any = false;
    for (const s of subtasks) {
      if (!s.title.trim()) continue;
      const mins = parseDurationMinutes(s.duration);
      if (mins != null && mins > 0) {
        total += mins;
        any = true;
      }
    }
    return any ? total : null;
  }, [subtasks]);

  const allottedMinutes = useMemo(() => {
    let total = 0;
    for (const s of slots) {
      const start = parseTimeToMinutes(s.startTime);
      let end = parseTimeToMinutes(s.endTime);
      if (start == null || end == null) continue;
      if (end < start) end += 1440; // overnight
      if (end > start) total += end - start;
    }
    return total > 0 ? total : null;
  }, [slots]);

  const subtaskDurationError =
    taskType !== "commitment" &&
    subtaskTotalMinutes != null &&
    allottedMinutes != null &&
    subtaskTotalMinutes > allottedMinutes
      ? `Subtasks add up to ${formatMinutes(subtaskTotalMinutes)}, but this task only has ${formatMinutes(allottedMinutes)}. Trim durations or extend the time.`
      : null;

  // The active window only applies to recurring tasks (a one-off already has its
  // single date). Guard against an inverted range.
  const showActiveWindow = !isOccurrenceScope && repeatMode !== "once";
  const dateWindowError =
    showActiveWindow && activeFrom && activeUntil && activeFrom > activeUntil
      ? "Start date must be on or before the end date."
      : null;

  const repeatOk = isOccurrenceScope
    ? true
    : repeatMode === "once"
      ? !!onceDate
      : repeatDays.length > 0;
  // A commitment is held time, not project work: it belongs to no plan, so the
  // plan requirement is lifted for it.
  const isCommitment = taskType === "commitment";
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

    const validSubtasks = subtasks
      .filter((s) => s.title.trim().length > 0)
      .map(subtaskDraftToEntry);

    // Resolve the recurrence rule + which weekday bucket(s) host the task.
    let recurrence: TaskRecurrence | undefined;
    let effectiveRepeatDays = repeatDays;
    if (repeatMode === "once") {
      recurrence = { type: "once", dateISO: onceDate };
      effectiveRepeatDays = [weekdayOfISO(onceDate)];
    } else if (repeatMode === "interval") {
      recurrence = { type: "weekly", interval: intervalWeeks, anchorISO: baseDateISO };
    } // weekly → undefined (every matching weekday)

    // Uniform slots (base). In custom-per-day mode the base is the first repeat
    // day's slots; per-day overrides ride in `perDaySlots`.
    const baseDisplaySlots = toDisplaySlots(slots);
    const primary = baseDisplaySlots[0] ?? { startTime: inputToDisplayTime(slots[0]?.startTime ?? ""), endTime: inputToDisplayTime(slots[0]?.endTime ?? "") };

    let perDaySlotsOut: Partial<Record<DayKey, TaskSlot[]>> | undefined;
    if (perDayActive) {
      perDaySlotsOut = {};
      for (const d of effectiveRepeatDays) {
        perDaySlotsOut[d] = toDisplaySlots(perDaySlots[d] ?? slots);
      }
    }

    const taskDraft: Omit<Task, "id"> = {
      title: title.trim(),
      description: description.trim() || undefined,
      startTime: primary.startTime,
      endTime: primary.endTime,
      slots: baseDisplaySlots.length > 1 ? baseDisplaySlots : undefined,
      // A commitment belongs to no plan, but it may still be categorised:
      // "Commute" is a real kind of time and reads better in the day breakdown
      // than an anonymous grey wedge. Leaving it blank keeps the old behaviour
      // (neutral block, pooled into "Held time"), so this stays optional.
      categoryId: categoryId || undefined,
      planId: isCommitment ? "" : selectedPlan!.id,
      taskType,
      // Store subtasks on the task itself so each task has an independent list.
      // For edits, an empty array must be persisted explicitly to override any
      // plan template fallback and delete subtasks from this task only.
      subtasks:
        mode === "edit"
          ? validSubtasks
          : validSubtasks.length > 0
          ? validSubtasks
          : undefined,
      recurrence,
      // Active window only applies to recurring tasks; a one-off carries its own date.
      activeFrom: showActiveWindow && activeFrom ? activeFrom : undefined,
      activeUntil: showActiveWindow && activeUntil ? activeUntil : undefined,
    };

    onSave({
      taskDraft,
      taskId: mode === "edit" ? task?.id : undefined,
      repeatDays: effectiveRepeatDays,
      // Only update the plan template if the user explicitly added subtasks
      planItems:
        mode === "create" && taskType === "task" && selectedPlan && validSubtasks.length > 0
          ? { planId: selectedPlan.id, items: validSubtasks }
          : null,
      scope: isOccurrenceScope ? "occurrence" : "all",
      recurrence,
      perDaySlots: perDaySlotsOut,
    });
  }

  function openDuplicatePicker() {
    setDuplicateDays(repeatDays);
    setDuplicateStep("picking");
  }

  function confirmDuplicate() {
    if (!canSave || !selectedPlan || !onDuplicate) return;
    const validSubtasks = subtasks
      .filter((s) => s.title.trim().length > 0)
      .map(subtaskDraftToEntry);
    const dupSlots = toDisplaySlots(slots);
    onDuplicate({
      taskDraft: {
        title: `Copy of ${title.trim()}`,
        description: description.trim() || undefined,
        startTime: dupSlots[0]?.startTime ?? "",
        endTime: dupSlots[0]?.endTime ?? "",
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
    setDuplicateStep("idle");
  }

  function handleClose() {
    onClose();
  }

  function handleTitleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    handleSave();
  }

  function handleDescriptionKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
  }

  const eyebrow = mode === "create" ? "Add" : "Edit";
  const headingTitle = mode === "create" ? "New Task" : (task?.title ?? "Task");

  const sheetContent = (
    <>
      <AnimatePresence mode="wait" initial={false}>

        {/* ── Duplicate day-picker ─────────────────────────────────────────── */}
        {duplicateStep === "picking" && (
          <m.div
            key="picker"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 32 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col px-5 pb-6 pt-4"
          >
            {/* Header */}
            <div className="mb-5 flex items-center gap-3">
              <IconButton
                label="Back"
                variant="soft"
                size="md"
                radius="full"
                onClick={() => setDuplicateStep("idle")}
                className="text-neutral-600 dark:text-neutral-300"
              >
                <IconArrowLeft size={18} strokeWidth={2} />
              </IconButton>
              <p className="text-[18px] font-bold text-neutral-900 dark:text-white">Duplicate Task</p>
            </div>

            {/* Title preview */}
            <div className="mb-5 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
              <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400">New title</p>
              <p className="text-[15px] font-semibold text-neutral-900 dark:text-white">Copy of {title}</p>
            </div>

            {/* Day selector */}
            <div className="mb-6">
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">Copy to days</p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => {
                  const sel = duplicateDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setDuplicateDays((prev) =>
                          sel ? prev.filter((d) => d !== day) : [...prev, day]
                        )
                      }
                      className={`h-9 rounded-full px-4 text-[13px] font-semibold transition-colors ${
                        sel
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                          : "border border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button fullWidth onClick={confirmDuplicate} disabled={duplicateDays.length === 0}>
              <IconCopy size={15} />
              Create Copy
            </Button>
          </m.div>
        )}

        {/* ── Main form ───────────────────────────────────────────────────── */}
        {duplicateStep === "idle" && (
          <m.div
            key="form"
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -32 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={`flex flex-col px-5 pt-4 ${presentation === "page" ? "pb-28" : "pb-6"}`}
          >
            <SheetHeader
              eyebrow={eyebrow}
              title={headingTitle}
              onClose={handleClose}
              className={
                presentation === "page"
                  ? "sticky top-0 z-20 -mx-5 border-b border-neutral-200 bg-white px-5 py-3 dark:border-white/[0.08] dark:bg-neutral-950"
                  : ""
              }
            />

            <div className={`mt-4 space-y-5 ${presentation === "page" ? "pb-4" : ""}`}>
              {/* Edit scope — all occurrences vs just this date */}
              {canScopeToOccurrence && (
                <div>
                  <p className={`mb-1.5 ${SECTION_LABEL}`}>Apply changes to</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([["all", "All days"], ["occurrence", "This day only"]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => applyScope(value)}
                        className={`h-10 rounded-full text-[14px] font-semibold transition-colors ${
                          editScope === value
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                            : "border border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {isOccurrenceScope && (
                    <p className="mt-2 text-[12px] leading-snug text-neutral-400 dark:text-neutral-500">
                      Changes apply only to {occurrenceDateLabel} — title, time &amp; note.
                      {hasOccurrenceOverride && onResetOccurrence && (
                        <>
                          {" "}
                          <button
                            type="button"
                            onClick={() => { haptic("light"); onResetOccurrence(); }}
                            className="font-semibold text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
                          >
                            Reset this day
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* Task type toggle */}
              {!isOccurrenceScope && (
              <div>
                <p className={`mb-1.5 ${SECTION_LABEL}`}>Type</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    ["task", "Task"],
                    ["session", "Session"],
                    ["commitment", "Commitment"],
                  ] as const).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTaskType(type)}
                      className={`h-10 rounded-full px-1 text-[12px] font-semibold transition-colors ${
                        taskType === type
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                          : "border border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {taskType === "commitment" && (
                  <p className="mt-2 text-[12px] leading-snug text-neutral-400 dark:text-neutral-500">
                    Blocks your calendar but is never tracked — no checkbox, and
                    it stays out of your streak, consistency and completion stats.
                  </p>
                )}
              </div>
              )}

              {/* Plan selector — held time belongs to no plan. */}
              {!isOccurrenceScope && !isCommitment && (
                <PlanSelector
                  plans={plans}
                  selectedId={planId}
                  onSelect={handleSelectPlan}
                />
              )}

              {/* Title */}
              <Input
                ref={titleRef}
                label="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What are you working on?"
                onKeyDown={handleTitleKeyDown}
                autoComplete="off"
                enterKeyHint="done"
                spellCheck
                aria-label="Task title"
                aria-invalid={title.length > 0 && title.trim().length === 0}
              />

              {/* Category carries the icon and colour. Hidden in occurrence
                  scope only: identity belongs to the template, not to a single
                  date's override. Commitments DO get to pick one — optional for
                  them (see `canSave`), because held time is often genuinely
                  anonymous, but "Commute" is a real kind of time and deserves a
                  wedge of its own in the day breakdown. */}
              {!isOccurrenceScope && (
                <CategorySelector
                  categories={categories}
                  selectedId={categoryId}
                  onSelect={(category) => setCategoryId(category.id)}
                  onClear={() => setCategoryId("")}
                  onCreate={() => { setEditingCategory(null); setCategorySheetOpen(true); }}
                  onEdit={onUpdateCategory ? (category) => { setEditingCategory(category); setCategorySheetOpen(true); } : undefined}
                  onDelete={
                    onDeleteCategory
                      ? (category) => {
                          onDeleteCategory(category.id);
                          // The field would otherwise point at an id that no
                          // longer resolves, which renders as neutral with no
                          // explanation.
                          if (categoryId === category.id) setCategoryId("");
                        }
                      : undefined
                  }
                  usage={categoryUsage}
                  optional={isCommitment}
                />
              )}

              {/* Description */}
              <Textarea
                label="Note (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short note or context…"
                onKeyDown={handleDescriptionKeyDown}
                autoComplete="off"
                spellCheck
                aria-label="Task note"
              />

              {/* Same-vs-custom schedule per day (only when spanning >1 weekday) */}
              {canCustomizePerDay && (
                <div>
                  <p className={`mb-1.5 ${SECTION_LABEL}`}>Schedule</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([[true, "Same every day"], [false, "Custom per day"]] as const).map(([value, label]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setSameEveryDay(value)}
                        className={`h-10 rounded-full text-[14px] font-semibold transition-colors ${
                          sameEveryDay === value
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                            : "border border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {perDayActive && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {DAYS.filter((d) => repeatDays.includes(d)).map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setEditDay(day)}
                          className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                            resolvedEditDay === day
                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                              : "border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Time slot + repeat days (weekday chips hidden for one-off) */}
              <TimeSlotPicker
                slots={editorSlots}
                onSlotsChange={setEditorSlots}
                activeDay={activeDay}
                repeatDays={isOccurrenceScope || repeatMode === "once" || perDayActive ? undefined : repeatDays}
                onRepeatDaysChange={isOccurrenceScope || repeatMode === "once" || perDayActive ? undefined : setRepeatDays}
              />
              {timeError && (
                <p className="-mt-3 text-[12px] font-semibold text-rose-500 dark:text-rose-400">
                  {timeError.message}
                </p>
              )}

              {/* Recurrence mode */}
              {!isOccurrenceScope && (
                <div className="space-y-2">
                  <p className={`mb-1.5 ${SECTION_LABEL}`}>Repeat</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([["weekly", "Weekly"], ["interval", "Every N wks"], ["once", "One-off"]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setRepeatMode(val)}
                        className={`h-10 rounded-full text-[12px] font-semibold transition-colors ${
                          repeatMode === val
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                            : "border border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {repeatMode === "interval" && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[13px] text-neutral-500 dark:text-neutral-400">Every</span>
                      <button type="button" onClick={() => setIntervalWeeks((n) => Math.max(2, n - 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-[16px] font-bold text-neutral-600 dark:border-white/10 dark:text-neutral-300">−</button>
                      <span className="w-6 text-center text-[15px] font-bold tabular-nums text-neutral-900 dark:text-white">{intervalWeeks}</span>
                      <button type="button" onClick={() => setIntervalWeeks((n) => Math.min(8, n + 1))}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 text-[16px] font-bold text-neutral-600 dark:border-white/10 dark:text-neutral-300">+</button>
                      <span className="text-[13px] text-neutral-500 dark:text-neutral-400">weeks</span>
                    </div>
                  )}
                  {repeatMode === "once" && (
                    <div>
                      <label className={FORM_LABEL} htmlFor="task-once-date">Date</label>
                      <input
                        id="task-once-date"
                        type="date"
                        value={onceDate}
                        onChange={(e) => setOnceDate(e.target.value)}
                        aria-label="One-off task date"
                        aria-invalid={!onceDate}
                        className={`${FORM_INPUT_CLASS} px-3`}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Active window — optional start/end dates for a recurring task */}
              {showActiveWindow && (
                <div className="space-y-2">
                  <p className={`mb-1.5 ${SECTION_LABEL}`}>Active dates (optional)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={FORM_LABEL} htmlFor="task-active-from">Starts</label>
                      <input
                        id="task-active-from"
                        type="date"
                        value={activeFrom}
                        max={activeUntil || undefined}
                        onChange={(e) => setActiveFrom(e.target.value)}
                        aria-label="Task start date"
                        className={`${FORM_INPUT_CLASS} px-3`}
                      />
                    </div>
                    <div>
                      <label className={FORM_LABEL} htmlFor="task-active-until">Ends</label>
                      <input
                        id="task-active-until"
                        type="date"
                        value={activeUntil}
                        min={activeFrom || undefined}
                        onChange={(e) => setActiveUntil(e.target.value)}
                        aria-label="Task end date"
                        className={`${FORM_INPUT_CLASS} px-3`}
                      />
                    </div>
                  </div>
                  {(activeFrom || activeUntil) && (
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] leading-snug text-neutral-400 dark:text-neutral-500">
                        Only shows on the schedule within this range.
                      </p>
                      <button
                        type="button"
                        onClick={() => { setActiveFrom(""); setActiveUntil(""); }}
                        className="text-[12px] font-semibold text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  {dateWindowError && (
                    <p className="text-[12px] font-semibold text-rose-500 dark:text-rose-400">
                      {dateWindowError}
                    </p>
                  )}
                </div>
              )}

              {/* Subtasks / Session Steps */}
              {/* Commitments have nothing to check off, so no subtask list. */}
              {selectedPlan && !isOccurrenceScope && taskType !== "commitment" && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className={SECTION_LABEL}>
                      {taskType === "session" ? "Session Steps" : "Subtasks"}
                    </p>
                    {canExpand && title.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandSheetOpen(true)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                      >
                        <IconSparkles size={12} strokeWidth={2} />
                        Expand
                      </button>
                    )}
                  </div>

                  <DndContext sensors={subtaskSensors} onDragEnd={handleSubtasksDragEnd}>
                    <SortableContext items={subtaskIds} strategy={verticalListSortingStrategy}>
                      {subtasks.map((s, i) => (
                        <m.div
                          key={s.id}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ duration: 0.18, ease: "easeInOut" }}
                          style={{ overflow: "hidden" }}
                        >
                          <SubtaskDraftRow
                            draft={s}
                            autoFocus={focusNewSubtask && i === subtasks.length - 1}
                            showDeadline={taskType === "task"}
                            onChange={updateSubtask}
                            onDelete={removeSubtask}
                            onDuplicate={duplicateSubtask}
                            onCopyToTask={
                              onCopySubtaskToTasks && copyCandidates.length > 0 ? openCopyToTask : undefined
                            }
                          />
                        </m.div>
                      ))}
                    </SortableContext>
                  </DndContext>

                  <button
                    type="button"
                    onClick={addSubtask}
                    className="flex h-10 w-full items-center gap-2 rounded-full border border-dashed border-neutral-200 px-3 text-[13px] font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20 dark:hover:text-neutral-300"
                  >
                    <IconPlus size={14} strokeWidth={2.5} />
                    {taskType === "session" ? "Add Step" : "Add Subtask"}
                  </button>

                  {/* Durations must fit the task's allotted time. */}
                  {subtaskTotalMinutes != null && allottedMinutes != null && (
                    <p
                      className={`text-[12px] font-semibold ${
                        subtaskDurationError
                          ? "text-rose-500 dark:text-rose-400"
                          : "text-neutral-400 dark:text-neutral-500"
                      }`}
                    >
                      {subtaskDurationError
                        ? subtaskDurationError
                        : `Subtasks: ${formatMinutes(subtaskTotalMinutes)} of ${formatMinutes(allottedMinutes)} allotted`}
                    </p>
                  )}
                </section>
              )}
            </div>

            {/* Footer */}
            <div
              className={
                presentation === "page"
                  ? "fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-neutral-200 bg-white px-5 pt-3 dark:border-white/[0.08] dark:bg-neutral-950"
                  : "mt-6 flex items-center gap-2"
              }
              style={presentation === "page" ? { paddingBottom: "max(12px, env(safe-area-inset-bottom))" } : undefined}
            >
              <Button className="min-w-0 flex-1" onClick={handleSave} disabled={!canSave}>
                <IconCheck size={18} strokeWidth={2.5} />
                <span className="truncate">
                  {mode === "create" ? "Add Task" : isOccurrenceScope ? "Save this day" : "Save Changes"}
                </span>
              </Button>
              {mode === "edit" && !isOccurrenceScope && onDuplicate && (
                <Button
                  variant="secondary"
                  onClick={openDuplicatePicker}
                  disabled={!canSave}
                  aria-label="Duplicate task"
                  className="h-12 w-12 shrink-0 px-0 text-neutral-700 shadow-sm ring-1 ring-black/[0.03] hover:border-neutral-300 hover:bg-neutral-100 dark:bg-white/[0.06] dark:text-neutral-200 dark:ring-white/[0.06] dark:hover:bg-white/[0.10]"
                >
                  <IconCopyPlus size={20} strokeWidth={2} />
                </Button>
              )}
              {mode === "edit" && !isOccurrenceScope && onDelete && (
                <Button
                  variant="dangerSecondary"
                  onClick={() => { haptic("light"); onDelete(); }}
                  aria-label="Delete task"
                  className="h-12 w-12 shrink-0 px-0 text-rose-500 shadow-sm ring-1 ring-rose-500/10 hover:border-rose-300 hover:bg-rose-500/10 dark:bg-rose-500/[0.08] dark:text-rose-300 dark:ring-rose-400/10 dark:hover:border-rose-400/25 dark:hover:bg-rose-500/15"
                >
                  <IconTrash size={20} strokeWidth={2} />
                </Button>
              )}
            </div>
          </m.div>
        )}

      </AnimatePresence>

      {/* AI expand subtasks sheet */}
      {canExpand && (
        <AIActionSheet
          open={expandSheetOpen}
          onClose={() => setExpandSheetOpen(false)}
          title="Expand Task"
          contextLabel={title.trim() || undefined}
          inputPlaceholder="Any specific focus? e.g. beginner-friendly, step-by-step breakdown…"
          quickPicks={[
            "Step-by-step",
            "Be specific",
            "Include timing",
            "Keep it simple",
            "Practical steps",
          ]}
          ctaLabel="Build Steps"
          resultSingular="step"
          resultPlural="steps"
          onGenerate={subtaskStream}
          onParseResults={parseSubtaskResults}
          onAdd={commitSubtasks}
        />
      )}
    </>
  );

  // Creating a category without leaving the task — otherwise a user who hasn't
  // set one up yet is stuck at a disabled Save with no way forward.
  const categorySheet = (
    <CategorySheet
      open={categorySheetOpen}
      // Was hardcoded to null, which pinned this sheet to create-only even
      // though CategorySheet has been dual-mode all along.
      category={editingCategory}
      onClose={() => { setCategorySheetOpen(false); setEditingCategory(null); }}
      onSave={(draft) => {
        if (editingCategory) onUpdateCategory?.(editingCategory.id, draft);
        // Creating from inside the task also selects the new category —
        // otherwise the user makes one and still faces an empty field.
        else setCategoryId(onCreateCategory(draft));
        setCategorySheetOpen(false);
        setEditingCategory(null);
      }}
    />
  );

  // Copy-a-subtask-into-other-tasks picker. Rendered as a sibling sheet (like
  // categorySheet) so it layers over the form without disturbing draft state.
  const copySubtaskSheet = (
    <BottomSheet open={copySubtaskId !== null} onClose={() => setCopySubtaskId(null)}>
      <div className="flex flex-col px-5 pb-6 pt-4">
        <SheetHeader
          eyebrow="Copy subtask"
          title="Add to other tasks"
          onClose={() => setCopySubtaskId(null)}
        />
        <p className="mb-3 mt-3 text-[13px] text-neutral-500 dark:text-neutral-400">
          Pick the tasks that should also get this subtask.
        </p>
        <div className="mb-5 max-h-[46vh] space-y-2 overflow-y-auto">
          {copyCandidates.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-neutral-400 dark:text-neutral-500">
              No other tasks to copy into yet.
            </p>
          ) : (
            copyCandidates.map((c) => {
              const sel = copyTargetIds.includes(c.id);
              const planTitle = plans.find((p) => p.id === c.planId)?.title;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setCopyTargetIds((prev) =>
                      sel ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                    )
                  }
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    sel
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                      : "border-neutral-200 bg-white text-neutral-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-200"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      sel ? "border-transparent bg-white/20 dark:bg-black/10" : "border-neutral-300 dark:border-white/20"
                    }`}
                  >
                    {sel && <IconCheck size={13} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{c.title}</span>
                    {planTitle && (
                      <span className={`block truncate text-[12px] ${sel ? "opacity-70" : "text-neutral-400 dark:text-neutral-500"}`}>
                        {planTitle}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <Button fullWidth onClick={confirmCopyToTask} disabled={copyTargetIds.length === 0}>
          <IconCopy size={15} />
          Copy to {copyTargetIds.length || ""} task{copyTargetIds.length === 1 ? "" : "s"}
        </Button>
      </div>
    </BottomSheet>
  );

  if (presentation === "page") {
    return (
      <AnimatePresence>
        {isOpen && (
          <m.div
            key="task-page"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 28 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-40 h-dvh overflow-y-auto overscroll-contain bg-[#F3F4F1] pt-[env(safe-area-inset-top)] text-neutral-900 dark:bg-[#0E0E0E] dark:text-white"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {sheetContent}
            {categorySheet}
            {copySubtaskSheet}
          </m.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <>
      <BottomSheet
        open={isOpen}
        onClose={duplicateStep === "picking" ? () => setDuplicateStep("idle") : handleClose}
        backdropClassName={keepBackdropLight ? "bg-black/24" : undefined}
      >
        {sheetContent}
      </BottomSheet>
      {categorySheet}
      {copySubtaskSheet}
    </>
  );
}
