"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlayerPause, IconPlayerPlay, IconX } from "@tabler/icons-react";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import SetTable from "@/components/activity/SetTable";
import ProgressionCard from "@/components/activity/ProgressionCard";
import type { ProgressionSuggestion } from "@/lib/subtaskProgression";
import type { ScheduleEntry } from "@/components/ScheduleItem";
import type { LoggedSet, SetLog, Task } from "@/lib/useScheduleDB";
import type { TargetValues } from "@planr/core/lib/scheduleEntry";
import {
  allStepsDone,
  currentStepId,
  formatClock,
  restRemainingSeconds,
  stepElapsedMs,
  totalElapsedMs,
  type FocusAction,
  type FocusState,
} from "@/lib/focusSession";
import { previousSetLog, setLogFor, setLogId, startingSets } from "@/lib/setLogs";
import { formatStrengthTargets, hasStrengthTargets } from "@/lib/subtaskTargets";
import { formatMinutes } from "@/lib/timeUtils";
import { haptic } from "@/lib/haptics";
import { useNowTick, useWakeLock } from "@/lib/useFocusSession";

export interface FocusFinish {
  /** One session row per subtask that logged at least one set. */
  logs: SetLog[];
  doneStepIds: string[];
}

interface FocusModeProps {
  focus: FocusState;
  dispatch: (action: FocusAction) => void;
  task: Task;
  /** The task's subtasks in step order (empty: one timer for the task). */
  items: ScheduleEntry[];
  /** The figures that apply today for a subtask. */
  valuesFor: (item: ScheduleEntry) => TargetValues;
  setLogs: readonly SetLog[] | undefined;
  /** Leave the view; the session keeps running. */
  /** A progression step ready for this subtask today, if any. */
  suggestionFor?: (item: ScheduleEntry) => ProgressionSuggestion | null;
  onDecide?: (suggestion: ProgressionSuggestion, decision: "accepted" | "held") => void;
  onHide: () => void;
  onFinish: (result: FocusFinish) => void;
}

/**
 * The full-screen execution view (PRODUCT.md: "execution over planning"):
 * one subtask, its clock, and — for a lift — its set table. The clock is the
 * single display number on the screen; it is ink, not green, because a
 * running timer is not progress. Green appears only on what is done.
 */
