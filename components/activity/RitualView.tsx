"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconCheck,
  IconChevronDown,
  IconPlus,
  IconRepeat,
  IconSunHigh,
  IconSunrise,
  IconSunset,
  IconTrash,
} from "@tabler/icons-react";
import type { Ritual, RitualColor, RitualCompletion, DayKey } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";
import { typography } from "@/components/ui/Typography";
import { ICON } from "@/components/ui/Icon";
import { MainTitleSection, CtaActionButton } from "@/components/ui/MainTitleSection";
import { RitualSheet } from "./RitualSheet";

// ── Color maps ────────────────────────────────────────────────────────────────

const COLOR_DOT: Record<RitualColor, string> = {
  rose:    "bg-rose-400",   sky:     "bg-sky-400",
  violet:  "bg-violet-400", amber:   "bg-amber-400",
  emerald: "bg-emerald-400",fuchsia: "bg-fuchsia-400",
  orange:  "bg-orange-400", cyan:    "bg-cyan-400",
  indigo:  "bg-indigo-400", teal:    "bg-teal-400",
};

const COLOR_RING_BORDER: Record<RitualColor, string> = {
  rose:    "border-rose-300 dark:border-rose-500/50",
  sky:     "border-sky-300 dark:border-sky-500/50",
  violet:  "border-violet-300 dark:border-violet-500/50",
  amber:   "border-amber-300 dark:border-amber-500/50",
  emerald: "border-emerald-300 dark:border-emerald-500/50",
  fuchsia: "border-fuchsia-300 dark:border-fuchsia-500/50",
  orange:  "border-orange-300 dark:border-orange-500/50",
  cyan:    "border-cyan-300 dark:border-cyan-500/50",
  indigo:  "border-indigo-300 dark:border-indigo-500/50",
  teal:    "border-teal-300 dark:border-teal-500/50",
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
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function appliesToDay(ritual: Ritual, day: DayKey): boolean {
  return !ritual.repeatDays || ritual.repeatDays.length === 0 || ritual.repeatDays.includes(day);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeekDay {
  date: string; label: string; isToday: boolean;
  completedCount: number; dueCount: number;
}

interface RitualViewProps {
  rituals: Ritual[];
  completedIds: Set<string>;
  ritualCompletions: RitualCompletion[];
  onToggleComplete: (id: string) => void;
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
  completedIds,
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedDay, setSelectedDay] = useState<DayKey>(todayKey);

  const last7 = useMemo(getLast7Dates, []);
  const MAX_RITUALS = 8;

  const sorted = useMemo(() => [...rituals].sort((a, b) => {
    const ao = a.sortOrder ?? Infinity, bo = b.sortOrder ?? Infinity;
    return ao !== bo ? ao - bo : a.time.localeCompare(b.time);
  }), [rituals]);

  const filteredRituals = useMemo(() => {
    return sorted.filter((r) => appliesToDay(r, selectedDay));
  }, [sorted, selectedDay]);

  const completedToday = filteredRituals.filter((r) => completedIds.has(r.id)).length;
  const total = filteredRituals.length;
  const pct = total > 0 ? Math.round((completedToday / total) * 100) : 0;
  const allDone = total > 0 && completedToday === total;
  const showProgress = selectedDay === todayKey;

  const weekAvg = useMemo(() => {
    if (!weekHistory || weekHistory.length === 0) return null;
    const active = weekHistory.filter((d) => d.dueCount > 0);
    if (active.length === 0) return null;
    return Math.round(active.reduce((sum, d) => sum + (d.completedCount / d.dueCount) * 100, 0) / active.length);
  }, [weekHistory]);

  function dayCount(day: DayKey) {
    return sorted.filter((r) => appliesToDay(r, day)).length;
  }

  function getRitualStreak(id: string): boolean[] {
    return last7.map((date) => ritualCompletions.some((c) => c.ritualId === id && c.date === date));
  }

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function renderCard(ritual: Ritual) {
    const dot = ritual.color ? COLOR_DOT[ritual.color] : "bg-neutral-300 dark:bg-neutral-600";
    const ringBorder = ritual.color ? COLOR_RING_BORDER[ritual.color] : "border-neutral-300 dark:border-neutral-600";
    const dayLabel = ritual.repeatDays && ritual.repeatDays.length > 0
      ? ritual.repeatDays.map((d) => DAY_SHORT[d]).join(" · ")
      : "Every day";
    const done = completedIds.has(ritual.id);
    const streak = getRitualStreak(ritual.id);

    return (
      <div className={`rounded-2xl border bg-white dark:bg-neutral-900 transition-all duration-200 ${
        done
          ? "border-neutral-100 opacity-50 dark:border-white/[0.04]"
          : "border-neutral-200 dark:border-white/[0.08]"
      }`}>
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Completion button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.82 }}
            onClick={() => { haptic("light"); onToggleComplete(ritual.id); }}
            className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
              done ? "border-transparent bg-green-500" : `${ringBorder} bg-transparent`
            }`}
          >
            {done && <IconCheck size={12} strokeWidth={2.5} className="text-white" />}
          </motion.button>

          {/* Text block */}
          <button
            type="button"
            onClick={() => { haptic("light"); setEditRitual(ritual); }}
            className="min-w-0 flex-1 text-left"
          >
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <p className={`text-[15px] font-semibold leading-tight ${
                done
                  ? "text-neutral-400 line-through decoration-neutral-300 dark:text-neutral-500"
                  : "text-neutral-900 dark:text-white"
              }`}>{ritual.title}</p>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 pl-3.5">
              <span className="text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">{ritual.time}</span>
              {ritual.duration && (
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">· {ritual.duration}m</span>
              )}
              <span className="text-[11px] text-neutral-400 dark:text-neutral-500">· {dayLabel}</span>
            </div>
            <div className="mt-1 flex items-center gap-[3px] pl-3.5">
              {streak.map((hit, i) => (
                <span key={i} className={`h-[4px] w-[4px] rounded-full transition-colors ${hit ? dot : "bg-black/10 dark:bg-white/15"}`} />
              ))}
            </div>
          </button>

          {/* Desktop-only delete */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.84 }}
            onClick={() => onDelete(ritual.id)}
            className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-neutral-300 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:text-neutral-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          >
            <IconTrash size={13} strokeWidth={2} />
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="px-4 pb-6 pt-6 lg:px-0 lg:pb-6 lg:pt-5">

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

        {/* ── Day filter strip ─────────────────────────────────────────────── */}
        {rituals.length > 0 && (
          <div className="mb-4 grid grid-cols-7 gap-1.5">
            {DAYS.map((day) => {
              const sel = selectedDay === day;
              const isToday = day === todayKey;
              const count = dayCount(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={`relative flex w-full flex-col items-center rounded-xl py-1.5 transition-colors ${
                    sel
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                      : "border border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20 dark:hover:text-neutral-200"
                  }`}
                >
                  <span className="text-[12px] font-semibold leading-none">{DAY_SHORT[day]}</span>
                  <span className={`mt-0.5 text-[10px] tabular-nums leading-none ${sel ? "text-white/70 dark:text-neutral-900/60" : "text-neutral-400 dark:text-neutral-600"}`}>
                    {count}
                  </span>
                  {isToday && (
                    <span className={`absolute -bottom-[3px] left-1/2 -translate-x-1/2 h-[3px] w-[3px] rounded-full ${sel ? "bg-white/80 dark:bg-neutral-900/70" : "bg-neutral-400 dark:bg-neutral-500"}`} />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Progress bar (today / all only, mobile) ──────────────────────── */}
        {total > 0 && showProgress && (
          <div className="mb-4 lg:hidden">
            <div className="mb-1.5 flex items-center justify-between">
              <span className={`${typography.caption} font-semibold`}>
                {allDone ? "All done today 🎉" : `${completedToday} of ${total} done`}
              </span>
              <span className="text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-white/[0.06]">
              <motion.div
                className={`h-full rounded-full ${allDone ? "bg-emerald-500" : "bg-neutral-500 dark:bg-neutral-400"}`}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        )}

        {/* ── Desktop stat tiles ───────────────────────────────────────────── */}
        {rituals.length > 0 && (
          <div className="hidden lg:grid lg:grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Showing</p>
              <p className="mt-1 text-[28px] font-black tabular-nums leading-none text-neutral-900 dark:text-white">{total}</p>
              <p className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500">for {DAY_SHORT[selectedDay]}</p>
            </div>
            <div className={`rounded-2xl border px-4 py-3.5 ${allDone && showProgress ? "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07]" : "border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900"}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Today</p>
              <p className={`mt-1 text-[28px] font-black tabular-nums leading-none ${allDone && showProgress ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-900 dark:text-white"}`}>
                {pct}<span className="text-[16px] font-bold">%</span>
              </p>
              <p className={`mt-0.5 text-[12px] ${allDone && showProgress ? "text-emerald-600/70 dark:text-emerald-500/70" : "text-neutral-400 dark:text-neutral-500"}`}>
                {completedToday} of {total} done
              </p>
            </div>
            {weekAvg !== null ? (
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">7-day avg</p>
                <p className="mt-1 text-[28px] font-black tabular-nums leading-none text-neutral-900 dark:text-white">
                  {weekAvg}<span className="text-[16px] font-bold">%</span>
                </p>
                <p className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500">completion rate</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3.5 dark:border-white/[0.08] dark:bg-neutral-900">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">Streak</p>
                <p className="mt-1 text-[28px] font-black tabular-nums leading-none text-neutral-900 dark:text-white">—</p>
                <p className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500">complete more days</p>
              </div>
            )}
          </div>
        )}

        {/* ── Empty state (no rituals at all) ──────────────────────────────── */}
        {rituals.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 pt-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-neutral-100 dark:bg-white/[0.06]">
              <IconRepeat {...ICON.hero} className="text-neutral-400 dark:text-neutral-500" />
            </div>
            <div>
              <p className="text-[16px] font-semibold text-neutral-700 dark:text-neutral-200">No routines yet</p>
              <p className="mt-1.5 max-w-[240px] text-[14px] leading-relaxed text-neutral-400">
                Add small daily practices — skincare, vitamins, stretching — and track them each day.
              </p>
            </div>
            <motion.button type="button" whileTap={{ scale: 0.96 }}
              onClick={() => { haptic("medium"); onAddOpenChange(true); }}
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-[14px] font-semibold text-white dark:bg-white dark:text-neutral-950"
            >
              <IconPlus {...ICON.action} /> Add First Routine
            </motion.button>
          </motion.div>
        )}

        {/* ── Empty filter state ───────────────────────────────────────────── */}
        {rituals.length > 0 && filteredRituals.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">
              No routines for {DAY_SHORT[selectedDay]}
            </p>
            <button type="button" onClick={() => onAddOpenChange(true)}
              className="mt-1 text-[13px] font-semibold text-neutral-400 underline underline-offset-2 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              Add one
            </button>
          </motion.div>
        )}

        {/* ── Mobile: flat list ─────────────────────────────────────────────── */}
        <div className="space-y-2 lg:hidden">
          <AnimatePresence initial={false}>
            {filteredRituals.map((ritual) => (
              <motion.div
                key={ritual.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
              >
                {renderCard(ritual)}
              </motion.div>
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
                    <motion.div
                      key="content"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2">
                        {group.map((ritual) => (
                          <div key={ritual.id}>{renderCard(ritual)}</div>
                        ))}
                      </div>
                    </motion.div>
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
        onDelete={() => { if (editRitual) { onDelete(editRitual.id); setEditRitual(null); } }}
      />
    </>
  );
}
