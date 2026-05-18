"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconCheck,
  IconPlus,
  IconSun,
  IconTrash,
} from "@tabler/icons-react";
import type { Ritual, RitualColor, DayKey } from "@/lib/useScheduleDB";
import { DAYS, DAY_LABELS, RITUAL_COLORS } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import BottomSheet from "@/components/ui/BottomSheet";
import { PageTitle, Eyebrow, SheetTitle, typography } from "@/components/ui/Typography";
import { ICON } from "@/components/ui/Icon";

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLOR_DOT: Record<RitualColor, string> = {
  rose:    "bg-rose-400",
  sky:     "bg-sky-400",
  violet:  "bg-violet-400",
  amber:   "bg-amber-400",
  emerald: "bg-emerald-400",
  fuchsia: "bg-fuchsia-400",
};

const COLOR_RING: Record<RitualColor, string> = {
  rose:    "ring-rose-400",
  sky:     "ring-sky-400",
  violet:  "ring-violet-400",
  amber:   "ring-amber-400",
  emerald: "ring-emerald-400",
  fuchsia: "ring-fuchsia-400",
};

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface RitualViewProps {
  rituals: Ritual[];
  completedIds: Set<string>;
  onToggleComplete: (id: string) => void;
  onAdd: (data: Omit<Ritual, "id">) => void;
  onDelete: (id: string) => void;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RitualView({
  rituals,
  completedIds,
  onToggleComplete,
  onAdd,
  onDelete,
  addOpen,
  onAddOpenChange,
}: RitualViewProps) {
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("08:00");
  const [color, setColor] = useState<RitualColor | "">("");
  const [days, setDays] = useState<DayKey[]>([]);
  const completedToday = rituals.filter((r) => completedIds.has(r.id)).length;
  const total = rituals.length;
  const pct = total > 0 ? Math.round((completedToday / total) * 100) : 0;
  const allDone = total > 0 && completedToday === total;

  const sorted = useMemo(() => {
    return [...rituals].sort((a, b) => {
      const aDone = completedIds.has(a.id) ? 1 : 0;
      const bDone = completedIds.has(b.id) ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return a.time.localeCompare(b.time);
    });
  }, [rituals, completedIds]);

  function handleAdd() {
    const t = title.trim();
    if (!t || !time) return;
    haptic("medium");
    onAdd({
      title: t,
      time,
      repeatDays: days.length > 0 ? days : undefined,
      color: color || undefined,
    });
    setTitle("");
    setTime("08:00");
    setColor("");
    setDays([]);
    onAddOpenChange(false);
  }

  function handleDelete(id: string) {
    haptic("light");
    onDelete(id);
  }

  function handleCloseSheet() {
    onAddOpenChange(false);
    setTitle("");
    setTime("08:00");
    setColor("");
    setDays([]);
  }

  const canAdd = !!title.trim() && !!time;

  return (
    <>
      <div className="overflow-y-auto overscroll-contain px-4 pb-32 pt-6">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="mb-1 flex items-center gap-2">
            
            <Eyebrow as="span">Daily Practice</Eyebrow>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <PageTitle>Rituals</PageTitle>
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => { haptic("medium"); onAddOpenChange(true); }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
            >
              <IconPlus {...ICON.action} />
            </motion.button>
          </div>

          {/* Progress bar */}
          {total > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className={`${typography.caption} font-semibold`}>
                  {allDone ? "All done today 🎉" : `${completedToday} of ${total} done`}
                </span>
                <span className="text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">
                  {pct}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
                <motion.div
                  className={`h-full rounded-full ${allDone ? "bg-emerald-500" : "bg-neutral-400 dark:bg-neutral-500"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {rituals.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 pt-16 text-center"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-neutral-100 dark:bg-white/[0.06]">
              <IconSun {...ICON.hero} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-neutral-700 dark:text-neutral-200">
                No rituals yet
              </p>
              <p className="mt-1.5 max-w-[240px] text-[14px] leading-relaxed text-neutral-400">
                Add small daily practices — skincare, vitamins, stretching — and track them each day.
              </p>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => { haptic("medium"); onAddOpenChange(true); }}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-[14px] font-semibold text-white dark:bg-white dark:text-neutral-950"
            >
              <IconPlus {...ICON.action} />
              Add First Ritual
            </motion.button>
          </motion.div>
        )}

        {/* ── Ritual list ──────────────────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {sorted.map((ritual, i) => {
            const dot = ritual.color ? COLOR_DOT[ritual.color] : "bg-neutral-400";
            const dayLabel = ritual.repeatDays && ritual.repeatDays.length > 0
              ? ritual.repeatDays.map((d) => DAY_LABELS[d]).join(" · ")
              : "Every day";
            const done = completedIds.has(ritual.id);

            return (
              <motion.div
                key={ritual.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: i * 0.03, duration: 0.2 }}
                className="mb-2.5"
              >
                <div className={`rounded-[20px] border bg-white transition-opacity duration-300 dark:bg-neutral-900 ${
                  done
                    ? "border-neutral-100 opacity-50 dark:border-white/[0.04]"
                    : "border-neutral-200/80 dark:border-white/[0.08]"
                }`}>
                  <div className="flex items-center gap-3 px-4 py-4">
                    {/* Color dot / complete toggle */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.82 }}
                      onClick={() => { haptic("light"); onToggleComplete(ritual.id); }}
                      className={`shrink-0 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                        done
                          ? "border-transparent bg-green-500"
                          : "border-neutral-200 bg-white dark:border-white/[0.12] dark:bg-transparent"
                      }`}
                    >
                      {done ? (
                        <IconCheck size={ICON.inline.size} strokeWidth={2.5} className="text-white" />
                      ) : (
                        <span className={`h-3 w-3 rounded-full ${dot}`} />
                      )}
                    </motion.button>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className={`text-[15px] font-semibold leading-snug ${
                        done
                          ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-500"
                          : "text-neutral-900 dark:text-white"
                      }`}>
                        {ritual.title}
                      </p>
                      <p className={`mt-0.5 ${typography.caption}`}>
                        {ritual.time} · {dayLabel}
                      </p>
                    </div>

                    {/* Delete */}
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.84 }}
                      onClick={() => handleDelete(ritual.id)}
                      className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl text-neutral-300 transition-colors hover:text-rose-400 dark:text-neutral-600"
                    >
                      <IconTrash {...ICON.subtle} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Add Ritual Sheet ─────────────────────────────────────────────────── */}
      <BottomSheet open={addOpen} onClose={handleCloseSheet}>
        <div className="px-5 pb-6 pt-2">
          <SheetTitle className="mb-5">New Ritual</SheetTitle>

          <div className="space-y-4">
            {/* Title */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canAdd) handleAdd(); }}
              placeholder="e.g. Skin care, Vitamins, Stretch…"
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

            {/* Submit */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleAdd}
              disabled={!canAdd}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-[15px] font-bold text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-950"
            >
              <IconPlus {...ICON.action} />
              Add Ritual
            </motion.button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
