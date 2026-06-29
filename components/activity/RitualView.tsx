"use client";

import { useMemo, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  IconCheck,
  IconPlus,
  IconRepeat,
  IconTrash,
  IconCalendarEvent,
} from "@tabler/icons-react";
import type { Ritual, RitualColor, RitualCompletion, DayKey } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { localISODate, todayISO } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";
import { MainTitleSection, CtaActionButton } from "@/components/ui/MainTitleSection";
import ProgressBar from "@/components/ui/ProgressBar";
import IconButton from "@/components/ui/IconButton";
import { RitualSheet } from "./RitualSheet";

// ── Color maps ────────────────────────────────────────────────────────────────

// Vivid ring border (left toggle + today dot) — matches the design reference.
const COLOR_RING: Record<RitualColor, string> = {
  rose:    "border-rose-500",   sky:     "border-sky-500",
  violet:  "border-violet-500", amber:   "border-amber-500",
  emerald: "border-emerald-500",fuchsia: "border-fuchsia-500",
  orange:  "border-orange-500", cyan:    "border-cyan-500",
  indigo:  "border-indigo-500", teal:    "border-teal-500",
};

// JS getDay() 0=Sunday → DayKey
const JS_TO_DAY: DayKey[] = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

function getLast7Dates(): string[] {
  const dates: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(localISODate(d));
  }
  return dates;
}

function appliesToDay(ritual: Ritual, day: DayKey): boolean {
  return !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(day);
}

