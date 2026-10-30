"use client";

/**
 * Full-height Routine detail page.
 *
 * Built around the same simple loop as the list row: mark today done with one
 * tap, then — if you like — say how closely you followed it. Everything else
 * is support: the plan itself (the meals and their times, the goal, the
 * steps), optional logging for routines measured in amounts, and the record
 * (streaks, how many times in the last 30 days, how closely followed).
 *
 * Mounted `dynamic(..., { ssr: false })` by both shells, matching
 * TaskDetailView — this reads `window`/IndexedDB-backed state.
 */
import { useMemo, useState } from "react";
import { IconEdit, IconTrash, IconCheck, IconPlus, IconMinus, IconFlame, IconTrophy, IconX } from "@tabler/icons-react";
import type { Milestone, Ritual, RitualCompletion } from "@/lib/useScheduleDB";
import { todayISO } from "@/lib/dateUtils";
import { haptic } from "@/lib/haptics";
import { calculateRitualStats } from "@/lib/consistency/calculateRitualStreak";
import { entriesForRitualDate } from "@/lib/ritualCompletions";
import { ritualDayProgress } from "@/lib/consistency/ritualDayStatus";
import { buildRitualMonthDays } from "@/lib/consistency/ritualCalendar";
import { quickAmountsForRitual } from "@/lib/quickAmounts";
import { describeRecurrence } from "@/lib/ritualRecurrence";
import { followedPhrase, formatAmount, routineDetailItems, routineGoalLabel, routineWhenLabel } from "@/lib/routineDetails";
import { iconGlyph, getIconPickerStyle } from "@/components/SectionIcons";
import DetailHeader from "@/components/ui/DetailHeader";
import ProgressBar from "@/components/ui/ProgressBar";
import RoutineMonthCalendar from "@/components/activity/RoutineMonthCalendar";
import FollowedPicker from "@/components/activity/FollowedPicker";
import { CARD, SOFT_PANEL } from "@/components/ui/surfaces";
import MilestoneLinks from "@/components/milestone/MilestoneLinks";
import type { MilestoneLinkKind } from "@/lib/milestoneLinks";

