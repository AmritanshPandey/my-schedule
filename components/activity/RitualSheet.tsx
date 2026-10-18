"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconPlus, IconX, IconClock } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import { typography } from "@/components/ui/Typography";
import Button from "@/components/ui/Button";
import type { Ritual, RitualColor, RitualRecurrenceKind, RitualStep, RitualTrackingType, DayKey } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS, RITUAL_COLORS } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import { uid } from "@/lib/id";
import TimeInput from "@/components/ui/TimeInput";
import { formatDisplayTime } from "@/lib/timeUtils";
import { RITUAL_COLOR_DOT, RITUAL_COLOR_SELECT_RING } from "@/lib/ritualColors";
import { ROUTINE_TEMPLATES, type RoutineTemplateKey } from "@/lib/routineTemplates";
import { recurrenceToRepeatDays, repeatDaysToRecurrence } from "@/lib/ritualRecurrence";
import { iconGlyph, SECTION_ICONS } from "@/components/SectionIcons";

const DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60];

// Every routine is marked done with one tap; this only shapes the detail it
// carries — an amount to aim for, steps to tick, several times a day.
const TRACKING_TYPES: { key: RitualTrackingType; label: string }[] = [
  { key: "checkbox", label: "Just mark done" },
  { key: "quantity", label: "Amount" },
  { key: "duration", label: "Minutes" },
  { key: "count", label: "Count" },
  { key: "checklist", label: "Checklist" },
];

const RECURRENCE_KINDS: { key: RitualRecurrenceKind; label: string }[] = [
  { key: "daily", label: "Every day" },
  { key: "weekdays", label: "Weekdays" },
  { key: "weekends", label: "Weekends" },
  { key: "custom", label: "Custom" },
  { key: "interval", label: "Every N days" },
];

interface RitualSheetProps {
  open: boolean;
  onClose: () => void;
  initial?: Ritual;
  onSave: (data: Omit<Ritual, "id">) => void;
  onDelete?: () => void;
}

