"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconGripVertical,
  IconPlus,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { streamGenerateSubtasks, parseGeneratedSubtasks } from "@/lib/aiActions";
import AIActionSheet, { type ResultItem } from "@/components/ai/AIActionSheet";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import TimeSlotPicker from "@/components/TimeSlotPicker";
import type { DayKey, Plan, Task } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS } from "@/lib/useScheduleDB";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import {
  uid,
  displayToInputTime,
  inputToDisplayTime,
  createSubtask,
} from "@/lib/taskMutations";
import { PlanSelector } from "./PlanSelector";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskSaveData {
  taskDraft: Omit<Task, "id">;
  taskId?: string;          // only present in edit mode
  repeatDays: DayKey[];
  planItems: {
    planId: string;
    items: ScheduleEntry[];
  } | null;
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
  ollamaUrl?: string;
  ollamaModel?: string;
  onClose: () => void;
  onSave: (data: TaskSaveData) => void;
  onDuplicate?: (data: TaskSaveData) => void;
}

// ── Local subtask draft ───────────────────────────────────────────────────────

interface SubtaskDraft {
  id: string;
  title: string;
  duration: string;
}

function entryToSubtaskDraft(e: ScheduleEntry): SubtaskDraft {
  return {
    id: e.id,
    title: e.task,
    duration: e.duration ?? "",
  };
}

function subtaskDraftToEntry(d: SubtaskDraft): ScheduleEntry {
  return {
    id: d.id,
    task: d.title.trim(),
    duration: d.duration.trim() || undefined,
  };
}

// ── Label style (shared with TimeSlotPicker) ─────────────────────────────────

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

function isValidInputTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// ── Subtask row ───────────────────────────────────────────────────────────────

interface SubtaskRowProps {
  draft: SubtaskDraft;
  onChange: (updated: SubtaskDraft) => void;
  onDelete: () => void;
  autoFocus?: boolean;
}

function SubtaskRow({ draft, onChange, onDelete, autoFocus }: SubtaskRowProps) {
  return (
    <div className="flex items-center gap-2 group">
      <IconGripVertical
        size={14}
        className="shrink-0 text-neutral-300 dark:text-white/20"
      />
      <input
        autoFocus={autoFocus}
        value={draft.title}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        placeholder="Subtask title"
        className="h-10 flex-1 min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
      />
      <input
        value={draft.duration}
        onChange={(e) => onChange({ ...draft, duration: e.target.value })}
        placeholder="5min"
        className="h-10 w-[72px] shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-center text-[13px] font-semibold text-neutral-700 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
      />
      <button
        type="button"
        onClick={onDelete}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-300 transition-colors hover:text-rose-500 dark:text-white/20 dark:hover:text-rose-400"
      >
        <IconTrash size={15} />
      </button>
    </div>
  );
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
  ollamaUrl,
  ollamaModel,
  onClose,
  onSave,
  onDuplicate,
}: TaskSheetProps) {
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

  const titleRef = useRef<HTMLInputElement>(null);

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
      setStartTime("");
      setEndTime("");
      setRepeatDays([activeDay]);
      setSubtasks([]);
    }
    setFocusNewSubtask(false);
    setDuplicateStep("idle");
    setTimeout(() => titleRef.current?.focus(), 80);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectPlan(plan: Plan) {
    setPlanId(plan.id);
    if (mode === "create") setSubtasks([]);
  }

  // ── Subtask management ─────────────────────────────────────────────────────
  function addSubtask() {
    setSubtasks((prev) => [...prev, { id: uid(), title: "", duration: "" }]);
    setFocusNewSubtask(true);
  }

  function updateSubtask(id: string, updated: SubtaskDraft) {
    setSubtasks((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  function removeSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  async function* subtaskStream(goal: string, picks: string[]): AsyncGenerator<string> {
    if (!ollamaUrl || !ollamaModel || !title.trim()) return;
    const hints = [goal.trim(), ...picks].filter(Boolean).join(". ");
    yield* streamGenerateSubtasks(
      ollamaUrl,
      ollamaModel,
      hints ? `${title.trim()} — ${hints}` : title.trim(),
      selectedPlan?.title,
    );
  }

  function parseSubtaskResults(raw: string): ResultItem[] {
    return parseGeneratedSubtasks(raw).map((s, i) => ({ id: String(i), label: s }));
  }

  function commitSubtasks(items: ResultItem[]) {
    setSubtasks((prev) => [
      ...prev,
      ...items.map((r) => ({ id: uid(), title: r.label, duration: "" })),
    ]);
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const selectedPlan = plans.find((p) => p.id === planId) ?? null;
  const canSave =
    !!selectedPlan &&
    title.trim().length > 0 &&
    isValidInputTime(startTime) &&
    isValidInputTime(endTime) &&
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
    <BottomSheet open={isOpen} onClose={duplicateStep === "picking" ? () => setDuplicateStep("idle") : handleClose}>
      <AnimatePresence mode="wait" initial={false}>

        {/* ── Duplicate day-picker ─────────────────────────────────────────── */}
        {duplicateStep === "picking" && (
          <motion.div
            key="picker"
            initial={{ opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 32 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col px-5 pb-6 pt-4"
          >
            {/* Header */}
            <div className="mb-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDuplicateStep("idle")}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300"
              >
                <IconArrowLeft size={18} strokeWidth={2} />
              </button>
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
          </motion.div>
        )}

        {/* ── Main form ───────────────────────────────────────────────────── */}
        {duplicateStep === "idle" && (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: -32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -32 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col px-5 pb-6 pt-4"
          >
            <SheetHeader eyebrow={eyebrow} title={headingTitle} onClose={handleClose} />

            <div className="mt-4 space-y-5">
              {/* Task type toggle */}
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

              {/* Plan selector */}
              <PlanSelector
                plans={plans}
                selectedId={planId}
                onSelect={handleSelectPlan}
              />

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
                repeatDays={repeatDays}
                onRepeatDaysChange={setRepeatDays}
              />

              {/* Subtasks / Session Steps */}
              {selectedPlan && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className={SECTION_LABEL}>
                      {taskType === "session" ? "Session Steps" : "Subtasks"}
                    </p>
                    {ollamaUrl && ollamaModel && title.trim().length > 0 && (
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

                  <AnimatePresence initial={false}>
                    {subtasks.map((s, i) => (
                      <motion.div
                        key={s.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18, ease: "easeInOut" }}
                        style={{ overflow: "hidden" }}
                      >
                        <SubtaskRow
                          draft={s}
                          autoFocus={focusNewSubtask && i === subtasks.length - 1}
                          onChange={(updated) => updateSubtask(s.id, updated)}
                          onDelete={() => removeSubtask(s.id)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>

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
                  {mode === "create" ? "Add Task" : "Save Changes"}
                </Button>
                <Button variant="secondary" onClick={handleClose}>
                  <IconX size={15} />
                </Button>
              </div>
              {mode === "edit" && onDuplicate && (
                <Button variant="secondary" fullWidth onClick={openDuplicatePicker} disabled={!canSave}>
                  <IconCopy size={15} />
                  Duplicate
                </Button>
              )}
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* AI expand subtasks sheet */}
      {ollamaUrl && ollamaModel && (
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
