"use client";

import { useState } from "react";
import { IconChevronDown, IconSettings } from "@tabler/icons-react";
import Button from "@/components/ui/Button";
import Pill from "@/components/ui/Pill";
import WeekdayPicker from "@/components/ui/WeekdayPicker";
import TimeInput from "@/components/ui/TimeInput";
import { FORM_INPUT_CLASS, FORM_LABEL } from "@/components/ui/Input";
import { runInputsPatchError } from "@/lib/runPlan";
import { InternalSectionTitle, SectionIconButton } from "@/components/ui/InternalSectionTitle";
import type { DayKey, Plan, RunPlanInputs, Schedule, Session } from "@/lib/useScheduleDB";
import { actualFor, formatDistance, formatPace, headline, paceSecPerKm, plannedDistanceM, sessionState } from "@/lib/sessions";
import { pendingAdjustment, planWeekIndex, plannedAvgPace } from "@/lib/runAdjustments";
import AdjustmentCard from "./AdjustmentCard";
import { GUIDANCE } from "./RunPlanSetupSheet";

export interface PlanSessionsSectionProps {
  schedule: Schedule;
  plan: Plan;
  todayISO: string;
  onOpenSession: (sessionId: string) => void;
  onDecide?: (adjustmentId: string, decision: "accepted" | "held") => void;
  onUpdateInputs?: (patch: Partial<Pick<RunPlanInputs, "runDays" | "startTime" | "targetPaceSecPerKm">>) => void;
}

const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });

