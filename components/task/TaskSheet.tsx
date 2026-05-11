"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconCheck,
  IconChevronDown,
  IconGripVertical,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import TimeSlotPicker from "@/components/TimeSlotPicker";
import type { DayKey, Plan, Task } from "@/lib/useScheduleDB";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import { accentStyles } from "@/lib/colorSystem";
import { SECTION_ICONS } from "@/components/SectionIcons";
import {
  uid,
  displayToInputTime,
  inputToDisplayTime,
  createSubtask,
} from "@/lib/taskMutations";

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
  onClose: () => void;
  onSave: (data: TaskSaveData) => void;
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

// ── Plan selector dropdown ────────────────────────────────────────────────────

interface PlanSelectorProps {
  plans: Plan[];
  selectedId: string;
  onSelect: (plan: Plan) => void;
}

function PlanSelector({ plans, selectedId, onSelect }: PlanSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = plans.find((p) => p.id === selectedId) ?? null;
  const accent = selected ? accentStyles(selected.color) : null;
  const icon = selected
    ? (SECTION_ICONS.find((i) => i.name === selected.emoji) ?? SECTION_ICONS[0]).icon
    : null;
  const Icon = icon;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (plans.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 p-5 text-center dark:border-white/10">
        <p className="text-[14px] font-semibold text-neutral-700 dark:text-neutral-300">Create a plan first</p>
        <p className="mt-1 text-[12px] text-neutral-400 dark:text-neutral-500">
          Tasks need a parent plan.
        </p>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <p className={`mb-1.5 ${SECTION_LABEL}`}>Plan</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-left transition-colors dark:border-white/10 dark:bg-white/[0.04]"
      >
        {selected && Icon && accent ? (
          <>
            <div className={`h-6 w-6 shrink-0 rounded-lg flex items-center justify-center ${accent.tint} ${accent.icon}`}>
              <Icon size={13} strokeWidth={2} />
            </div>
            <span className="flex-1 text-[14px] font-semibold text-neutral-900 dark:text-white truncate">
              {selected.title}
            </span>
          </>
        ) : (
          <span className="flex-1 text-[14px] font-medium text-neutral-400 dark:text-neutral-500">
            Select a plan…
          </span>
        )}
        <IconChevronDown
          size={16}
          strokeWidth={2}
          className={`shrink-0 text-neutral-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900"
          >
            <div className="max-h-[220px] overflow-y-auto">
              {plans.map((plan, i) => {
                const ic = SECTION_ICONS.find((s) => s.name === plan.emoji) ?? SECTION_ICONS[0];
                const PlanIcon = ic.icon;
                const pa = accentStyles(plan.color);
                const sel = selectedId === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => { onSelect(plan); setOpen(false); }}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                      i > 0 ? "border-t border-neutral-100 dark:border-white/[0.05]" : ""
                    } ${sel ? "bg-neutral-50 dark:bg-white/[0.04]" : "hover:bg-neutral-50 dark:hover:bg-white/[0.04]"}`}
                  >
                    <div className={`h-7 w-7 shrink-0 rounded-lg flex items-center justify-center ${pa.tint} ${pa.icon}`}>
                      <PlanIcon size={14} strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-neutral-900 dark:text-white truncate">
                        {plan.title}
                      </p>
                      {plan.description && (
                        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 truncate">
                          {plan.description}
                        </p>
                      )}
                    </div>
                    {sel && (
                      <div className={`h-4 w-4 shrink-0 rounded-full flex items-center justify-center ${pa.tint} ${pa.icon}`}>
                        <IconCheck size={10} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  onClose,
  onSave,
}: TaskSheetProps) {
  // ── Form state ─────────────────────────────────────────────────────────────
  const [planId, setPlanId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [repeatDays, setRepeatDays] = useState<DayKey[]>([activeDay]);
  const [subtasks, setSubtasks] = useState<SubtaskDraft[]>([]);
  const [focusNewSubtask, setFocusNewSubtask] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);

  // ── Initialise on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    if (mode === "edit" && task) {
      const linkedPlan = plans.find((p) => p.id === task.planId);
      const selectedDays = activeDays && activeDays.length > 0 ? activeDays : [activeDay];
      setPlanId(task.planId);
      setTitle(task.title);
      setDescription(task.description ?? "");
      setStartTime(displayToInputTime(task.startTime));
      setEndTime(displayToInputTime(task.endTime));
      setRepeatDays(selectedDays);
      setSubtasks(linkedPlan?.items.map(entryToSubtaskDraft) ?? []);
    } else {
      const pid = initialPlanId ?? plans[0]?.id ?? "";
      setPlanId(pid);
      setTitle("");
      setDescription("");
      setStartTime("");
      setEndTime("");
      setRepeatDays([activeDay]);
      const linkedPlan = plans.find((p) => p.id === pid);
      setSubtasks(linkedPlan?.items.map(entryToSubtaskDraft) ?? []);
    }
    setFocusNewSubtask(false);
    setTimeout(() => titleRef.current?.focus(), 80);
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── When plan changes (create mode), load its subtasks ────────────────────
  function handleSelectPlan(plan: Plan) {
    setPlanId(plan.id);
    setSubtasks(plan.items.map(entryToSubtaskDraft));
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
    };

    onSave({
      taskDraft,
      taskId: mode === "edit" ? task?.id : undefined,
      repeatDays,
      planItems:
        validSubtasks.length > 0 || subtasks.length !== (selectedPlan.items.length)
          ? { planId: selectedPlan.id, items: validSubtasks }
          : null,
    });
  }

  function handleClose() {
    onClose();
  }

  const eyebrow = mode === "create" ? "Add" : "Edit";
  const headingTitle = mode === "create" ? "New Task" : (task?.title ?? "Task");

  return (
    <BottomSheet open={isOpen} onClose={handleClose}>
      <div className="flex flex-col px-5 pb-6 pt-4">
        <SheetHeader eyebrow={eyebrow} title={headingTitle} onClose={handleClose} />

        <div className="mt-4 space-y-5">
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

          {/* Subtasks section */}
          {selectedPlan && (
            <section className="space-y-3">
              <p className={SECTION_LABEL}>Subtasks</p>

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
                Add Subtask
              </button>
            </section>
          )}
        </div>

        {/* Sticky footer */}
        <div className="mt-6 flex gap-2">
          <Button fullWidth onClick={handleSave} disabled={!canSave}>
            <IconCheck size={16} strokeWidth={2.5} />
            {mode === "create" ? "Add Task" : "Save Changes"}
          </Button>
          <Button variant="secondary" onClick={handleClose}>
            <IconX size={15} />
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