export function RitualSheet({ open, onClose, initial, onSave, onDelete }: RitualSheetProps) {
  const isEdit = !!initial;

  const [template, setTemplate] = useState<RoutineTemplateKey | null>(null);

  const [title, setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime]         = useState("08:00");
  // A routine is something to stay on track with, not an appointment — new
  // ones start without a time; setting one is a deliberate choice.
  const [anyTime, setAnyTime]   = useState(true);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [color, setColor]       = useState<RitualColor | "">("");
  const [icon, setIcon]         = useState<string>("");
  const [notes, setNotes]       = useState("");

  const [recurrenceKind, setRecurrenceKind] = useState<RitualRecurrenceKind>("daily");
  const [customDays, setCustomDays]         = useState<DayKey[]>([]);
  const [intervalDays, setIntervalDays]     = useState(2);

  const [trackingType, setTrackingType] = useState<RitualTrackingType>("checkbox");
  const [target, setTarget]     = useState<string>("");
  const [unit, setUnit]         = useState("");
  const [steps, setSteps]       = useState<RitualStep[]>([]);
  const [newStepLabel, setNewStepLabel] = useState("");
  /** A time attached to the next descriptive item ("Lunch" at 13:00), if any. */
  const [newItemTimed, setNewItemTimed] = useState(false);
  const [newItemTime, setNewItemTime] = useState("13:00");

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Reset/pre-fill when sheet opens.
  useEffect(() => {
    if (!open) return;
    setTemplate(isEdit ? "custom" : null);
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setTime(initial?.time ?? "08:00");
    setAnyTime(initial ? !!initial.anyTime : true);
    setDuration(initial?.duration);
    setColor(initial?.color ?? "");
    setIcon(initial?.icon ?? "");
    setNotes(initial?.notes ?? "");
    const recurrence = initial?.recurrence ?? repeatDaysToRecurrence(initial?.repeatDays);
    setRecurrenceKind(recurrence.kind);
    setCustomDays(recurrence.days ?? initial?.repeatDays ?? []);
    setIntervalDays(recurrence.intervalDays ?? 2);
    setTrackingType(initial?.trackingType ?? "checkbox");
    setTarget(initial?.target !== undefined ? String(initial.target) : "");
    setUnit(initial?.unit ?? "");
    setSteps(initial?.steps ?? []);
    setNewStepLabel("");
    setNewItemTimed(false);
    setShowAdvanced(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyTemplate(key: RoutineTemplateKey) {
    setTemplate(key);
    const tpl = ROUTINE_TEMPLATES.find((t) => t.key === key);
    if (!tpl || key === "custom") return;
    const d = tpl.defaults;
    if (d.title !== undefined) setTitle(d.title);
    if (d.time !== undefined) setTime(d.time);
    setAnyTime(d.time === undefined || !!d.anyTime);
    setColor(tpl.color ?? "");
    setIcon(tpl.icon);
    setTrackingType(d.trackingType ?? "checkbox");
    setTarget(d.target !== undefined ? String(d.target) : "");
    setUnit(d.unit ?? "");
    setSteps(d.steps ? d.steps.map((s) => ({ ...s, id: uid() })) : []);
    const recurrence = d.recurrence ?? { kind: "daily" as const };
    setRecurrenceKind(recurrence.kind);
    setCustomDays(recurrence.days ?? []);
  }

  const canSave =
    !!title.trim() &&
    !!time &&
    (trackingType !== "checklist" || steps.length > 0) &&
    (recurrenceKind !== "custom" || customDays.length > 0);

  function addStep() {
    const label = newStepLabel.trim();
    if (!label) return;
    const timed = newItemTimed && !!newItemTime;
    setSteps((prev) => [...prev, timed ? { id: uid(), label, time: newItemTime } : { id: uid(), label }]);
    setNewStepLabel("");
    setNewItemTimed(false);
  }

  function handleSave() {
    if (!canSave) return;
    haptic("medium");
    const recurrence =
      recurrenceKind === "custom" ? { kind: "custom" as const, days: customDays }
      : recurrenceKind === "interval" ? { kind: "interval" as const, intervalDays, anchorDate: initial?.recurrence?.anchorDate }
      : { kind: recurrenceKind };
    const repeatDays = recurrenceToRepeatDays(recurrence);
    const parsedTarget = parseFloat(target);
    // "times" derives its schedule-wide `time` from the earliest occurrence
    // (steps are kept sorted ascending) — every reader that only knows about
    // a single `ritual.time` (reminders, sort order, the non-"times" secondary
    // line) still sees a sensible value, the same "first slot mirrors the
    // whole-thing field" convention Task.slots/startTime already uses.
    const measured = trackingType === "quantity" || trackingType === "duration" || trackingType === "count";
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      time,
      anyTime,
      duration: duration ?? undefined,
      color: color || undefined,
      icon: icon || undefined,
      repeatDays,
      recurrence,
      notes: notes.trim() || undefined,
      sortOrder: initial?.sortOrder,
      trackingType: trackingType === "checkbox" ? undefined : trackingType,
      target: measured && Number.isFinite(parsedTarget) && parsedTarget > 0
        ? parsedTarget
        : undefined,
      unit: unit.trim() || undefined,
      // checklist/times: steps drive per-item ticks. Every other type: steps
      // are an optional, purely descriptive list — the meals of a diet, what
      // a protein target is made of (undefined when empty, same as every
      // other optional field, rather than saving `[]`). A "times" step's
      // label already is its time, so an item time never carries over to it.
      steps: trackingType === "checklist" ? steps : steps.length > 0 ? steps : undefined,
    });
    onClose();
  }

  function handleClose() {
    onClose();
  }

  const showTemplatePicker = !isEdit && template === null;
  const needsTargetUnit = trackingType === "quantity" || trackingType === "duration" || trackingType === "count";

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <div className="px-5 pb-6 pt-2">
        {showTemplatePicker ? (
          <div className="space-y-4">
            <SheetHeader eyebrow="Add routine" title="What do you want to track?" onClose={handleClose} />
            <div className="grid grid-cols-2 gap-2.5">
              {ROUTINE_TEMPLATES.map((tpl) => {
                const Glyph = iconGlyph(tpl.icon);
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => { haptic("light"); applyTemplate(tpl.key); }}
                    className="flex flex-col items-start gap-2 rounded-2xl border border-neutral-200 bg-white p-3.5 text-left transition-colors hover:border-neutral-300 dark:border-white/[0.08] dark:bg-neutral-900 dark:hover:border-white/20"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 dark:bg-white/[0.06]">
                      <Glyph size={17} strokeWidth={1.9} className="text-neutral-500 dark:text-neutral-300" />
                    </span>
                    <span className="text-[13px] font-bold text-neutral-900 dark:text-white">{tpl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <SheetHeader
              eyebrow={isEdit ? "Edit routine" : "New routine"}
              title={title || "New routine"}
              onClose={handleClose}
            />

            <div className="mt-4 space-y-5">
              {/* ── Basic ──────────────────────────────────────────────────── */}
              <div className="space-y-3">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
                  placeholder="e.g. Skin care, Vitamins, Stretch…"
                  autoFocus={!isEdit}
                  className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[16px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
                />

                {/* Icon picker */}
                <div>
                  <p className={`mb-2 ${typography.eyebrow}`}>Icon</p>
                  <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {SECTION_ICONS.map(({ name, icon: Glyph }) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setIcon((prev) => (prev === name ? "" : name))}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                          icon === name
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                            : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-400 dark:hover:bg-white/[0.10]"
                        }`}
                      >
                        <Glyph size={16} strokeWidth={1.9} />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color */}
                <div>
                  <p className={`mb-2 ${typography.eyebrow}`}>Color</p>
                  <div className="flex items-center gap-2.5">
                    {RITUAL_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor((prev) => (prev === c ? "" : c))}
                        className={`h-7 w-7 rounded-full transition-all ${RITUAL_COLOR_DOT[c]} ${
                          color === c
                            ? `ring-2 ring-offset-2 ${RITUAL_COLOR_SELECT_RING[c]} dark:ring-offset-neutral-900`
                            : "opacity-50 hover:opacity-90"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Schedule ───────────────────────────────────────────────── */}
              <div className="space-y-3 border-t border-neutral-100 pt-4 dark:border-white/[0.06]">
                <p className={typography.eyebrow}>Schedule</p>

                <div className="flex flex-wrap gap-2">
                  {RECURRENCE_KINDS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => setRecurrenceKind(r.key)}
                      className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                        recurrenceKind === r.key
                          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                          : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                {recurrenceKind === "custom" && (
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => {
                      const sel = customDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => setCustomDays((prev) => sel ? prev.filter((x) => x !== day) : [...prev, day])}
                          className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                            sel
                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                              : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                          }`}
                        >
                          {DAY_LABELS[day]}
                        </button>
                      );
                    })}
                  </div>
                )}

                {recurrenceKind === "interval" && (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-neutral-500 dark:text-neutral-400">Every</span>
                    <input
                      type="number"
                      min={2}
                      value={intervalDays}
                      onChange={(e) => setIntervalDays(Math.max(2, parseInt(e.target.value, 10) || 2))}
                      className="h-9 w-16 rounded-xl border border-neutral-200 bg-neutral-50 px-2 text-center text-[14px] font-semibold text-neutral-900 outline-none dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                    />
                    <span className="text-[13px] text-neutral-500 dark:text-neutral-400">days</span>
                  </div>
                )}

                <div className="space-y-2">
                    <div role="radiogroup" aria-label="When" className="grid grid-cols-2 gap-2">
                      {[{ key: true, label: "Any time" }, { key: false, label: "At a set time" }].map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          role="radio"
                          aria-checked={anyTime === opt.key}
                          onClick={() => setAnyTime(opt.key)}
                          className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition-colors ${
                            anyTime === opt.key
                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                              : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-300"
                          }`}
                        >
                          {!opt.key && <IconClock size={13} strokeWidth={2.2} />}
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {!anyTime && (
                      <TimeInput label="Time" value={time} onChange={setTime} ariaLabel="Routine time" />
                    )}
                  </div>
              </div>

              {/* ── Tracking ───────────────────────────────────────────────── */}
              <div className="space-y-3 border-t border-neutral-100 pt-4 dark:border-white/[0.06]">
                <p className={typography.eyebrow}>Details</p>
                <p className="-mt-1 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                  You&apos;ll mark it done with one tap and say how closely you followed it. This just shapes what it shows.
                </p>
                <div className="flex flex-wrap gap-2">
                  {TRACKING_TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTrackingType(t.key)}
                      className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                        trackingType === t.key
                          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                          : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {needsTargetUnit && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                      placeholder="Goal"
                      className="h-10 w-24 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-semibold text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600"
                    />
                    <input
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="Unit (ml, min, reps…)"
                      className="h-10 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600"
                    />
                  </div>
                )}

                {/* Checklist: each item is its own checkbox, and the routine
                    counts done once every item is. Times: same as checklist,
                    but each item is an occurrence time rather than a label —
                    a routine that happens several times a day instead of once.
                    Checkbox: items are a reference list only — completing the
                    routine is still one tap, the list just shows what it
                    bundles (e.g. "Hair" ⇒ coconut oil, shampoo, conditioner)
                    without asking you to check off each one separately. */}
                <div className="space-y-1.5">
                    {trackingType !== "checklist" && (
                      <p className="text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
                        Optional — what it covers, with a time if it has one (e.g. &ldquo;Lunch: dal, rice, salad&rdquo; at 1:00 PM). One tap on the routine covers all of them.
                      </p>
                    )}
                    {steps.map((step) => (
                      <div key={step.id} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                        {step.time && (
                          <span className="shrink-0 text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{formatDisplayTime(step.time)}</span>
                        )}
                        <span className="flex-1 truncate text-[13px] font-medium tabular-nums text-neutral-800 dark:text-neutral-100">
                          {step.label}
                        </span>
                        <button type="button" onClick={() => setSteps((prev) => prev.filter((s) => s.id !== step.id))} aria-label="Remove item" className="text-neutral-500 dark:text-neutral-400 hover:text-rose-500">
                          <IconX size={14} strokeWidth={2.2} />
                        </button>
                      </div>
                    ))}
                    {(
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          value={newStepLabel}
                          onChange={(e) => setNewStepLabel(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStep(); } }}
                          placeholder={trackingType === "checklist" ? "Add a step…" : "Add a detail…"}
                          aria-label={trackingType === "checklist" ? "New step" : "New detail"}
                          className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[14px] text-neutral-900 outline-none placeholder:text-neutral-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-400"
                        />
                        <button
                          type="button"
                          onClick={() => setNewItemTimed((v) => !v)}
                          aria-pressed={newItemTimed}
                          aria-label={newItemTimed ? "Remove time from this item" : "Add a time to this item"}
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors ${
                            newItemTimed
                              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                              : "border-neutral-200 text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-400"
                          }`}
                        >
                          <IconClock size={15} strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          onClick={addStep}
                          disabled={!newStepLabel.trim()}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40 dark:border-white/10 dark:text-neutral-400"
                          aria-label="Add item"
                        >
                          <IconPlus size={14} strokeWidth={2.4} />
                        </button>
                      </div>
                      {newItemTimed && (
                        <TimeInput value={newItemTime} onChange={setNewItemTime} ariaLabel="Time for this item" />
                      )}
                    </div>
                    )}
                </div>
              </div>

              {/* ── Advanced (progressive disclosure) ─────────────────────── */}
              <div className="border-t border-neutral-100 pt-4 dark:border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-[12px] font-semibold text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-700 dark:text-neutral-400 dark:decoration-neutral-600"
                >
                  {showAdvanced ? "Hide advanced options" : "Show advanced options"}
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <p className={`mb-1.5 ${typography.eyebrow}`}>Description <span className="normal-case font-normal text-neutral-500 dark:text-neutral-400">(optional)</span></p>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="A short subtitle"
                        className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600"
                      />
                    </div>

                    <div>
                      <p className={`mb-2 ${typography.eyebrow}`}>Typical duration <span className="normal-case font-normal text-neutral-500 dark:text-neutral-400">(optional, display only)</span></p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDuration(undefined)}
                          className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                            duration === undefined
                              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                              : "border border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-400"
                          }`}
                        >
                          None
                        </button>
                        {DURATION_PRESETS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDuration((prev) => prev === d ? undefined : d)}
                            className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                              duration === d
                                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                                : "border border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-400"
                            }`}
                          >
                            {d}m
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className={`mb-1.5 ${typography.eyebrow}`}>Notes <span className="normal-case font-normal text-neutral-500 dark:text-neutral-400">(optional)</span></p>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any notes or reminders…"
                        rows={2}
                        className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-700 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-[16px] font-bold text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-950"
              >
                {isEdit ? <IconCheck size={16} strokeWidth={2.5} /> : <IconPlus size={16} strokeWidth={2.5} />}
                {isEdit ? "Save routine" : "Add routine"}
              </button>

              {isEdit && onDelete && (
                <Button
                  variant="dangerSecondary"
                  fullWidth
                  onClick={() => { haptic("light"); onDelete(); onClose(); }}
                >
                  Delete routine
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