interface RoutineDetailViewProps {
  ritual: Ritual;
  ritualCompletions: RitualCompletion[];
  /** Settings → Tracking → "Tracking starts" (schedule.preferences?.startDate). */
  trackingStart?: string;
  onBack: () => void;
  /** Mark today done, rated 1–100 for how closely it was followed. */
  onMarkDone: (followed: number) => void;
  onUnmarkDone: () => void;
  onLogAmount: (amount: number) => void;
  onUndoLastLog: () => void;
  onRemoveLog: (entryId: string) => void;
  onToggleStep: (stepId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Every milestone — shows which ones this routine advances. Absent = hidden. */
  milestones?: readonly Milestone[];
  onSetMilestoneLink?: (milestoneId: string, kind: MilestoneLinkKind, itemId: string, linked: boolean) => void;
}

const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400";

export default function RoutineDetailView({
  ritual,
  ritualCompletions,
  trackingStart,
  onBack,
  onMarkDone,
  onUnmarkDone,
  onLogAmount,
  onUndoLastLog,
  onRemoveLog,
  onToggleStep,
  onEdit,
  onDelete,
  milestones,
  onSetMilestoneLink,
}: RoutineDetailViewProps) {
  const [customValue, setCustomValue] = useState("");
  const today = todayISO();
  const now = new Date(`${today}T00:00:00`);
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const trackingType = ritual.trackingType ?? "checkbox";
  const measured = trackingType === "quantity" || trackingType === "duration" || trackingType === "count";
  const tickable = trackingType === "checklist";
  const todaysEntries = entriesForRitualDate(ritualCompletions, ritual.id, today);
  const loggedEntries = todaysEntries.filter((e) => e.value !== undefined);
  const progress = ritualDayProgress(ritual, todaysEntries);
  const stats = calculateRitualStats(ritual, ritualCompletions, today, trackingStart);
  const quickAmounts = quickAmountsForRitual(ritual);
  const items = routineDetailItems(ritual);
  const goal = routineGoalLabel(ritual);
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

  const unit = ritual.unit ? ` ${ritual.unit}` : "";
  const hasPlan = items.length > 0 || !!goal || !!ritual.duration || !!ritual.notes;

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
              <Glyph size={22} strokeWidth={1.8} className={ritual.icon ? iconStyle.text : "text-neutral-500 dark:text-neutral-400"} />
            </span>
            <div className="min-w-0">
              {ritual.description && (
                <p className="text-[13px] leading-snug text-neutral-600 dark:text-neutral-300">{ritual.description}</p>
              )}
              <p className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                {routineWhenLabel(ritual)} · {describeRecurrence(ritual)}
              </p>
            </div>
          </div>

          {/* ── Today: one tap, then how closely ─────────────────────────── */}
          <div data-testid="routine-today" className={`space-y-3 p-4 ${CARD}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className={EYEBROW}>Today</p>
                <p className={`mt-1 text-[18px] font-black leading-tight ${progress.complete ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-950 dark:text-white"}`}>
                  {progress.complete ? "Done" : "Not done yet"}
                </p>
                {progress.complete && progress.followed !== null && (
                  <p className="mt-0.5 text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
                    {followedPhrase(progress.followed).replace(/^./, (c) => c.toUpperCase())}
                  </p>
                )}
                {!progress.complete && progress.followed !== null && (
                  <p className="mt-0.5 text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
                    {progress.followed}% so far
                  </p>
                )}
              </div>
              {!progress.complete ? (
                <button
                  type="button"
                  onClick={() => { haptic("medium"); onMarkDone(100); }}
                  className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-neutral-950 px-5 text-[14px] font-extrabold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200"
                >
                  <IconCheck size={17} strokeWidth={2.8} />
                  Mark done
                </button>
              ) : progress.markedDone ? (
                <button
                  type="button"
                  onClick={() => { haptic("light"); onUnmarkDone(); }}
                  className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-4 text-[13px] font-bold text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-white/[0.12] dark:text-neutral-200 dark:hover:bg-white/[0.05]"
                >
                  <IconX size={14} strokeWidth={2.4} />
                  Mark not done
                </button>
              ) : null}
            </div>

            {progress.complete && (
              <FollowedPicker
                prompt="How closely did you follow it?"
                value={progress.followed}
                routineTitle={ritual.title}
                onChange={(pct) => onMarkDone(pct)}
              />
            )}
          </div>

          {/* ── The plan — reference detail, never a gate ───────────────── */}
          {hasPlan && (
            <div data-testid="routine-plan" className={`space-y-3 p-4 ${CARD}`}>
              <p className={EYEBROW}>The plan</p>

              {(goal || ritual.duration) && (
                <div className="flex flex-wrap gap-1.5">
                  {goal && (
                    <span className="rounded-full border border-neutral-200 px-3 py-1 text-[12px] font-bold text-neutral-700 dark:border-white/[0.10] dark:text-neutral-200">{goal}</span>
                  )}
                  {ritual.duration ? (
                    <span className="rounded-full border border-neutral-200 px-3 py-1 text-[12px] font-bold text-neutral-700 dark:border-white/[0.10] dark:text-neutral-200">About {ritual.duration} min</span>
                  ) : null}
                </div>
              )}

              {items.length > 0 && (
                <div>
                  {tickable && (
                    <p className="mb-1.5 text-[12px] text-neutral-500 dark:text-neutral-400">
                      Tick them off as you go if it helps — marking the day done covers all of them.
                    </p>
                  )}
                  <ul className={`divide-y divide-neutral-100 overflow-hidden ${SOFT_PANEL} dark:divide-white/[0.06]`}>
                    {items.map((item) => {
                      const ticked = tickable && todaysEntries.some((e) => e.stepId === item.id);
                      const row = (
                        <>
                          {tickable && (
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${ticked ? "border-transparent bg-green-500" : "border-neutral-300 dark:border-neutral-600"}`}>
                              {ticked && <IconCheck size={14} strokeWidth={3} className="text-white" />}
                            </span>
                          )}
                          {item.time && (
                            <span className="w-[68px] shrink-0 text-[12px] font-bold tabular-nums text-neutral-500 dark:text-neutral-400">{item.time}</span>
                          )}
                          <span className={`min-w-0 flex-1 text-[14px] font-semibold tabular-nums ${ticked ? "text-neutral-500 dark:text-neutral-400" : "text-neutral-800 dark:text-neutral-100"}`}>
                            {item.label}
                          </span>
                        </>
                      );
                      return (
                        <li key={item.id}>
                          {tickable ? (
                            <button
                              type="button"
                              aria-pressed={ticked}
                              onClick={() => { haptic("light"); onToggleStep(item.id); }}
                              className="flex min-h-[44px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-neutral-100/60 dark:hover:bg-white/[0.04]"
                            >
                              {row}
                            </button>
                          ) : (
                            <div className="flex min-h-[44px] items-center gap-3 px-3 py-2">{row}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {ritual.notes && (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-300">{ritual.notes}</p>
              )}
            </div>
          )}

          {/* ── Optional amounts, for routines measured that way ─────────── */}
          {measured && (
            <div className={`space-y-3 p-4 ${CARD}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className={EYEBROW}>Log an amount <span className="normal-case tracking-normal font-semibold text-neutral-500 dark:text-neutral-400">· optional</span></p>
                <p className="text-[13px] font-bold tabular-nums text-neutral-700 dark:text-neutral-200">
                  {formatAmount(progress.value)}{ritual.target ? ` / ${formatAmount(ritual.target)}` : ""}{unit}
                </p>
              </div>
              {ritual.target ? (
                <ProgressBar
                  pct={Math.min(100, Math.round((progress.value / ritual.target) * 100))}
                  height={6}
                  fillClassName="bg-green-500"
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                {progress.value > 0 && (
                  <button
                    type="button"
                    onClick={() => { haptic("light"); onUndoLastLog(); }}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-neutral-200 text-neutral-500 dark:border-white/[0.10] dark:text-neutral-400"
                    aria-label="Undo last amount"
                  >
                    <IconMinus size={15} strokeWidth={2.4} />
                  </button>
                )}
                {quickAmounts.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => { haptic("medium"); onLogAmount(amount); }}
                    aria-label={`Log ${formatAmount(amount)}${unit}`}
                    className="flex h-11 items-center gap-1 rounded-full border border-neutral-200 px-3.5 text-[13px] font-bold text-neutral-700 hover:bg-neutral-50 dark:border-white/[0.10] dark:text-neutral-200 dark:hover:bg-white/[0.05]"
                  >
                    <IconPlus size={12} strokeWidth={2.6} />
                    {formatAmount(amount)}{unit}
                  </button>
                ))}
                <div className="flex h-11 items-center gap-1 rounded-full border border-neutral-200 pl-3.5 pr-1 dark:border-white/[0.10]">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCustomLog(); }}
                    placeholder="Other"
                    aria-label="Other amount"
                    className="w-16 bg-transparent text-[13px] font-semibold text-neutral-800 outline-none placeholder:text-neutral-500 dark:text-neutral-100 dark:placeholder:text-neutral-400"
                  />
                  <button
                    type="button"
                    onClick={handleCustomLog}
                    disabled={!customValue}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 disabled:opacity-30 dark:text-neutral-400"
                    aria-label="Log other amount"
                  >
                    <IconPlus size={14} strokeWidth={2.4} />
                  </button>
                </div>
              </div>

              {/* What was logged today — amounts only. When in the day each one
                  happened isn't the point of a routine. */}
              {loggedEntries.length > 0 && (
                <ul aria-label="Logged today" className="flex flex-wrap gap-1.5">
                  {loggedEntries.map((entry, i) => (
                    <li key={entry.id ?? `${entry.date}-${i}`} className="flex h-8 items-center gap-1 rounded-full bg-neutral-100 pl-3 pr-1 text-[12px] font-bold tabular-nums text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-200">
                      {formatAmount(entry.value ?? 0)}{unit}
                      {entry.id && (
                        <button
                          type="button"
                          onClick={() => onRemoveLog(entry.id!)}
                          aria-label={`Remove ${formatAmount(entry.value ?? 0)}${unit}`}
                          className="relative flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 before:absolute before:-inset-2.5 before:content-[''] hover:text-rose-600 dark:text-neutral-400 dark:hover:text-rose-400"
                        >
                          <IconX size={12} strokeWidth={2.4} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── What this routine advances ───────────────────────────────── */}
          {milestones && onSetMilestoneLink && (
            <MilestoneLinks
              className={`p-4 ${CARD}`}
              milestones={milestones}
              kind="ritual"
              itemId={ritual.id}
              onSetLink={onSetMilestoneLink}
            />
          )}

          {/* ── The record ───────────────────────────────────────────────── */}
          <div className={`space-y-3 p-4 ${CARD}`}>
            <p className={EYEBROW}>Consistency</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
              <div>
                <p className="flex items-center gap-1 text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">
                  <IconFlame size={15} strokeWidth={2.4} className="text-emerald-600 dark:text-emerald-400" /> {stats.streak}
                </p>
                <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Current streak</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">
                  <IconTrophy size={15} strokeWidth={2.2} className="text-amber-600 dark:text-amber-400" /> {stats.bestStreak}
                </p>
                <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Best streak</p>
              </div>
              <div>
                <p className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.timesDone}×</p>
                <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Done · last 30 days</p>
              </div>
              <div>
                <p className="text-[18px] font-black tabular-nums text-neutral-950 dark:text-white">{stats.followedPct}%</p>
                <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Followed · last 30 days</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-1.5 pt-1" aria-hidden="true">
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
        </div>
      </div>
    </div>
  );
}
