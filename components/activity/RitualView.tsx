"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconRepeat,
  IconCalendarEvent,
  IconSunrise,
  IconSun,
  IconMoon,
  IconInfinity,
  IconCalendarStats,
  IconListCheck,
} from "@tabler/icons-react";
import type { Ritual, RitualCompletion, DayKey } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { localISODate, todayISO } from "@/lib/dateUtils";
import { ritualScheduledOn } from "@/lib/consistency/calculateRitualStreak";
import { haptic } from "@/lib/haptics";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";
import { MainTitleSection, CtaActionButton } from "@/components/ui/MainTitleSection";
import ProgressBar from "@/components/ui/ProgressBar";
import { RitualSheet } from "./RitualSheet";
import RoutineRow from "./RoutineRow";
import { groupRitualsIntoBuckets, type RitualTimeBucketKey } from "@/lib/ritualGrouping";
import { isRitualDayComplete } from "@/lib/consistency/ritualDayStatus";
import { buildAllRoutinesMonthDays } from "@/lib/consistency/ritualCalendar";
import { buildRoutineInsights } from "@/lib/consistency/routineInsights";
import RoutineMonthCalendar from "./RoutineMonthCalendar";
import RoutineInsightsSection from "./RoutineInsightsSection";

// JS getDay() 0=Sunday → DayKey
const JS_TO_DAY: DayKey[] = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

const BUCKET_ICONS: Record<RitualTimeBucketKey, ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  morning: IconSunrise,
  afternoon: IconSun,
  evening: IconMoon,
  anytime: IconInfinity,
};

function appliesToDay(ritual: Ritual, day: DayKey): boolean {
  return ritualScheduledOn(ritual, day);
}

function GroupHeader({
  bucketKey,
  label,
  count,
}: {
  bucketKey: RitualTimeBucketKey;
  label: string;
  count: number;
}) {
  const Icon = BUCKET_ICONS[bucketKey];
  return (
    <div className="flex items-center gap-2 pb-1 pt-4 first:pt-1">
      <Icon size={14} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500" />
      <span className="text-[12px] font-bold text-neutral-600 dark:text-neutral-300">{label}</span>
      <span className="text-[12px] font-semibold text-neutral-300 dark:text-neutral-600">{count}</span>
    </div>
  );
}

/** Progress ring for a single day in the week strip. Stroke fills by ratio. */
function DayRing({ ratio, size = 30, stroke = 3 }: { ratio: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, ratio)) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-neutral-200 dark:stroke-white/10" />
      {dash > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          className="stroke-green-500 transition-[stroke-dasharray] duration-500 ease-out"
        />
      )}
    </svg>
  );
}

function dateForCurrentWeekDay(day: DayKey): string {
  const today = new Date();
  const todayIndex = JS_TO_DAY[today.getDay()];
  const delta = DAYS.indexOf(day) - DAYS.indexOf(todayIndex);
  const date = new Date(today);
  date.setDate(today.getDate() + delta);
  return localISODate(date);
}

function formatDateButtonLabel(dateISO: string): string {
  const [year, month, day] = dateISO.split("-");
  return year && month && day ? `${day}/${month}/${year}` : dateISO;
}

function parseISODate(dateISO: string): Date {
  return new Date(`${dateISO}T00:00:00`);
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function buildCalendarDays(viewMonth: Date, selectedISO: string) {
  const firstOfMonth = monthStart(viewMonth);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const start = new Date(firstOfMonth);
  start.setDate(firstOfMonth.getDate() - mondayOffset);
  const today = todayISO();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = localISODate(date);
    return {
      iso,
      dayNumber: date.getDate(),
      inMonth: date.getMonth() === viewMonth.getMonth(),
      isSelected: iso === selectedISO,
      isToday: iso === today,
    };
  });
}

