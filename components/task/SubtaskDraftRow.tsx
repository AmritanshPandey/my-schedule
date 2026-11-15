"use client";

import { IconBarbell, IconTrendingUp, IconClock, IconCopy, IconCornerDownRight, IconGripVertical, IconTrash } from "@tabler/icons-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useState } from "react";
import IconButton from "@/components/ui/IconButton";
import { FORM_CONTROL_BASE } from "@/components/ui/Input";
import type { DeadlineScope } from "@/lib/subtaskDeadline";
import { parseDurationMinutes, formatMinutes } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";
import DateInput from "@/components/ui/DateInput";

import type { SubtaskDraft } from "@/lib/subtaskDraft";
import type { SubtaskTargets } from "@planr/core/lib/scheduleEntry";
import { hasStrengthTargets } from "@/lib/subtaskTargets";
import { DEFAULT_PROGRESSION_THRESHOLD } from "@/lib/subtaskProgression";
import type { SubtaskProgression } from "@planr/core/lib/scheduleEntry";
import { ChoiceChip } from "@/components/ui/FormChips";
import { todayISO } from "@/lib/dateUtils";

export type { SubtaskDraft };

interface SubtaskDraftRowProps {
  draft: SubtaskDraft;
  onChange: (id: string, updated: SubtaskDraft) => void;
  onDelete: (id: string) => void;
  /** Duplicate this subtask within the current task (inserts a copy below). */
  onDuplicate?: (id: string) => void;
  /** Copy this subtask into other tasks (opens a target picker). */
  onCopyToTask?: (id: string) => void;
  autoFocus?: boolean;
  showDeadline?: boolean;
}

const SCOPE_LABEL: Record<DeadlineScope, string> = { day: "Day", week: "Wk", month: "Mo" };

const ROW_INPUT =
  `${FORM_CONTROL_BASE} bg-white px-3 text-[16px] focus:bg-white dark:bg-white/[0.04] dark:focus:bg-white/[0.07]`;

