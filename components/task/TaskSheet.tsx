"use client";

import { useEffect, useRef, useState } from "react";
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
import Input from "@/components/ui/Input";
import TimeSlotPicker from "@/components/TimeSlotPicker";
import { haptic } from "@/lib/haptics";
import type { DayKey, Plan, Task } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
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

  const titleRef = useRef<HTMLInputElement>(null);

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

  function updateSubtask(id: string, updated: SubtaskDraft) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  function removeSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  const subtaskSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

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
  const canSave =
    !!selectedPlan &&
    title.trim().length > 0 &&
    isValidInputTime(startTime) &&
    isValidInputTime(endTime) &&
    !timeError &&
    repeatDays.length > 0;

  function handleSave() {
    if (!canSave || !selectedPlan) return;

    const validSubtasks = subtasks
      .filter((s) => s.title.trim().length > 0)
      .map(subtaskDraftToEntry);

    const taskDraft: Omit<Task, "id"> = {
      title: title.trim(),
      description: description.trim() || undefined,
      startTime: inputToDisplayTime(startTime),
      endTime: inputToDisplayTime(endTime),
      icon: selectedPlan.emoji,
      color: selectedPlan.color,
      planId: selectedPlan.id,
      taskType,
      // Store subtasks on the task itself so each task has an independent list
      subtasks: validSubtasks.length > 0 ? validSubtasks : undefined,
    };

    onSave({
      taskDraft,
      taskId: mode === "edit" ? task?.id : undefined,
      repeatDays,
      // Only update the plan template if the user explicitly added subtasks
      planItems:
        mode === "create" && taskType === "task" && validSubtasks.length > 0
          ? { planId: selectedPlan.id, items: validSubtasks }
          : null,
      scope: isOccurrenceScope ? "occurrence" : "all",
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

  const eyebrow = mode === "create" ? "Add" : "Edit";
  const headingTitle = mode === "create" ? "New Task" : (task?.title ?? "Task");

  return (
    <BottomSheet
      open={isOpen}
      onClose={duplicateStep === "picking" ? () => setDuplicateStep("idle") : handleClose}
      backdropClassName={keepBackdropLight ? "bg-black/24 backdrop-blur-[1px]" : undefined}
    >
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
            className="flex flex-col px-5 pb-6 pt-4"
          >
            <SheetHeader eyebrow={eyebrow} title={headingTitle} onClose={handleClose} />

            <div className="mt-4 space-y-5">
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
                        className={`h-10 rounded-xl text-[14px] font-semibold transition-colors ${
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
                      className={`h-10 rounded-xl text-[14px] font-semibold transition-colors ${
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
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />

              {/* Description */}
              <Input
                label="Note (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short note or context…"
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />

              {/* Time slot + repeat days */}
              <TimeSlotPicker
                startTime={startTime}
                endTime={endTime}
                onStartChange={setStartTime}
                onEndChange={setEndTime}
                activeDay={activeDay}
                repeatDays={isOccurrenceScope ? undefined : repeatDays}
                onRepeatDaysChange={isOccurrenceScope ? undefined : setRepeatDays}
              />
              {timeError && (
                <p className="-mt-3 text-[12px] font-semibold text-rose-500 dark:text-rose-400">
                  {timeError.message}
                </p>
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
                    <SortableContext items={subtasks.map((s) => s.id)} strategy={verticalListSortingStrategy}>
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
                            onChange={(updated) => updateSubtask(s.id, updated)}
                            onDelete={() => removeSubtask(s.id)}
                          />
                        </m.div>
                      ))}
                    </SortableContext>
                  </DndContext>

                  <button
                    type="button"
                    onClick={addSubtask}
                    className="flex h-10 w-full items-center gap-2 rounded-xl border border-dashed border-neutral-200 px-3 text-[13px] font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600 dark:border-white/10 dark:text-neutral-500 dark:hover:border-white/20 dark:hover:text-neutral-300"
                  >
                    <IconPlus size={14} strokeWidth={2.5} />
                    {taskType === "session" ? "Add Step" : "Add Subtask"}
                  </button>
                </section>
              )}
            </div>

            {/* Footer */}
            <div className="mt-6 space-y-2">
              <div className="flex gap-2">
                <Button fullWidth onClick={handleSave} disabled={!canSave}>
                  <IconCheck size={16} strokeWidth={2.5} />
                  {mode === "create" ? "Add Task" : isOccurrenceScope ? "Save this day" : "Save Changes"}
                </Button>
                <Button variant="secondary" onClick={handleClose}>
                  <IconX size={15} />
                </Button>
              </div>
              {mode === "edit" && !isOccurrenceScope && (onDuplicate || onDelete) && (
                <div className={`grid gap-2 ${onDuplicate && onDelete ? "grid-cols-2" : "grid-cols-1"}`}>
                  {onDuplicate && (
                    <Button variant="secondary" fullWidth onClick={openDuplicatePicker} disabled={!canSave}>
                      <IconCopy size={15} />
                      Duplicate
                    </Button>
                  )}
                  {onDelete && (
                    <Button
                      variant="dangerSecondary"
                      fullWidth
                      onClick={() => { haptic("light"); onDelete(); }}
                    >
                      <IconTrash size={15} />
                      Delete
                    </Button>
                  )}
                </div>
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
    </BottomSheet>
  );
}