export default function FocusMode({ focus, dispatch, task, items, valuesFor, setLogs, suggestionFor, onDecide, onHide, onFinish }: FocusModeProps) {
  const running = focus.runningSince != null;
  const resting = focus.restEndsAt != null;
  const now = useNowTick(running || resting);
  useWakeLock(true);

  const stepId = currentStepId(focus);
  const item = stepId ? items.find((i) => i.id === stepId) ?? null : null;
  const values = item ? valuesFor(item) : {};
  const strength = !!item && (hasStrengthTargets(values) || !!focus.draftSets[item.id]);
  const previous = item ? previousSetLog(setLogs, task.id, item.id, focus.dateISO) : null;
  // A session continues what was already logged today (from the Log sets sheet
  // or an earlier focus run) rather than starting over and overwriting it.
  const todays = item ? setLogFor(setLogs, task.id, item.id, focus.dateISO) : null;
  const sets: LoggedSet[] = item ? focus.draftSets[item.id] ?? todays?.sets ?? startingSets(values, previous) : [];
  const weightUnit = values.weightUnit ?? "kg";
  const restSeconds = item?.restSeconds ?? (task.stepBufferMinutes ? task.stepBufferMinutes * 60 : 0);

  const suggestion = item && suggestionFor ? suggestionFor(item) : null;
  const restLeft = restRemainingSeconds(focus, now);
  const stepMs = stepElapsedMs(focus, now);
  const targetMs = values.minutes != null ? values.minutes * 60_000 : null;
  const everyDone = allStepsDone(focus);
  const stepDone = !!stepId && focus.doneStepIds.includes(stepId);
  const total = items.length;

  // A finished rest ends itself, with a tap of feedback.
  const lastRest = useRef(restLeft);
  useEffect(() => {
    if (resting && running && restLeft === 0 && lastRest.current > 0) {
      haptic("medium");
      dispatch({ type: "skipRest" });
    }
    lastRest.current = restLeft;
  }, [restLeft, resting, running, dispatch]);

  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onHide();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onHide]);

  /** `alsoDone` is the step whose Finish was pressed — it counts as done. */
  function finish(alsoDone?: string | null) {
    const logs: SetLog[] = [];
    for (const [subtaskId, draft] of Object.entries(focus.draftSets)) {
      if (!draft.some((s) => s.done)) continue;
      const entry = items.find((i) => i.id === subtaskId);
      logs.push({
        id: setLogId(task.id, subtaskId, focus.dateISO),
        taskId: task.id,
        subtaskId,
        dateISO: focus.dateISO,
        weightUnit: entry ? valuesFor(entry).weightUnit ?? "kg" : "kg",
        sets: draft,
        completedAt: new Date().toISOString(),
      });
    }
    const done = alsoDone && !focus.doneStepIds.includes(alsoDone) ? [...focus.doneStepIds, alsoDone] : focus.doneStepIds;
    onFinish({ logs, doneStepIds: total === 0 ? [] : done });
  }

  function completeStep() {
    haptic("medium");
    if (total === 0 || isFinalStep) return finish(stepId);
    dispatch({ type: "completeStep", now: Date.now() });
  }

  // The last undone step's primary action finishes the session outright.
  const undone = focus.stepIds.filter((id) => !focus.doneStepIds.includes(id));
  const isFinalStep = total === 0 || (undone.length === 1 && undone[0] === stepId) || everyDone;

  const upNext = useMemo(() => {
    const order = [...focus.stepIds.slice(focus.stepIndex + 1), ...focus.stepIds.slice(0, focus.stepIndex)];
    const id = order.find((sid) => !focus.doneStepIds.includes(sid));
    return id ? items.find((i) => i.id === id)?.task ?? null : null;
  }, [focus.stepIds, focus.stepIndex, focus.doneStepIds, items]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Focus: ${task.title}`}
      className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-neutral-950"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Header: leave on the left, where every sheet closes; where you are in the middle. */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <IconButton label="Leave focus" variant="secondary" size="md" onClick={() => setConfirmLeave(true)}>
          <IconX size={18} strokeWidth={2.2} />
        </IconButton>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] font-bold text-neutral-900 dark:text-white">{task.title}</p>
          <p className="text-[13px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
            {total > 0 ? `Step ${focus.stepIndex + 1} of ${total} · ${focus.doneStepIds.length} done` : "Focus"}
            {" · "}
            {formatClock(totalElapsedMs(focus, now))}
          </p>
        </div>
        <div className="h-11 w-11" aria-hidden="true" />
      </div>

      {total > 0 && (
        <div className="flex shrink-0 gap-1 px-5" aria-hidden="true">
          {focus.stepIds.map((id, i) => (
            <span
              key={id}
              className={`h-1 flex-1 rounded-full ${
                focus.doneStepIds.includes(id) ? "bg-green-600 dark:bg-green-500" : i === focus.stepIndex ? "bg-neutral-900 dark:bg-white" : "bg-neutral-200 dark:bg-white/10"
              }`}
            />
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-6">
        <div className="mx-auto flex max-w-[520px] flex-col gap-5">
          <div>
            <h2 className={`text-[26px] font-extrabold leading-tight ${stepDone ? "text-neutral-400 line-through dark:text-neutral-500" : "text-neutral-950 dark:text-white"}`}>
              {item?.task ?? task.title}
            </h2>
            {item && (formatStrengthTargets(values) || values.minutes != null) && (
              <p className="mt-1 text-[15px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
                {[values.minutes != null ? formatMinutes(values.minutes) : "", formatStrengthTargets(values)].filter(Boolean).join(" · ")}
              </p>
            )}
            {item?.info && <p className="mt-1 text-[14px] text-neutral-500 dark:text-neutral-400">{item.info}</p>}
          </div>

          {suggestion && item?.progression && onDecide && (
            <ProgressionCard suggestion={suggestion} name={item.task} cadence={item.progression.cadence} onDecide={(d) => onDecide(suggestion, d)} />
          )}

          {/* The one display number: rest when resting, otherwise this step's clock. */}
          <div className="rounded-2xl bg-neutral-100/70 px-5 py-5 text-center dark:bg-white/[0.04]" aria-live="polite">
            {resting ? (
              <>
                <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">Rest</p>
                <p className="text-[56px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">{formatClock(restLeft * 1000)}</p>
                <div className="mt-3 flex justify-center">
                  <Button variant="secondary" size="md" onClick={() => dispatch({ type: "skipRest" })}>
                    Skip rest
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                  {running ? "Elapsed" : "Paused"}
                </p>
                <p className="text-[56px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">{formatClock(stepMs)}</p>
                {targetMs != null && (
                  <p className="mt-2 text-[14px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">
                    {stepMs < targetMs ? `${formatClock(targetMs - stepMs)} left of ${formatMinutes(values.minutes!)}` : `${formatMinutes(values.minutes!)} reached`}
                  </p>
                )}
              </>
            )}
          </div>

          {strength && item && (
            <SetTable
              sets={sets}
              onChange={(next) => dispatch({ type: "setSets", stepId: item.id, sets: next })}
              previous={previous}
              weightUnit={weightUnit}
              showWeight={values.weight != null || sets.some((s) => s.weight != null)}
              onSetDone={() => {
                if (restSeconds > 0) dispatch({ type: "startRest", seconds: restSeconds, now: Date.now() });
              }}
            />
          )}

          {upNext && !everyDone && (
            <p className="text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">
              Up next: <span className="text-neutral-800 dark:text-neutral-200">{upNext}</span>
            </p>
          )}
        </div>
      </div>

      <div
        className="shrink-0 border-t border-neutral-200 bg-white px-5 pt-3 dark:border-white/[0.08] dark:bg-neutral-950"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-[520px] items-center gap-2.5">
          {total > 1 && (
            <IconButton
              label="Previous step"
              variant="secondary"
              size="lg"
              disabled={focus.stepIndex === 0}
              onClick={() => dispatch({ type: "goTo", index: focus.stepIndex - 1, now: Date.now() })}
            >
              <IconChevronLeft size={20} strokeWidth={2.2} />
            </IconButton>
          )}
          <IconButton
            label={running ? "Pause" : "Resume"}
            variant="secondary"
            size="lg"
            onClick={() => dispatch({ type: running ? "pause" : "resume", now: Date.now() })}
          >
            {running ? <IconPlayerPause size={20} strokeWidth={2.2} /> : <IconPlayerPlay size={20} strokeWidth={2.2} />}
          </IconButton>
          <Button
            variant="cta"
            fullWidth
            onClick={everyDone ? () => finish() : completeStep}
            icon={<IconCheck size={18} strokeWidth={2.6} />}
          >
            {everyDone || isFinalStep ? "Finish" : stepDone ? "Next" : "Done · next"}
          </Button>
          {total > 1 && (
            <IconButton
              label="Skip to next step"
              variant="secondary"
              size="lg"
              disabled={focus.stepIndex >= total - 1}
              onClick={() => dispatch({ type: "goTo", index: focus.stepIndex + 1, now: Date.now() })}
            >
              <IconChevronRight size={20} strokeWidth={2.2} />
            </IconButton>
          )}
        </div>
      </div>

      {confirmLeave && (
        <div className="absolute inset-0 z-10 flex items-end bg-black/30" onClick={() => setConfirmLeave(false)}>
          <div
            className="w-full rounded-t-[28px] bg-white px-5 pb-8 pt-5 dark:bg-neutral-900"
            style={{ paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[18px] font-bold text-neutral-900 dark:text-white">Leave focus?</p>
            <p className="mt-1 text-[14px] text-neutral-500 dark:text-neutral-400">
              The clock keeps running. Open the task again to pick up where you left off.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <Button variant="primary" fullWidth onClick={() => { setConfirmLeave(false); onHide(); }}>
                Leave, keep the session
              </Button>
              <Button variant="secondary" fullWidth onClick={() => { setConfirmLeave(false); finish(); }}>
                Finish now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
