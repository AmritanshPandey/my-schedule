"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { SheetTitle, typography } from "@/components/ui/Typography";
import Button from "@/components/ui/Button";
import type { Ritual, RitualColor, DayKey } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS, RITUAL_COLORS } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";

const COLOR_DOT: Record<RitualColor, string> = {
  rose:    "bg-rose-400",
  sky:     "bg-sky-400",
  violet:  "bg-violet-400",
  amber:   "bg-amber-400",
  emerald: "bg-emerald-400",
  fuchsia: "bg-fuchsia-400",
  orange:  "bg-orange-400",
  cyan:    "bg-cyan-400",
  indigo:  "bg-indigo-400",
  teal:    "bg-teal-400",
};

const COLOR_RING: Record<RitualColor, string> = {
  rose:    "ring-rose-400",
  sky:     "ring-sky-400",
  violet:  "ring-violet-400",
  amber:   "ring-amber-400",
  emerald: "ring-emerald-400",
  fuchsia: "ring-fuchsia-400",
  orange:  "ring-orange-400",
  cyan:    "ring-cyan-400",
  indigo:  "ring-indigo-400",
  teal:    "ring-teal-400",
};

const DURATION_PRESETS = [5, 10, 15, 20, 30, 45, 60];

function formatTimeDraft(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeTimeDraft(raw: string): string {
  const match = raw.match(/^(\d{1,2}):?(\d{0,2})$/);
  if (!match) return "";
  const h = Math.min(23, parseInt(match[1], 10));
  const m = Math.min(59, parseInt(match[2] || "0", 10));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

interface RitualSheetProps {
  open: boolean;
  onClose: () => void;
  initial?: Ritual;
  onSave: (data: Omit<Ritual, "id">) => void;
  onDelete?: () => void;
}

export function RitualSheet({ open, onClose, initial, onSave, onDelete }: RitualSheetProps) {
  const isEdit = !!initial;

  const [title, setTitle]       = useState("");
  const [time, setTime]         = useState("08:00");
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [color, setColor]       = useState<RitualColor | "">("");
  const [days, setDays]         = useState<DayKey[]>([]);
  const [notes, setNotes]       = useState("");

  // Reset/pre-fill when sheet opens
  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setTime(initial?.time ?? "08:00");
      setDuration(initial?.duration);
      setColor(initial?.color ?? "");
      setDays(initial?.repeatDays ?? []);
      setNotes(initial?.notes ?? "");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = !!title.trim() && !!time;

  function handleSave() {
    if (!canSave) return;
    haptic("medium");
    onSave({
      title: title.trim(),
      time,
      duration: duration ?? undefined,
      color: color || undefined,
      repeatDays: days.length > 0 ? days : undefined,
      notes: notes.trim() || undefined,
      sortOrder: initial?.sortOrder,
    });
    onClose();
  }

  function handleClose() {
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <div className="px-5 pb-6 pt-2">
        <SheetTitle className="mb-5">{isEdit ? "Edit Routine" : "New Routine"}</SheetTitle>

        <div className="space-y-4">
          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
            placeholder="e.g. Skin care, Vitamins, Stretch…"
            autoFocus
            className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[16px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
          />

          {/* Time */}
          <div>
            <p className={`mb-1.5 ${typography.eyebrow}`}>Time</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="08:00"
              value={time}
              onChange={(e) => setTime(formatTimeDraft(e.target.value))}
              onBlur={(e) => setTime(normalizeTimeDraft(e.target.value) || time)}
              className="h-11 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[16px] font-semibold tabular-nums text-neutral-700 outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.08]"
            />
          </div>

          {/* Duration */}
          <div>
            <p className={`mb-2 ${typography.eyebrow}`}>Duration</p>
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

          {/* Color */}
          <div>
            <p className={`mb-2 ${typography.eyebrow}`}>Color</p>
            <div className="flex items-center gap-2.5">
              {RITUAL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor((prev) => (prev === c ? "" : c))}
                  className={`h-7 w-7 rounded-full transition-all ${COLOR_DOT[c]} ${
                    color === c
                      ? `ring-2 ring-offset-2 ${COLOR_RING[c]} dark:ring-offset-neutral-900`
                      : "opacity-50 hover:opacity-90"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Repeat days */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className={typography.eyebrow}>Repeat days</p>
              <p className={typography.eyebrow}>
                {days.length === 0 ? "Every day" : `${days.length} ${days.length === 1 ? "day" : "days"}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const sel = days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setDays((prev) => sel ? prev.filter((x) => x !== day) : [...prev, day])}
                    className={`h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                      sel
                        ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                        : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:border-white/20"
                    }`}
                  >
                    {DAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className={`mb-1.5 ${typography.eyebrow}`}>Notes <span className="normal-case font-normal text-neutral-400">(optional)</span></p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes or reminders…"
              rows={2}
              className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[14px] text-neutral-700 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
            />
          </div>

          {/* Submit */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-[15px] font-bold text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-950"
          >
            {isEdit ? <IconCheck size={16} strokeWidth={2.5} /> : <IconPlus size={16} strokeWidth={2.5} />}
            {isEdit ? "Save Routine" : "Add Routine"}
          </button>

          {/* Delete — edit mode only */}
          {isEdit && onDelete && (
            <Button
              variant="dangerSecondary"
              fullWidth
              onClick={() => { haptic("light"); onDelete(); onClose(); }}
            >
              Delete Routine
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
