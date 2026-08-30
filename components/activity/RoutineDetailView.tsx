"use client";

/**
 * Full-height Routine detail page — adapts its top section to the routine's
 * trackingType (quantity/duration/count: progress + quick-add + entry list;
 * checkbox: today's status; checklist: step list), with the same
 * streak/best-streak/adherence/dots consistency block underneath every type.
 *
 * Mounted `dynamic(..., { ssr: false })` by both shells, matching
 * TaskDetailView — this reads `window`/IndexedDB-backed state.
 */
import { useMemo, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { IconEdit, IconTrash, IconCheck, IconPlus, IconMinus, IconFlame, IconTrophy } from "@tabler/icons-react";
import type { Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { todayISO } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import { calculateRitualStats } from "@/lib/consistency/calculateRitualStreak";
import { entriesForRitualDate, sumRitualDate } from "@/lib/ritualCompletions";
import { ritualDayProgress } from "@/lib/consistency/ritualDayStatus";
import { buildRitualMonthDays } from "@/lib/consistency/ritualCalendar";
import { quickAmountsForRitual } from "@/lib/quickAmounts";
import { describeRecurrence } from "@/lib/ritualRecurrence";
import { iconGlyph, getIconPickerStyle } from "@/components/SectionIcons";
import DetailHeader from "@/components/ui/DetailHeader";
import ProgressBar from "@/components/ui/ProgressBar";
import RoutineMonthCalendar from "@/components/activity/RoutineMonthCalendar";
import { CARD, SOFT_PANEL } from "@/components/ui/surfaces";
import { formatDisplayTime } from "@/lib/timeUtils";

interface RoutineDetailViewProps {
  ritual: Ritual;
  ritualCompletions: RitualCompletion[];
  /** Settings → Tracking → "Tracking starts" (schedule.preferences?.startDate). */
  trackingStart?: string;
  onBack: () => void;
  onToggleCheckbox: () => void;
  onLogAmount: (amount: number) => void;
  onUndoLastLog: () => void;
  onRemoveLog: (entryId: string) => void;
  onToggleStep: (stepId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function timeOfDay(timestamp: string | undefined): string {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return formatDisplayTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
}

export default function RoutineDetailView({
  ritual,
  ritualCompletions,
  trackingStart,
  onBack,
  onToggleCheckbox,
  onLogAmount,
  onUndoLastLog,
  onRemoveLog,
  onToggleStep,
  onEdit,
  onDelete,
}: RoutineDetailViewProps) {
  const [customValue, setCustomValue] = useState("");
  const today = todayISO();
  const now = new Date(`${today}T00:00:00`);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const trackingType = ritual.trackingType ?? "checkbox";
  const todaysEntries = entriesForRitualDate(ritualCompletions, ritual.id, today);
  const progress = ritualDayProgress(ritual, todaysEntries);
  const stats = calculateRitualStats(ritual, ritualCompletions, today, trackingStart);
  const quickAmounts = quickAmountsForRitual(ritual);
  const iconStyle = getIconPickerStyle(ritual.icon ?? "");
  const Glyph = iconGlyph(ritual.icon ?? "");
  const calendarDays = useMemo(
    () => buildRitualMonthDays(ritual, ritualCompletions, calYear, calMonth, today, trackingStart),
    [ritual, ritualCompletions, calYear, calMonth, today, trackingStart],
  );

  function prevCalMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }
  function nextCalMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  function handleCustomLog() {
    const value = parseFloat(customValue);
    if (!Number.isFinite(value) || value <= 0) return;
    haptic("medium");
    onLogAmount(value);
    setCustomValue("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F5F5F5] dark:bg-[#0E0E0E]">
      <DetailHeader
        title={ritual.title}
        onBack={onBack}
        actions={[
          { icon: IconEdit, label: "Edit routine", onClick: onEdit },
          { icon: IconTrash, label: "Delete routine", onClick: onDelete, destructive: true },
        ]}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto w-full max-w-lg space-y-5">

          {/* ── Identity ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${ritual.icon ? iconStyle.tint : "bg-neutral-100 dark:bg-white/[0.06]"}`}>
              <Glyph size={22} strokeWidth={1.8} className={ritual.icon ? iconStyle.text : "text-neutral-400"} />
            </span>
            <div className="min-w-0">
              {ritual.description && (
                <p className="truncate text-[13px] text-neutral-500 dark:text-neutral-400">{ritual.description}</p>
              )}
              <p className="text-[12px] font-medium text-neutral-400 dark:text-neutral-500">
                {ritual.anyTime ? "Anytime" : formatDisplayTime(ritual.time)} · {describeRecurrence(ritual)}
              </p>
            </div>
          </div>

          {/* ── Today's progress — adaptive by trackingType ─────────────────── */}
          <div className={`overflow-hidden ${CARD}`}>
            <p className="px-4 pt-4 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              Today&apos;s progress
            </p>

            {(trackingType === "quantity" || trackingType === "duration" || trackingType === "count") && (
              <div className="space-y-3 px-4 pb-4 pt-2">
                <div className="flex items-baseline justify-between">
                  <p className="text-[22px] font-black tabular-nums text-neutral-950 dark:text-white">
                    {progress.value}
                    <span className="text-[14px] font-semibold text-neutral-400 dark:text-neutral-500"> / {ritual.target ?? "–"}{ritual.unit ? ` ${ritual.unit}` : ""}</span>
                  </p>
                  {progress.complete && (
                    <span className="flex items-center gap-1 text-[12px] font-bold text-emerald-600 dark:text-emerald-400">
                      <IconCheck size={13} strokeWidth={2.6} /> Done
                    </span>
                  )}
                </div>
                <ProgressBar
                  pct={ritual.target ? Math.min(100, Math.round((progress.value / ritual.target) * 100)) : (progress.value > 0 ? 100 : 0)}
                  height={8}
                  fillClassName="bg-green-500"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {progress.value > 0 && (
                    <button
                      type="button"
                      onClick={() => { haptic("light"); onUndoLastLog(); }}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 text-neutral-400 dark:border-white/[0.10] dark:text-neutral-500"
                      aria-label="Undo last log"
                    >
                      <IconMinus size={15} strokeWidth={2.4} />
                    </button>
                  )}
                  {quickAmounts.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => { haptic("medium"); onLogAmount(amount); }}
                      className="flex h-9 items-center gap-1 rounded-full border border-neutral-200 px-3 text-[12px] font-bold text-neutral-700 hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-200 dark:hover:bg-white/[0.05]"
                    >
                      <IconPlus size={12} strokeWidth={2.6} />
                      {amount}{ritual.unit ? ` ${ritual.unit}` : ""}
                    </button>
                  ))}
                  <div className="flex h-9 items-center gap-1 rounded-full border border-neutral-200 pl-3 pr-1 dark:border-white/[0.10]">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCustomLog(); }}
                      placeholder="Custom"
                      className="w-16 bg-transparent text-[12px] font-semibold text-neutral-800 outline-none placeholder:text-neutral-400 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={handleCustomLog}
                      disabled={!customValue}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-500 disabled:opacity-30 dark:text-neutral-400"
                      aria-label="Log custom amount"
                    >
                      <IconPlus size={14} strokeWidth={2.4} />
                    </button>
                  </div>
                </div>

                {todaysEntries.length > 0 && (
                  <div className={`mt-1 divide-y divide-neutral-100 overflow-hidden ${SOFT_PANEL} dark:divide-white/[0.06]`}>
                    {todaysEntries.map((entry) => (
                      <div key={entry.id ?? `${entry.date}-${entry.value}`} className="flex items-center justify-between px-3 py-2">
                        <span className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{timeOfDay(entry.timestamp)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-bold tabular-nums text-neutral-800 dark:text-neutral-100">
                            {entry.value}{ritual.unit ? ` ${ritual.unit}` : ""}
                          </span>
                          {entry.id && (
                            <button
                              type="button"
                              onClick={() => onRemoveLog(entry.id!)}
                              aria-label="Delete entry"
                              className="text-neutral-300 hover:text-rose-500 dark:text-neutral-600 dark:hover:text-rose-400"
                            >
                              <IconTrash size={13} strokeWidth={2} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(trackingType === "checklist" || trackingType === "times") && (
              <div className="space-y-1.5 px-4 pb-4 pt-2">
                {(ritual.steps ?? []).length === 0 ? (
                  <p className="py-2 text-[13px] text-neutral-400 dark:text-neutral-500">
                    {trackingType === "times" ? "No times yet — edit this routine to add some." : "No steps yet — edit this routine to add some."}
                  </p>
                ) : (
                  ritual.steps!.map((step) => {
                    const done = todaysEntries.some((e) => e.stepId === step.id);
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => { haptic("light"); onToggleStep(step.id); }}
                        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                      >
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${done ? "border-transparent bg-green-500" : "border-neutral-300 dark:border-neutral-600"}`}>
                          {done && <IconCheck size={14} strokeWidth={3} className="text-white" />}
                        </span>
                        <span className={`text-[14px] font-semibold tabular-nums ${done ? "text-neutral-400 line-through dark:text-neutral-500" : "text-neutral-800 dark:text-neutral-100"}`}>
                          {trackingType === "times" ? formatDisplayTime(step.label) : step.label}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {trackingType === "checkbox" && (
              <div className="px-4 pb-4 pt-2">
                <div className="flex items-center justify-between">
                  <p className={`text-[16px] font-bold ${progress.complete ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400 dark:text-neutral-500"}`}>
                    {progress.complete ? "Completed" : "Not yet"}
                  </p>
                  <m.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { haptic("light"); onToggleCheckbox(); }}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border-[2.5px] transition-colors ${
                      progress.complete ? "border-transparent bg-green-500" : "border-neutral-300 dark:border-neutral-600"
                    }`}
                  >
                    <AnimatePresence initial={false}>
                      {progress.complete && (
                        <m.span key="c" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                          <IconCheck size={22} strokeWidth={3} className="text-white" />
                        </m.span>
                      )}
                    </AnimatePresence>
                  </m.button>
                </div>

                {/* Purely descriptive — one tap above covers all of these;
                    they're never checked off individually (that's what
                    trackingType "checklist" is for). */}
                {(ritual.steps ?? []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ritual.steps!.map((step) => (
                      <span
                        key={step.id}
                        className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[12px] font-semibold text-neutral-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300"
                      >
                        {step.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Consistency ──────────────────────────────────────────────────── */}
          <div className={`space-y-3 p-4 ${CARD}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Consistency</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="flex items-center gap-1 text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">
                  <IconFlame size={15} strokeWidth={2.4} className="text-emerald-500" /> {stats.streak}
                </p>
                <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">Current streak</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">
                  <IconTrophy size={15} strokeWidth={2.2} className="text-amber-500" /> {stats.bestStreak}
                </p>
                <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">Best streak</p>
              </div>
              <div>
                <p className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.adherencePct}%</p>
                <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">Last 30 days</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-1.5 pt-1">
              {stats.dots.map((done, i) => (
                <span
                  key={i}
                  className={`h-2 flex-1 rounded-full ${done ? "bg-green-500" : "bg-neutral-200 dark:bg-white/10"}`}
                />
              ))}
            </div>
          </div>

          <RoutineMonthCalendar
            year={calYear}
            month={calMonth}
            days={calendarDays}
            onPrevMonth={prevCalMonth}
            onNextMonth={nextCalMonth}
          />

          {ritual.notes && (
            <div className={`p-4 ${CARD}`}>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">Notes</p>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">{ritual.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