/** A generated plan, week by week: planned against actual, the pace trend, and any open suggestion. */
export default function PlanSessionsSection({ schedule, plan, todayISO, onOpenSession, onDecide, onUpdateInputs }: PlanSessionsSectionProps) {
  const sessions = (schedule.sessions ?? []).filter((s) => s.planId === plan.id).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const currentWeek = planWeekIndex(plan, todayISO);
  const [openWeeks, setOpenWeeks] = useState<Set<number>>(() => new Set([currentWeek]));
  const [editing, setEditing] = useState(false);
  const [days, setDays] = useState<DayKey[]>(plan.generator?.inputs.runDays ?? []);
  const [time, setTime] = useState(plan.generator?.inputs.startTime ?? "");
  const startPace = plan.generator?.inputs.targetPaceSecPerKm;
  const [paceMin, setPaceMin] = useState(startPace ? String(Math.floor(startPace / 60)) : "");
  const [paceSec, setPaceSec] = useState(startPace ? String(startPace % 60).padStart(2, "0") : "");
  // Blank target pace = just finish; time blank = any time (sent as a cleared key).
  const targetPace = paceMin.trim() === "" ? undefined : Number(paceMin) * 60 + (paceSec.trim() === "" ? 0 : Number(paceSec));
  const patch = { runDays: days, startTime: time || undefined, targetPaceSecPerKm: targetPace };
  const editError = plan.generator ? runInputsPatchError(plan.generator.inputs, patch) : null;
  const pending = pendingAdjustment(schedule, plan.id);
  const easyPace = plan.generator?.inputs.easyPaceSecPerKm ?? 360;

  const weeks = new Map<number, Session[]>();
  for (const s of sessions) {
    const k = s.generated?.weekIndex ?? planWeekIndex(plan, s.dateISO);
    weeks.set(k, [...(weeks.get(k) ?? []), s]);
  }

  const timed = sessions
    .map((s) => ({ s, log: actualFor(schedule, s.id) }))
    .filter((x) => x.log?.actual && x.log.source !== "mark")
    .slice(-6);

  const toggleWeek = (k: number) =>
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <section>
      <InternalSectionTitle
        title="Runs"
        className="mb-4"
        actions={
          onUpdateInputs ? (
            <SectionIconButton label="Edit run days" onClick={() => setEditing((v) => !v)} icon={<IconSettings size={16} strokeWidth={2} />} />
          ) : undefined
        }
      />

      {pending && onDecide && (
        <div className="mb-4">
          <AdjustmentCard adjustment={pending} onDecide={(d) => onDecide(pending.id, d)} />
        </div>
      )}

      {editing && onUpdateInputs && (
        <div className="mb-4 space-y-3 rounded-2xl border border-neutral-200/70 p-4 dark:border-white/[0.07]">
          <div>
            <span className={FORM_LABEL}>Run days</span>
            <WeekdayPicker selected={days} onChange={setDays} allowEmpty />
          </div>
          <TimeInput label="Usual time" value={time} onChange={setTime} />
          <div>
            <span className={FORM_LABEL}>Target pace (blank to just finish)</span>
            <div className="flex items-center gap-2">
              <input aria-label="Target pace minutes" inputMode="numeric" value={paceMin} onChange={(e) => setPaceMin(e.target.value)} className={FORM_INPUT_CLASS} />
              <span className="text-[16px] font-bold text-neutral-500" aria-hidden>:</span>
              <input aria-label="Target pace seconds" inputMode="numeric" value={paceSec} onChange={(e) => setPaceSec(e.target.value)} className={FORM_INPUT_CLASS} />
              <span className="shrink-0 text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">/km</span>
            </div>
          </div>
          <p className="text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">Runs you've done, moved yourself or have today stay as they are.</p>
          {editError && <p role="alert" className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">{editError}</p>}
          <Button
            variant="primary"
            fullWidth
            disabled={!!editError}
            onClick={() => {
              onUpdateInputs(patch);
              setEditing(false);
            }}
          >
            Update plan
          </Button>
        </div>
      )}

      {timed.length > 0 && (
        <div className="mb-4 rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-white/[0.07] dark:bg-neutral-900">
          <p className="text-[14px] font-bold text-neutral-900 dark:text-white">Pace</p>
          <ul className="mt-2 space-y-1.5">
            {timed.map(({ s, log }) => {
              const pace = paceSecPerKm(log!.actual!);
              const delta = pace - plannedAvgPace(s, easyPace);
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate font-medium text-neutral-700 dark:text-neutral-300">{shortDate(s.dateISO)} · {s.title}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-neutral-900 dark:text-white">
                    {formatPace(pace)}
                    <span className="ml-1.5 font-medium text-neutral-500 dark:text-neutral-400">
                      {Math.abs(delta) < 3 ? "on plan" : delta < 0 ? `${-delta} s faster` : `${delta} s slower`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        {[...weeks.entries()].sort((a, b) => a[0] - b[0]).map(([k, list]) => {
          const counted = list.filter((s) => s.status !== "skipped");
          const done = counted.filter((s) => s.status === "done").length;
          const plannedKm = list.reduce((n, s) => n + plannedDistanceM(s), 0);
          const ranKm = list.reduce((n, s) => n + (actualFor(schedule, s.id)?.actual?.distanceM ?? 0), 0);
          const open = openWeeks.has(k);
          return (
            <div key={k} className="rounded-2xl border border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleWeek(k)}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold text-neutral-900 dark:text-white">
                    Week {k}{k === currentWeek ? " · this week" : ""}
                  </span>
                  <span className="block text-[12.5px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
                    {done} of {counted.length} done · planned {formatDistance(plannedKm)}{ranKm > 0 ? ` · ran ${formatDistance(ranKm)}` : ""}
                  </span>
                </span>
                <IconChevronDown size={18} strokeWidth={2} className={`shrink-0 text-neutral-500 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <ul className="border-t border-neutral-200/70 px-2 py-1 dark:border-white/[0.07]">
                  {list.map((s) => {
                    const st = sessionState(s, todayISO);
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => onOpenSession(s.id)}
                          className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left active:bg-neutral-50 dark:active:bg-white/[0.03]"
                        >
                          <span className="min-w-0">
                            <span className="block text-[13.5px] font-semibold text-neutral-900 dark:text-white">{shortDate(s.dateISO)} · {s.title}</span>
                            <span className="block truncate text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">{headline(s)}</span>
                          </span>
                          {st === "done" ? <Pill variant="success" size="sm">Done</Pill> : st === "missed" ? <Pill variant="danger" size="sm">Missed</Pill> : st === "skipped" ? <Pill variant="subtle" size="sm">Skipped</Pill> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{GUIDANCE}</p>
    </section>
  );
}