function dateForCurrentWeekDay(day: DayKey): string {
  const today = new Date();
  const todayIndex = JS_TO_DAY[today.getDay()];
  const delta = DAYS.indexOf(day) - DAYS.indexOf(todayIndex);
  const date = new Date(today);
  date.setDate(today.getDate() + delta);
  return localISODate(date);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeekDay {
  date: string; label: string; isToday: boolean;
  completedCount: number; dueCount: number;
}

interface RitualViewProps {
  rituals: Ritual[];
  ritualCompletions: RitualCompletion[];
  onToggleComplete: (id: string, dateISO?: string) => void;
  onAdd: (data: Omit<Ritual, "id">) => void;
  onUpdate: (id: string, data: Omit<Ritual, "id">) => void;
  onDelete: (id: string) => void;
  onReorder: (reordered: Ritual[]) => void;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  weekHistory?: WeekDay[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RitualView({
  rituals,
  ritualCompletions,
  onToggleComplete,
  onAdd,
  onUpdate,
  onDelete,
  addOpen,
  onAddOpenChange,
}: RitualViewProps) {
  const todayKey = JS_TO_DAY[new Date().getDay()] as DayKey;
  const [editRitual, setEditRitual] = useState<Ritual | null>(null);
  const [deleteRitual, setDeleteRitual] = useState<Ritual | null>(null);
  const [selectedDateISO, setSelectedDateISO] = useState(() => todayISO());
  const selectedDay = JS_TO_DAY[new Date(`${selectedDateISO}T00:00:00`).getDay()] as DayKey;
  const deleteCopy = deleteRitual
    ? buildDeleteConfirmationCopy("routine", {
        name: deleteRitual.title,
        description: "This routine will be removed from your daily practice.",
      })
    : null;

  const last7 = useMemo(getLast7Dates, []);
  const MAX_RITUALS = 8;

  const sorted = useMemo(() => [...rituals].sort((a, b) => {
    const ao = a.sortOrder ?? Infinity, bo = b.sortOrder ?? Infinity;
    return ao !== bo ? ao - bo : a.time.localeCompare(b.time);
  }), [rituals]);

  const filteredRituals = useMemo(() => {
    return sorted.filter((r) => appliesToDay(r, selectedDay));
  }, [sorted, selectedDay]);

  const selectedCompletedIds = useMemo(
    () =>
      new Set(
        ritualCompletions
          .filter((completion) => completion.date === selectedDateISO)
          .map((completion) => completion.ritualId)
      ),
    [ritualCompletions, selectedDateISO]
  );

  const completedToday = filteredRituals.filter((r) => selectedCompletedIds.has(r.id)).length;
  const total = filteredRituals.length;
  const pct = total > 0 ? Math.round((completedToday / total) * 100) : 0;
  const allDone = total > 0 && completedToday === total;

  function dayCount(day: DayKey) {
    return sorted.filter((r) => appliesToDay(r, day)).length;
  }

  // Last-7-days status per ritual: green = completed, color ring = due today &
  // not done, gray = due & missed, faint = not scheduled that day.
  function weekDots(ritual: Ritual) {
    const todayISOstr = localISODate(new Date());
    return last7.map((date) => {
      const wd = JS_TO_DAY[new Date(`${date}T00:00:00`).getDay()];
      return {
        completed: ritualCompletions.some((c) => c.ritualId === ritual.id && c.date === date),
        due: appliesToDay(ritual, wd),
        isToday: date === todayISOstr,
      };
    });
  }

  function renderCard(ritual: Ritual) {
    const ring = ritual.color ? COLOR_RING[ritual.color] : "border-neutral-300 dark:border-neutral-600";
    const dayLabel = ritual.repeatDays && ritual.repeatDays.length > 0
      ? ritual.repeatDays.map((d) => DAY_SHORT[d]).join(" · ")
      : "Everyday";
    const done = selectedCompletedIds.has(ritual.id);
    const missed = selectedDateISO < todayISO() && appliesToDay(ritual, selectedDay) && !done;
    const week = weekDots(ritual);

    return (
      <div className="group flex items-center gap-4 py-4">
        {/* Big completion ring */}
        <m.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => { haptic("light"); onToggleComplete(ritual.id, selectedDateISO); }}
          aria-label={done ? "Mark incomplete" : missed ? "Mark complete for missed day" : "Mark complete"}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[2.5px] transition-colors ${
            done ? "border-transparent bg-green-500" : missed ? "border-neutral-300 bg-neutral-200 dark:border-white/15 dark:bg-white/10" : `${ring} bg-transparent`
          }`}
        >
          {done && <IconCheck size={22} strokeWidth={3} className="text-white" />}
        </m.button>

        {/* Title + meta */}
        <button
          type="button"
          onClick={() => { haptic("light"); setEditRitual(ritual); }}
          className="min-w-0 flex-1 text-left"
        >
          <p className={`truncate text-[17px] font-bold leading-tight ${
            done ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-500" : missed ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-900 dark:text-white"
          }`}>
            {ritual.title}
          </p>
          <p className="mt-1 truncate text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            <span className="tabular-nums">{ritual.time}</span> · {missed ? "Missed · " : ""}{dayLabel}
          </p>
        </button>

        {/* 7-day consistency dots */}
        <div className="flex shrink-0 items-center gap-1.5">
          {week.map((d, i) => {
            if (d.completed) return <span key={i} className="h-2.5 w-2.5 rounded-full bg-green-500" />;
            if (d.isToday && d.due) return <span key={i} className={`h-2.5 w-2.5 rounded-full border-2 bg-transparent ${ring}`} />;
            return <span key={i} className={`h-2.5 w-2.5 rounded-full ${d.due ? "bg-neutral-200 dark:bg-white/15" : "bg-neutral-100 dark:bg-white/[0.06]"}`} />;
          })}
        </div>

        {/* Desktop-only delete */}
        <IconButton
          label="Delete routine"
          variant="dangerGhost"
          size="xs"
          radius="lg"
          onClick={() => setDeleteRitual(ritual)}
          className="hidden opacity-0 transition-opacity group-hover:opacity-100 lg:flex"
        >
          <IconTrash size={14} strokeWidth={2} />
        </IconButton>
      </div>
    );
  }

  // Desktop card — one self-contained card per routine, laid out in a grid.
  function renderDesktopCard(ritual: Ritual) {
    const ring = ritual.color ? COLOR_RING[ritual.color] : "border-neutral-300 dark:border-neutral-600";
    const dayLabel = ritual.repeatDays && ritual.repeatDays.length > 0
      ? ritual.repeatDays.map((d) => DAY_SHORT[d]).join(" · ")
      : "Everyday";
    const done = selectedCompletedIds.has(ritual.id);
    const missed = selectedDateISO < todayISO() && appliesToDay(ritual, selectedDay) && !done;
    const week = weekDots(ritual);

    return (
      <div className="group relative flex h-full flex-col justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300 dark:border-white/[0.08] dark:bg-neutral-900 dark:hover:border-white/[0.16]">
        <div className="flex items-start gap-3">
          {/* Completion ring */}
          <m.button
            type="button"
            whileTap={{ scale: 0.88 }}
            onClick={() => { haptic("light"); onToggleComplete(ritual.id, selectedDateISO); }}
            aria-label={done ? "Mark incomplete" : missed ? "Mark complete for missed day" : "Mark complete"}
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[2.5px] transition-colors ${
              done ? "border-transparent bg-green-500" : missed ? "border-neutral-300 bg-neutral-200 dark:border-white/15 dark:bg-white/10" : `${ring} bg-transparent`
            }`}
          >
            {done && <IconCheck size={20} strokeWidth={3} className="text-white" />}
          </m.button>

          {/* Title + meta */}
          <button
            type="button"
            onClick={() => { haptic("light"); setEditRitual(ritual); }}
            className="min-w-0 flex-1 text-left"
          >
            <p className={`truncate text-[16px] font-bold leading-tight ${
              done ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-500" : missed ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-900 dark:text-white"
            }`}>
              {ritual.title}
            </p>
            <p className="mt-1 truncate text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
              <span className="tabular-nums">{ritual.time}</span> · {missed ? "Missed · " : ""}{dayLabel}
            </p>
          </button>

          {/* Delete on hover */}
          <IconButton
            label="Delete routine"
            variant="dangerGhost"
            size="xs"
            radius="lg"
            onClick={() => setDeleteRitual(ritual)}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          >
            <IconTrash size={14} strokeWidth={2} />
          </IconButton>
        </div>

        {/* 7-day consistency */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
            Last 7 days
          </span>
          <div className="flex items-center gap-1.5">
            {week.map((d, i) => {
              if (d.completed) return <span key={i} className="h-2.5 w-2.5 rounded-full bg-green-500" />;
              if (d.isToday && d.due) return <span key={i} className={`h-2.5 w-2.5 rounded-full border-2 bg-transparent ${ring}`} />;
              return <span key={i} className={`h-2.5 w-2.5 rounded-full ${d.due ? "bg-neutral-200 dark:bg-white/15" : "bg-neutral-100 dark:bg-white/[0.06]"}`} />;
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="py-6 lg:pb-10 lg:pt-6">
       <div className="mx-auto w-full max-w-[1500px]">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <MainTitleSection
          label="Daily Practice"
          title="Routines"
          actions={
            rituals.length < MAX_RITUALS ? (
              <CtaActionButton
                label="Add Routine"
                icon={<IconPlus size={14} strokeWidth={2.5} />}
                onClick={() => { haptic("medium"); onAddOpenChange(true); }}
              />
            ) : (
              <span className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">Max {MAX_RITUALS}</span>
            )
          }
          className="mb-4"
        />

        {/* ── Progress bar (today / all only, mobile) ──────────────────────── */}
        {total > 0 && (
          <div className="mb-5 lg:hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">
                {allDone ? `All done for ${DAY_SHORT[selectedDay]}` : `${completedToday} of ${total} done`}
              </span>
              <span className="text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{pct}%</span>
            </div>
            <ProgressBar pct={pct} height={8} fillClassName="bg-green-500" />
          </div>
        )}

        {/* ── Day filter strip ─────────────────────────────────────────────── */}
        {rituals.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-neutral-900">
              <IconCalendarEvent size={16} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500" />
              <input
                type="date"
                value={selectedDateISO}
                onChange={(e) => setSelectedDateISO(e.target.value || todayISO())}
                className="min-w-0 flex-1 bg-transparent text-[14px] font-bold text-neutral-800 outline-none dark:text-white"
              />
              {selectedDateISO !== todayISO() && (
                <button
                  type="button"
                  onClick={() => setSelectedDateISO(todayISO())}
                  className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-bold text-neutral-500 dark:bg-white/[0.07] dark:text-neutral-300"
                >
                  Today
                </button>
              )}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((day) => {
                const sel = selectedDay === day;
                const count = dayCount(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDateISO(dateForCurrentWeekDay(day))}
                    className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl py-3.5 transition-colors ${
                      sel
                        ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                        : "border border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20 dark:hover:text-neutral-200"
                    }`}
                  >
                    <span className={`text-[13px] font-semibold leading-none ${sel ? "" : "text-neutral-400 dark:text-neutral-500"}`}>{DAY_SHORT[day]}</span>
                    <span className="text-[20px] font-bold tabular-nums leading-none">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Empty state (no rituals at all) ──────────────────────────────── */}
        {rituals.length === 0 && (
          <EmptyState
            icon={IconRepeat}
            title="No routines yet"
            description="Add small daily practices — skincare, vitamins, stretching — and track them each day."
            action={{ label: "Add First Routine", onClick: () => onAddOpenChange(true) }}
          />
        )}

        {/* ── Empty filter state ───────────────────────────────────────────── */}
        {rituals.length > 0 && filteredRituals.length === 0 && (
          <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">
              No routines for {DAY_SHORT[selectedDay]}
            </p>
            <button type="button" onClick={() => onAddOpenChange(true)}
              className="mt-1 text-[13px] font-semibold text-neutral-400 underline underline-offset-2 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              Add one
            </button>
          </m.div>
        )}

        {/* ── Mobile: flat divided list ─────────────────────────────────────── */}
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.06] lg:hidden">
          <AnimatePresence initial={false}>
            {filteredRituals.map((ritual) => (
              <m.div
                key={ritual.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                {renderCard(ritual)}
              </m.div>
            ))}
          </AnimatePresence>
        </div>

        {/* ── Desktop: routine card grid + signal rail ──────────────────────── */}
        {filteredRituals.length > 0 && (
          <div className="hidden gap-5 lg:grid xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0">
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredRituals.map((ritual) => (
                  <div key={ritual.id}>{renderDesktopCard(ritual)}</div>
                ))}
              </div>
            </section>

            <aside className="hidden min-w-0 space-y-3 xl:block">
              <div className={`rounded-2xl border p-4 ${allDone ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07]" : "border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900"}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  Today&apos;s signal
                </p>
                <p className={`mt-2 text-[24px] font-black leading-none ${allDone ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-950 dark:text-white"}`}>
                  {allDone ? "All done" : `${pct}%`}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {completedToday} of {total} done for {DAY_SHORT[selectedDay]}.
                </p>
                <div className="mt-3">
                  <ProgressBar pct={pct} height={6} fillClassName="bg-green-500" />
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-white/[0.08] dark:bg-neutral-900">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
                  Routine totals
                </p>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2 dark:border-white/[0.06]">
                    <span className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Active routines</span>
                    <span className="text-[13px] font-black tabular-nums text-neutral-950 dark:text-white">{rituals.length}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2 dark:border-white/[0.06]">
                    <span className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Scheduled {DAY_SHORT[selectedDay]}</span>
                    <span className="text-[13px] font-black tabular-nums text-neutral-950 dark:text-white">{total}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">Done today</span>
                    <span className="text-[13px] font-black tabular-nums text-neutral-950 dark:text-white">{completedToday}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
       </div>
      </div>

      <RitualSheet open={addOpen} onClose={() => onAddOpenChange(false)} onSave={onAdd} />

      <RitualSheet
        open={!!editRitual}
        onClose={() => setEditRitual(null)}
        initial={editRitual ?? undefined}
        onSave={(data) => { if (editRitual) onUpdate(editRitual.id, data); }}
        onDelete={() => { if (editRitual) { haptic("light"); setDeleteRitual(editRitual); } setEditRitual(null); }}
      />

      <ConfirmSheet
        open={!!deleteRitual}
        onClose={() => setDeleteRitual(null)}
        onConfirm={() => {
          if (!deleteRitual) return;
          haptic("medium");
          onDelete(deleteRitual.id);
          setDeleteRitual(null);
        }}
        title={deleteCopy?.title ?? ""}
        description={deleteCopy?.description}
        confirmLabel={deleteCopy?.confirmLabel}
      />
    </>
  );
}
