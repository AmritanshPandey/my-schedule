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
import TimeSlotPicker from "@/components/TimeSlotPicker";
import { haptic } from "@/lib/haptics";
import type { DayKey, Plan, Task, TaskRecurrence } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
import { localISODate } from "@/lib/dateUtils";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import {
  uid,
  displayToInputTime,
  inputToDisplayTime,
} from "@/lib/taskMutations";
import { resolveOccurrence } from "@/lib/taskOccurrence";
import { PlanSelector } from "./PlanSelector";
import SubtaskDraftRow, { type SubtaskDraft } from "./SubtaskDraftRow";
import { validateTaskTime } from "@/lib/scheduleRules";

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
}

const JS_DAYS: DayKey[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
function weekdayOfISO(iso: string): DayKey {
  return JS_DAYS[new Date(iso + "T00:00:00").getDay()];
}

export interface TaskSheetProps {
  mode: "create" | "edit";
  task?: Task | null;
  plans: Plan[];
  activeDay: DayKey;
  activeDays?: DayKey[];
  isOpen: boolean;
  initialPlanId?: string | null;
  initialTaskType?: "task" | "session";
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

// ── Main sheet ────────────────────────────────────────────────────────────────

export function TaskSheet({
  mode,
  task,
  plans,
  activeDay,
  activeDays,
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
  const [taskType, setTaskType] = useState<"task" | "session">("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [repeatDays, setRepeatDays] = useState<DayKey[]>([activeDay]);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [focusNewSubtask, setFocusNewSubtask] = useState(false);
  const [duplicateStep, setDuplicateStep] = useState<"idle" | "picking">("idle");
  const [duplicateDays, setDuplicateDays] = useState<DayKey[]>([]);
  const [editScope, setEditScope] = useState<"all" | "occurrence">("all");
  // Recurrence: weekly (every matching weekday), interval (every N weeks), or once (single date).
  const [repeatMode, setRepeatMode] = useState<"weekly" | "interval" | "once">("weekly");
  const [intervalWeeks, setIntervalWeeks] = useState(2);
  const [onceDate, setOnceDate] = useState("");

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
      setStartTime(displayToInputTime(task.startTime));
      setEndTime(displayToInputTime(task.endTime));
      setRepeatDays(selectedDays);
      // Load per-task subtasks; fall back to plan template for tasks created before this fix
      const taskSubtasks = task.subtasks ?? linkedPlan?.items ?? [];
      setSubtasks(taskSubtasks.map(entryToSubtaskDraft));
      const r = task.recurrence;
      if (r?.type === "once") { setRepeatMode("once"); setOnceDate(r.dateISO); }
      else if (r?.type === "weekly" && r.interval > 1) { setRepeatMode("interval"); setIntervalWeeks(r.interval); setOnceDate(baseDateISO); }
      else { setRepeatMode("weekly"); setOnceDate(baseDateISO); }
    } else {
      const pid = initialPlanId ?? plans[0]?.id ?? "";
      setPlanId(pid);
      setTaskType(initialTaskType ?? "task");
      setTitle("");
      setDescription("");
      setStartTime(initialStartTime ?? "");
      setEndTime(initialEndTime ?? "");
      setRepeatDays([activeDay]);
      setSubtasks([]);
      setRepeatMode("weekly");
      setIntervalWeeks(2);
      setOnceDate(baseDateISO);
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
    setStartTime(displayToInputTime(src.startTime));
    setEndTime(displayToInputTime(src.endTime));
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
  const timeError =
    isValidInputTime(startTime) && isValidInputTime(endTime)
      ? validateTaskTime({
          title: title.trim() || "Task",
          day: activeDay,
          startTime,
          endTime,
        })
      : null;
  const repeatOk = isOccurrenceScope
    ? true
    : repeatMode === "once"
      ? !!onceDate
      : repeatDays.length > 0;
  const canSave =
    !!selectedPlan &&
    title.trim().length > 0 &&
    isValidInputTime(startTime) &&
    isValidInputTime(endTime) &&
    !timeError &&
    repeatOk;

  function handleSave() {
    if (!canSave || !selectedPlan) return;

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

    const taskDraft: Omit<Task, "id"> = {
      title: title.trim(),
      description: description.trim() || undefined,
      startTime: inputToDisplayTime(startTime),
      endTime: inputToDisplayTime(endTime),
      icon: selectedPlan.emoji,
      color: selectedPlan.color,
      planId: selectedPlan.id,
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
    };

    onSave({
      taskDraft,
      taskId: mode === "edit" ? task?.id : undefined,
      repeatDays: effectiveRepeatDays,
      // Only update the plan template if the user explicitly added subtasks
      planItems:
        mode === "create" && taskType === "task" && validSubtasks.length > 0
          ? { planId: selectedPlan.id, items: validSubtasks }
          : null,
      scope: isOccurrenceScope ? "occurrence" : "all",
      recurrence,
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
    onDuplicate({
      taskDraft: {
        title: `Copy of ${title.trim()}`,
        description: description.trim() || undefined,
        startTime: inputToDisplayTime(startTime),
        endTime: inputToDisplayTime(endTime),
        icon: selectedPlan.emoji,
        color: selectedPlan.color,
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
                <div className="grid grid-cols-2 gap-2">
                  {(["task", "session"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTaskType(type)}
                      className={`h-10 rounded-full text-[14px] font-semibold transition-colors ${
                        taskType === type
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                          : "border border-neutral-200 bg-white text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                      }`}
                    >
                      {type === "task" ? "Task" : "Session"}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {/* Plan selector */}
              {!isOccurrenceScope && (
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

              {/* Time slot + repeat days (weekday chips hidden for one-off) */}
              <TimeSlotPicker
                startTime={startTime}
                endTime={endTime}
                onStartChange={setStartTime}
                onEndChange={setEndTime}
                activeDay={activeDay}
                repeatDays={isOccurrenceScope || repeatMode === "once" ? undefined : repeatDays}
                onRepeatDaysChange={isOccurrenceScope || repeatMode === "once" ? undefined : setRepeatDays}
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

              {/* Subtasks / Session Steps */}
              {selectedPlan && !isOccurrenceScope && (
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
                  className="w-13 px-0"
                >
                  <IconCopy size={18} />
                </Button>
              )}
              {mode === "edit" && !isOccurrenceScope && onDelete && (
                <Button
                  variant="dangerSecondary"
                  onClick={() => { haptic("light"); onDelete(); }}
                  aria-label="Delete task"
                  className="w-16 px-0"
                >
                  <IconTrash size={18} />
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
          </m.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <BottomSheet
      open={isOpen}
      onClose={duplicateStep === "picking" ? () => setDuplicateStep("idle") : handleClose}
      backdropClassName={keepBackdropLight ? "bg-black/24" : undefined}
    >
      {sheetContent}
    </BottomSheet>
  );
}