function SubtaskDraftRow({
  draft,
  onChange,
  onDelete,
  onDuplicate,
  onCopyToTask,
  autoFocus,
  showDeadline,
}: SubtaskDraftRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: draft.id });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const deleteCopy = buildDeleteConfirmationCopy("subtask", {
    name: draft.title.trim() || undefined,
    description: "This subtask will be removed from the task.",
  });

  // The dedicated time field is edited as free text (so "1h 30m" can be typed)
  // but stored as canonical minutes. Local text state holds the in-progress
  // string; `timeMinutes` on the draft is the parsed value used for summing.
  const [timeText, setTimeText] = useState(() =>
    draft.timeMinutes != null ? formatMinutes(draft.timeMinutes) : ""
  );
  const timeInvalid = timeText.trim() !== "" && parseDurationMinutes(timeText) == null;
  function handleTimeChange(text: string) {
    setTimeText(text);
    const mins = parseDurationMinutes(text);
    onChange(draft.id, { ...draft, timeMinutes: mins != null && mins > 0 ? mins : undefined });
  }

  // Sets / reps / weight / rest stay tucked away until asked for — most
  // subtasks are not lifts — but open on their own once any is set.
  const [strengthOpen, setStrengthOpen] = useState(() => hasStrengthTargets(draft.targets) || draft.restSeconds != null);
  function setTarget(key: keyof SubtaskTargets, value: SubtaskTargets[keyof SubtaskTargets]) {
    onChange(draft.id, { ...draft, targets: { ...draft.targets, [key]: value } });
  }
  const numberValue = (n: number | undefined) => (n == null || Number.isNaN(n) ? "" : String(n));
  const readNumber = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    return raw.trim() === "" || !Number.isFinite(n) ? undefined : n;
  };
  const weightUnit = draft.targets?.weightUnit ?? "kg";

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
      }}
      className="group rounded-2xl border border-neutral-200 bg-neutral-50/60 p-2.5 transition-colors hover:border-neutral-300 dark:border-white/[0.08] dark:bg-white/[0.02] dark:hover:border-white/[0.14]"
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Reorder subtask"
          className="flex h-10 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg text-neutral-500 dark:text-neutral-400 transition-colors hover:text-neutral-500 active:cursor-grabbing dark:text-white/20 dark:hover:text-white"
        >
          <IconGripVertical size={14} />
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input
              autoFocus={autoFocus}
              value={draft.title ?? ""}
              onChange={(e) => onChange(draft.id, { ...draft, title: e.target.value })}
              placeholder="Name"
              aria-label="Subtask name"
              autoComplete="off"
              spellCheck
              className={`h-10 min-w-[150px] flex-[1_1_180px] font-semibold ${ROW_INPUT}`}
            />
            {/* Dedicated time — accepts only a time (min/hour); this is what
                counts toward the task's allotted-time budget. */}
            <div className="relative h-10 w-[112px] shrink-0">
              <IconClock
                size={13}
                strokeWidth={2.2}
                className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 ${
                  timeInvalid ? "text-rose-500 dark:text-rose-400" : "text-blue-500 dark:text-blue-400"
                }`}
              />
              <input
                value={timeText}
                onChange={(e) => handleTimeChange(e.target.value)}
                placeholder="15min"
                aria-label="Subtask time (minutes or hours)"
                aria-invalid={timeInvalid}
                autoComplete="off"
                inputMode="text"
                className={`h-10 w-full text-center font-bold ${ROW_INPUT} !pl-6 ${
                  timeInvalid
                    ? "text-rose-600 ring-1 ring-rose-400 dark:text-rose-400"
                    : "text-blue-600 dark:text-blue-400"
                }`}
              />
            </div>
          </div>

          {timeInvalid && (
            <p className="text-[11px] font-semibold text-rose-500 dark:text-rose-400">
              Use a time like 15min, 1h, or 1h30m.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {/* Free-text detail — a short note, quantity, or spec; whatever
                this step needs (e.g. "3 pages", "2 sets", "medium heat"). */}
            <input
              value={draft.duration ?? ""}
              onChange={(e) => onChange(draft.id, { ...draft, duration: e.target.value })}
              placeholder="Detail · optional"
              aria-label="Subtask detail"
              autoComplete="off"
              spellCheck
              className={`h-10 min-w-[120px] flex-[1_1_150px] font-semibold text-neutral-600 dark:text-neutral-300 ${ROW_INPUT}`}
            />
            <input
              value={draft.info ?? ""}
              onChange={(e) => onChange(draft.id, { ...draft, info: e.target.value })}
              placeholder="Info"
              aria-label="Subtask info"
              autoComplete="off"
              spellCheck
              className={`h-10 min-w-[120px] flex-[1_1_150px] text-neutral-600 dark:text-neutral-300 ${ROW_INPUT}`}
            />
            {showDeadline && (
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <DateInput
                  value={draft.deadline ?? ""}
                  onChange={(v) =>
                    onChange(draft.id, {
                      ...draft,
                      deadline: v || undefined,
                      deadlineScope: v ? draft.deadlineScope ?? "day" : undefined,
                    })}
                  ariaLabel="Subtask deadline date"
                  size="sm"
                  className="w-[150px] shrink-0"
                />
                {draft.deadline && (
                  <div className="flex shrink-0 gap-1">
                    {(["day", "week", "month"] as const).map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => onChange(draft.id, { ...draft, deadlineScope: scope })}
                        aria-pressed={(draft.deadlineScope ?? "day") === scope}
                        className={`h-11 rounded-xl px-3 text-[14px] font-semibold transition-colors lg:h-9 lg:text-[12px] ${
                          (draft.deadlineScope ?? "day") === scope
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                            : "border border-neutral-200 text-neutral-700 hover:text-neutral-900 dark:border-white/10 dark:text-neutral-200 dark:hover:text-white"
                        }`}
                      >
                        {SCOPE_LABEL[scope]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {strengthOpen ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StrengthField label="Sets" value={numberValue(draft.targets?.sets)} placeholder="3" inputMode="numeric"
                onChange={(raw) => setTarget("sets", readNumber(raw))} />
              <StrengthField label="Reps" value={numberValue(draft.targets?.reps)} placeholder="10" inputMode="numeric"
                onChange={(raw) => setTarget("reps", readNumber(raw))} />
              <StrengthField
                label="Weight"
                value={numberValue(draft.targets?.weight)}
                placeholder="0"
                inputMode="decimal"
                onChange={(raw) => setTarget("weight", readNumber(raw))}
                suffix={
                  <button
                    type="button"
                    onClick={() => setTarget("weightUnit", weightUnit === "kg" ? "lb" : "kg")}
                    aria-label={`Weight unit: ${weightUnit}. Switch to ${weightUnit === "kg" ? "lb" : "kg"}`}
                    className="flex h-11 min-w-11 items-center justify-center rounded-r-xl px-2 text-[14px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                  >
                    {weightUnit}
                  </button>
                }
              />
              <StrengthField
                label="Rest"
                value={numberValue(draft.restSeconds)}
                placeholder="90"
                inputMode="numeric"
                onChange={(raw) => onChange(draft.id, { ...draft, restSeconds: readNumber(raw) })}
                suffix={<span className="pr-3 text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">s</span>}
              />
              <div className="col-span-2 sm:col-span-4">
                <ProgressionFields
                  value={draft.progression}
                  onChange={(progression) => onChange(draft.id, { ...draft, progression })}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setStrengthOpen(true)}
              className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/[0.06] dark:hover:text-white lg:h-9 lg:text-[13px]"
            >
              <IconBarbell size={16} strokeWidth={2} aria-hidden="true" />
              Sets &amp; weight
            </button>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-0.5">
          {onDuplicate && (
            <IconButton
              label="Duplicate subtask"
              variant="ghost"
              size="sm"
              onClick={() => { haptic("light"); onDuplicate(draft.id); }}
            >
              <IconCopy size={15} />
            </IconButton>
          )}
          {onCopyToTask && (
            <IconButton
              label="Copy subtask to another task"
              variant="ghost"
              size="sm"
              onClick={() => { haptic("light"); onCopyToTask(draft.id); }}
            >
              <IconCornerDownRight size={15} />
            </IconButton>
          )}
          <IconButton
            label="Delete subtask"
            variant="destructive"
            size="sm"
            onClick={() => { haptic("light"); setDeleteOpen(true); }}
          >
            <IconTrash size={15} />
          </IconButton>
        </div>
      </div>

      <ConfirmSheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          onDelete(draft.id);
          setDeleteOpen(false);
        }}
        title={deleteCopy.title}
        description={deleteCopy.description}
        confirmLabel={deleteCopy.confirmLabel}
      />
    </div>
  );
}

const CADENCES = [
  { value: "daily", label: "Day" },
  { value: "weekly", label: "Week" },
  { value: "monthly", label: "Month" },
  { value: "yearly", label: "Year" },
] as const;
const FIGURES = [
  { value: "all", label: "All" },
  { value: "weight", label: "Weight" },
  { value: "reps", label: "Reps" },
  { value: "sets", label: "Sets" },
  { value: "minutes", label: "Minutes" },
] as const;

/**
 * "Increase over time": a percentage, how often, which figure, and how
 * consistent the user must be first (default 80%). Off until asked for.
 */
function ProgressionFields({ value, onChange }: { value: SubtaskProgression | undefined; onChange: (next: SubtaskProgression | undefined) => void }) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => onChange({ percent: 5, cadence: "weekly", figure: "all", threshold: DEFAULT_PROGRESSION_THRESHOLD, startISO: todayISO() })}
        className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-white/[0.06] dark:hover:text-white lg:h-9 lg:text-[13px]"
      >
        <IconTrendingUp size={16} strokeWidth={2} aria-hidden="true" />
        Increase over time
      </button>
    );
  }
  const set = (patch: Partial<SubtaskProgression>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3 rounded-xl bg-white/70 p-3 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-bold text-neutral-900 dark:text-white">Increase over time</span>
        <button type="button" onClick={() => onChange(undefined)} className="h-11 px-2 text-[14px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white lg:h-9 lg:text-[13px]">
          Turn off
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StrengthField
          label="Increase by"
          value={String(value.percent)}
          placeholder="5"
          inputMode="decimal"
          onChange={(raw) => { const n = Number(raw.replace(",", ".")); if (Number.isFinite(n) && n > 0 && n <= 100) set({ percent: n }); }}
          suffix={<span className="pr-3 text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">%</span>}
        />
        <StrengthField
          label="When done at least"
          value={String(value.threshold)}
          placeholder="80"
          inputMode="numeric"
          onChange={(raw) => { const n = Number(raw); if (Number.isFinite(n) && n >= 1 && n <= 100) set({ threshold: Math.round(n) }); }}
          suffix={<span className="pr-3 text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">%</span>}
        />
      </div>
      <div>
        <span className="mb-1 block text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Every</span>
        <div className="flex flex-wrap gap-2">
          {CADENCES.map((c) => (
            <ChoiceChip key={c.value} active={value.cadence === c.value} label={c.label} onClick={() => set({ cadence: c.value })} />
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1 block text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Raise</span>
        <div className="flex flex-wrap gap-2">
          {FIGURES.map((f) => (
            <ChoiceChip key={f.value} active={value.figure === f.value} label={f.label} onClick={() => set({ figure: f.value })} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** A labelled number field: the label above it, the number pad on phones. */
function StrengthField({
  label,
  value,
  placeholder,
  inputMode,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  placeholder: string;
  inputMode: "numeric" | "decimal";
  onChange: (raw: string) => void;
  suffix?: React.ReactNode;
}) {
  // Local text so a half-typed "22." keeps its point; the draft gets the number.
  const [text, setText] = useState(value);
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</span>
      <span className={`flex h-11 items-center ${ROW_INPUT} !px-0 focus-within:border-emerald-600/60 dark:focus-within:border-emerald-400/50`}>
        <input
          type="text"
          inputMode={inputMode}
          pattern={inputMode === "numeric" ? "[0-9]*" : undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          aria-label={label}
          autoComplete="off"
          className="h-full w-full min-w-0 bg-transparent px-3 text-[16px] font-semibold tabular-nums text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white"
        />
        {suffix}
      </span>
    </label>
  );
}

export default memo(SubtaskDraftRow);