function DateActionButton({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => monthStart(parseISODate(value)));
  const calendarDays = useMemo(() => buildCalendarDays(viewMonth, value), [viewMonth, value]);
  const monthLabel = viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  useEffect(() => {
    setViewMonth(monthStart(parseISODate(value)));
  }, [value]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function selectDate(dateISO: string) {
    haptic("light");
    onChange(dateISO);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={`Select routine date, ${formatDateButtonLabel(value)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setViewMonth(monthStart(parseISODate(value)));
          setOpen((current) => !current);
        }}
        className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border-[1.5px] px-3 py-[10px] text-[13px] font-bold transition-colors active:scale-[0.97] sm:px-4 ${
          open
            ? "border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-white/20 dark:bg-neutral-800 dark:text-white"
            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
        }`}
      >
        <IconCalendarEvent size={14} strokeWidth={2.3} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
        <span className="hidden tabular-nums sm:inline">{formatDateButtonLabel(value)}</span>
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            role="dialog"
            aria-label="Select routine date"
            initial={{ y: -4, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[292px] max-w-[calc(100vw-32px)] rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-neutral-900"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="Previous month"
                onClick={() => setViewMonth((current) => addMonths(current, -1))}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
              >
                <IconChevronLeft size={16} strokeWidth={2.2} />
              </button>
              <p className="text-[14px] font-extrabold text-neutral-950 dark:text-white">
                {monthLabel}
              </p>
              <button
                type="button"
                aria-label="Next month"
                onClick={() => setViewMonth((current) => addMonths(current, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
              >
                <IconChevronRight size={16} strokeWidth={2.2} />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                <span
                  key={`${day}-${index}`}
                  className="flex h-7 items-center justify-center text-[11px] font-bold text-neutral-400 dark:text-neutral-500"
                >
                  {day}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => (
                <button
                  key={day.iso}
                  type="button"
                  onClick={() => selectDate(day.iso)}
                  aria-label={day.isToday ? `Today, ${day.iso}` : day.iso}
                  aria-current={day.isToday ? "date" : undefined}
                  className={`flex h-8 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums transition-colors ${
                    day.isSelected
                      ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                      : day.isToday
                        ? "border border-neutral-950 text-neutral-950 hover:bg-neutral-100 dark:border-white dark:text-white dark:hover:bg-white/[0.08]"
                        : day.inMonth
                          ? "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/[0.07]"
                          : "text-neutral-300 hover:bg-neutral-50 dark:text-neutral-700 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  {day.dayNumber}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => selectDate(todayISO())}
              className="mt-3 flex h-10 w-full items-center justify-center rounded-full border border-neutral-200 text-[13px] font-extrabold text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/[0.07]"
            >
              Today
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface RitualViewProps {
  rituals: Ritual[];
  ritualCompletions: RitualCompletion[];
  onToggleComplete: (id: string, dateISO?: string) => void;
  onLogAmount: (ritualId: string, amount: number, dateISO: string) => void;
  onUndoLastLog: (ritualId: string, dateISO: string) => void;
  onOpenDetail: (ritual: Ritual) => void;
  onAdd: (data: Omit<Ritual, "id">) => void;
  onUpdate: (id: string, data: Omit<Ritual, "id">) => void;
  onDelete: (id: string) => void;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RitualView({
  rituals,
  ritualCompletions,
  onToggleComplete,
  onLogAmount,
  onUndoLastLog,
  onOpenDetail,
  onAdd,
  onUpdate,
  onDelete,
  addOpen,
  onAddOpenChange,
}: RitualViewProps) {
  const [editRitual, setEditRitual] = useState<Ritual | null>(null);
  const [deleteRitual, setDeleteRitual] = useState<Ritual | null>(null);
  const [selectedDateISO, setSelectedDateISO] = useState(() => todayISO());
  const [viewMode, setViewMode] = useState<"day" | "month">("day");
  const monthNow = new Date(`${todayISO()}T00:00:00`);
  const [calYear, setCalYear] = useState(monthNow.getFullYear());
  const [calMonth, setCalMonth] = useState(monthNow.getMonth());
  const selectedDay = JS_TO_DAY[new Date(`${selectedDateISO}T00:00:00`).getDay()] as DayKey;
  const deleteCopy = deleteRitual
    ? buildDeleteConfirmationCopy("routine", {
        name: deleteRitual.title,
        description: "This routine will be removed from your daily practice.",
      })
    : null;

  const sorted = useMemo(() => [...rituals].sort((a, b) => {
    const ao = a.sortOrder ?? Infinity, bo = b.sortOrder ?? Infinity;
    return ao !== bo ? ao - bo : a.time.localeCompare(b.time);
  }), [rituals]);

  const filteredRituals = useMemo(() => {
    return sorted.filter((r) => appliesToDay(r, selectedDay));
  }, [sorted, selectedDay]);

  const completedToday = filteredRituals.filter((r) =>
    isRitualDayComplete(r, ritualCompletions.filter((c) => c.ritualId === r.id && c.date === selectedDateISO)),
  ).length;
  const total = filteredRituals.length;
  const pct = total > 0 ? Math.round((completedToday / total) * 100) : 0;
  const allDone = total > 0 && completedToday === total;

  // Week strip carries the reward loop: each day shows done ÷ due for THIS week,
  // not the raw schedule count (which was identical across days and told you
  // nothing about follow-through).
  const weekStrip = useMemo(
    () =>
      DAYS.map((day) => {
        const dateISO = dateForCurrentWeekDay(day);
        const dueRituals = sorted.filter((r) => appliesToDay(r, day));
        const done = dueRituals.filter((r) =>
          isRitualDayComplete(r, ritualCompletions.filter((c) => c.ritualId === r.id && c.date === dateISO)),
        ).length;
        return {
          day,
          dateISO,
          due: dueRituals.length,
          done,
          dayNum: new Date(`${dateISO}T00:00:00`).getDate(),
          isToday: dateISO === todayISO(),
        };
      }),
    [sorted, ritualCompletions]
  );

  // Group the selected day's routines into morning / afternoon / evening / anytime.
  const grouped = useMemo(() => groupRitualsIntoBuckets(filteredRituals), [filteredRituals]);

  const monthCalendarDays = useMemo(
    () => buildAllRoutinesMonthDays(sorted, ritualCompletions, calYear, calMonth, todayISO()),
    [sorted, ritualCompletions, calYear, calMonth],
  );

  const routineInsights = useMemo(
    () => buildRoutineInsights(sorted, ritualCompletions, todayISO()),
    [sorted, ritualCompletions],
  );

  function prevCalMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }
  function nextCalMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  return (
    <>
      <div className="py-6 px-4 lg:pb-10 lg:pt-6">
       <div className="mx-auto w-full max-w-[1500px]">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <MainTitleSection
          label="Daily Practice"
          title="Routines"
          actions={
            <>
              {rituals.length > 0 && (
                <button
                  type="button"
                  aria-label={viewMode === "day" ? "Show month view" : "Show day view"}
                  aria-pressed={viewMode === "month"}
                  onClick={() => { haptic("light"); setViewMode((m) => (m === "day" ? "month" : "day")); }}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] transition-colors active:scale-[0.97] ${
                    viewMode === "month"
                      ? "border-neutral-300 bg-neutral-100 text-neutral-900 dark:border-white/20 dark:bg-neutral-800 dark:text-white"
                      : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-100 dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  {viewMode === "day" ? (
                    <IconCalendarStats size={16} strokeWidth={2.2} />
                  ) : (
                    <IconListCheck size={16} strokeWidth={2.2} />
                  )}
                </button>
              )}
              {rituals.length > 0 && viewMode === "day" && (
                <DateActionButton value={selectedDateISO} onChange={setSelectedDateISO} />
              )}
              <CtaActionButton
                label="Add Routine"
                icon={<IconPlus size={14} strokeWidth={2.5} />}
                onClick={() => { haptic("medium"); onAddOpenChange(true); }}
              />
            </>
          }
          className="mb-4"
        />

        {/* ── Month view — aggregate consistency calendar ──────────────────── */}
        {rituals.length > 0 && viewMode === "month" && (
          <div className="space-y-5">
            <RoutineMonthCalendar
              year={calYear}
              month={calMonth}
              days={monthCalendarDays}
              onPrevMonth={prevCalMonth}
              onNextMonth={nextCalMonth}
              title="Routine consistency"
              onSelectDay={(iso) => { haptic("light"); setSelectedDateISO(iso); setViewMode("day"); }}
            />
            <RoutineInsightsSection insights={routineInsights} />
          </div>
        )}

        {/* ── Earned "all done" moment ─────────────────────────────────────── */}
        {viewMode === "day" && allDone && (
          <m.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 dark:border-emerald-500/20 dark:bg-emerald-500/[0.08]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <IconCheck size={20} strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <p className="text-[16px] font-black leading-tight text-emerald-700 dark:text-emerald-300">Daily practice complete</p>
              <p className="mt-0.5 text-[13px] font-semibold text-emerald-600/80 dark:text-emerald-400/80">
                All {total} done for {DAY_SHORT[selectedDay]}.
              </p>
            </div>
          </m.div>
        )}

        {/* ── Progress bar (in-progress, mobile) ───────────────────────────── */}
        {viewMode === "day" && total > 0 && !allDone && (
          <div className="mb-5 lg:hidden">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">
                {completedToday} of {total} done
              </span>
              <span className="text-[14px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{pct}%</span>
            </div>
            <ProgressBar pct={pct} height={8} fillClassName="bg-green-500" />
          </div>
        )}

        {/* ── Week strip — completion per day (the reward loop) ────────────── */}
        {viewMode === "day" && rituals.length > 0 && (
          <div className="mb-6">
            <div className="grid grid-cols-7 gap-1.5">
              {weekStrip.map(({ day, due, done, dayNum, isToday }) => {
                const sel = selectedDay === day;
                const ratio = due > 0 ? done / due : 0;
                const complete = due > 0 && done === due;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSelectedDateISO(dateForCurrentWeekDay(day))}
                    aria-label={`${DAY_SHORT[day]} ${dayNum}, ${due > 0 ? `${done} of ${due} done` : "nothing scheduled"}`}
                    aria-pressed={sel}
                    className={`flex w-full flex-col items-center gap-1.5 rounded-2xl py-2.5 transition-colors ${
                      sel
                        ? "bg-neutral-100 ring-1 ring-inset ring-neutral-900/10 dark:bg-white/[0.06] dark:ring-white/15"
                        : "hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className={`text-[12px] font-semibold leading-none ${
                      isToday ? "text-emerald-600 dark:text-emerald-400" : sel ? "text-neutral-700 dark:text-neutral-200" : "text-neutral-400 dark:text-neutral-500"
                    }`}>
                      {DAY_SHORT[day]}
                    </span>
                    <span className="relative grid place-items-center">
                      <DayRing ratio={ratio} />
                      <span className="absolute inset-0 grid place-items-center">
                        {complete ? (
                          <IconCheck size={13} strokeWidth={3} className="text-green-600 dark:text-green-400" />
                        ) : (
                          <span className="text-[11px] font-bold tabular-nums text-neutral-700 dark:text-neutral-200">{dayNum}</span>
                        )}
                      </span>
                    </span>
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
            description="Add anything you want to do regularly — skincare, water, exercise, reading — and track it your own way."
            action={{ label: "Add First Routine", onClick: () => onAddOpenChange(true) }}
          />
        )}

        {/* ── Empty filter state ───────────────────────────────────────────── */}
        {viewMode === "day" && rituals.length > 0 && filteredRituals.length === 0 && (
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

        {/* ── Routine rows, grouped by time of day — same list at every width ── */}
        {viewMode === "day" && filteredRituals.length > 0 && (
          <div className="grid gap-5 lg:grid-cols-1 lg:justify-items-center xl:grid-cols-[minmax(0,1fr)_320px] xl:justify-items-stretch">
            {/* Capped + centered between lg and xl: below xl the sidebar
                (aside, below) isn't shown yet, so an uncapped single column
                stretches this list edge-to-edge on a laptop-width screen —
                a title on the far left and a checkbox stranded far to its
                right, with a long dead gap between. xl:max-w-none releases
                the cap once the sidebar returns to balance the width. */}
            <section className="w-full min-w-0 divide-y divide-neutral-100 dark:divide-white/[0.06] lg:max-w-2xl lg:divide-y-0 lg:space-y-4 xl:max-w-none">
              {grouped.map((group) => (
                <div key={group.key} className="lg:rounded-2xl lg:border lg:border-neutral-200 lg:bg-white lg:px-4 lg:dark:border-white/[0.08] lg:dark:bg-neutral-900">
                  <GroupHeader bucketKey={group.key} label={group.label} count={group.items.length} />
                  <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                    <AnimatePresence initial={false}>
                      {group.items.map((ritual) => (
                        <m.div
                          key={ritual.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.18 }}
                        >
                          <RoutineRow
                            ritual={ritual}
                            ritualCompletions={ritualCompletions}
                            selectedDateISO={selectedDateISO}
                            selectedDay={selectedDay}
                            onToggleComplete={onToggleComplete}
                            onLogAmount={onLogAmount}
                            onUndoLastLog={onUndoLastLog}
                            onOpenDetail={onOpenDetail}
                            onDelete={setDeleteRitual}
                          />
                        </m.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              ))}
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
                    <span className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Active routines</span>
                    <span className="text-[12px] font-black tabular-nums text-neutral-950 dark:text-white">{rituals.length}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2 dark:border-white/[0.06]">
                    <span className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Scheduled {DAY_SHORT[selectedDay]}</span>
                    <span className="text-[12px] font-black tabular-nums text-neutral-950 dark:text-white">{total}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Done today</span>
                    <span className="text-[12px] font-black tabular-nums text-neutral-950 dark:text-white">{completedToday}</span>
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
