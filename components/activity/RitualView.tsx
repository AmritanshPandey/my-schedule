"use client";

import { useMemo, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import {
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconRepeat,
  IconSunHigh,
  IconSunrise,
  IconSunset,
  IconTrash,
  IconCalendarEvent,
  IconChartLine,
  IconFlame,
} from "@tabler/icons-react";
import type { Ritual, RitualColor, RitualCompletion, DayKey } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { localISODate } from "@/lib/dateUtils";
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

const TIME_GROUPS = [
  { key: "morning"   as const, label: "Morning",   Icon: IconSunrise, test: (h: number) => h < 12             },
  { key: "afternoon" as const, label: "Afternoon",  Icon: IconSunHigh, test: (h: number) => h >= 12 && h < 17 },
  { key: "evening"   as const, label: "Evening",    Icon: IconSunset,  test: (h: number) => h >= 17            },
];

// JS getDay() 0=Sunday → DayKey
const JS_TO_DAY: DayKey[] = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

function getHour(time: string) { return parseInt(time.split(":")[0] ?? "0", 10); }

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
  weekHistory,
}: RitualViewProps) {
  const todayKey = JS_TO_DAY[new Date().getDay()] as DayKey;
  const [editRitual, setEditRitual] = useState<Ritual | null>(null);
  const [deleteRitual, setDeleteRitual] = useState<Ritual | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayKey);
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

  const selectedDateISO = useMemo(() => dateForCurrentWeekDay(selectedDay), [selectedDay]);
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

  const weekAvg = useMemo(() => {
    if (!weekHistory || weekHistory.length === 0) return null;
    const active = weekHistory.filter((d) => d.dueCount > 0);
    if (active.length === 0) return null;
    return Math.round(active.reduce((sum, d) => sum + (d.completedCount / d.dueCount) * 100, 0) / active.length);
  }, [weekHistory]);

  function dayCount(day: DayKey) {
    return sorted.filter((r) => appliesToDay(r, day)).length;
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function renderCard(ritual: Ritual) {
    const ring = ritual.color ? COLOR_RING[ritual.color] : "border-neutral-300 dark:border-neutral-600";
    const dayLabel = ritual.repeatDays && ritual.repeatDays.length > 0
      ? ritual.repeatDays.map((d) => DAY_SHORT[d]).join(" · ")
      : "Everyday";
    const done = selectedCompletedIds.has(ritual.id);

    // Last-7-days dots: green = completed, color ring = due today & not done,
    // gray = due & missed, faint = not scheduled that day.
    const todayISOstr = localISODate(new Date());
    const week = last7.map((date) => {
      const wd = JS_TO_DAY[new Date(`${date}T00:00:00`).getDay()];
      return {
        completed: ritualCompletions.some((c) => c.ritualId === ritual.id && c.date === date),
        due: appliesToDay(ritual, wd),
        isToday: date === todayISOstr,
      };
    });

    return (
      <div className="group flex items-center gap-4 py-4">
        {/* Big completion ring */}
        <m.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={() => { haptic("light"); onToggleComplete(ritual.id, selectedDateISO); }}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[2.5px] transition-colors ${
            done ? "border-transparent bg-green-500" : `${ring} bg-transparent`
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
            done ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-500" : "text-neutral-900 dark:text-white"
          }`}>
            {ritual.title}
          </p>
          <p className="mt-1 truncate text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
            <span className="tabular-nums">{ritual.time}</span> · {dayLabel}
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

  return (
    <>
      <div className="px-4 pb-6 pt-6 lg:mx-auto lg:max-w-4xl lg:px-8 lg:pb-10 lg:pt-6">

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
          <div className="mb-6 grid grid-cols-7 gap-2">
            {DAYS.map((day) => {
              const sel = selectedDay === day;
              const count = dayCount(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
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
        )}

        {/* ── Desktop stat tiles ───────────────────────────────────────────── */}
        {rituals.length > 0 && (
          <div className="hidden lg:grid lg:grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
              <div className="flex items-center gap-1.5 mb-1">
                <IconCalendarEvent size={12} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Showing</p>
              </div>
              <p className="text-[28px] font-black tabular-nums leading-none text-neutral-900 dark:text-white">{total}</p>
              <p className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500">for {DAY_SHORT[selectedDay]}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3.5 ${allDone ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07]" : "border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900"}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <IconCheck size={12} strokeWidth={2.5} className={allDone ? "text-emerald-500" : "text-neutral-400 dark:text-neutral-500"} />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Progress</p>
              </div>
              <p className={`text-[28px] font-black tabular-nums leading-none ${allDone ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-900 dark:text-white"}`}>
                {pct}<span className="text-[16px] font-bold">%</span>
              </p>
              <p className={`mt-0.5 text-[12px] ${allDone ? "text-emerald-600/70 dark:text-emerald-500/70" : "text-neutral-400 dark:text-neutral-500"}`}>
                {completedToday} of {total} done
              </p>
            </div>
            {weekAvg !== null ? (
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
                <div className="flex items-center gap-1.5 mb-1">
                  <IconChartLine size={12} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500" />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">7-day avg</p>
                </div>
                <p className="text-[28px] font-black tabular-nums leading-none text-neutral-900 dark:text-white">
                  {weekAvg}<span className="text-[16px] font-bold">%</span>
                </p>
                <p className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500">completion rate</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
                <div className="flex items-center gap-1.5 mb-1">
                  <IconFlame size={12} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500" />
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Streak</p>
                </div>
                <p className="text-[28px] font-black tabular-nums leading-none text-neutral-900 dark:text-white">—</p>
                <p className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500">complete more days</p>
              </div>
            )}
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

        {/* ── Desktop: time-grouped list ────────────────────────────────────── */}
        <div className="hidden lg:block">
          {TIME_GROUPS.map(({ key, label, Icon }) => {
            const group = filteredRituals.filter((r) => {
              const h = getHour(r.time);
              if (key === "morning")   return h < 12;
              if (key === "afternoon") return h >= 12 && h < 17;
              return h >= 17;
            });
            if (group.length === 0) return null;
            const collapsed = collapsedGroups.has(key);

            return (
              <div key={key} className="mb-5 last:mb-0">
                <button type="button" onClick={() => toggleGroup(key)} className="mb-3 flex w-full items-center gap-2 text-left">
                  <Icon size={13} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">{label}</span>
                  <span className="text-[11px] font-medium text-neutral-300 dark:text-neutral-700">· {group.length}</span>
                  <IconChevronDown size={13} strokeWidth={2}
                    className={`ml-auto text-neutral-300 transition-transform dark:text-neutral-700 ${collapsed ? "-rotate-90" : ""}`} />
                </button>

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <m.div
                      key="content"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                        {group.map((ritual) => (
                          <div key={ritual.id}>{renderCard(ritual)}</div>
                        ))}
                      </div>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
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
