/**
 * Focus mode's state: one task worked through one subtask at a time.
 *
 * Everything is a timestamp, nothing ticks. The clock on screen is derived as
 * `now − runningSince` plus what was already banked, so a backgrounded tab, a
 * suspended iOS app or a killed process all come back to the right number.
 * The record is device-local (it never enters the Schedule — a ticking clock
 * must not stamp entities, feed undo or trigger sync) and is written only on
 * transitions: start, pause, resume, a step change, a set, a rest.
 */

import type { LoggedSet } from "./scheduleTypes";

export interface FocusState {
  taskId: string;
  /** The weekday bucket and date of the occurrence being worked. */
  day: string;
  dateISO: string;
  /** Subtask ids in order; empty for a task without subtasks (one timer). */
  stepIds: string[];
  stepIndex: number;
  /** Epoch ms the clock last started running; null while paused. */
  runningSince: number | null;
  /** Ms banked on the current step before `runningSince`. */
  stepBankedMs: number;
  /** Ms banked on the whole session before `runningSince`. */
  totalBankedMs: number;
  /**
   * Epoch ms the current rest ends; null when not resting. While paused it
   * holds the rest's REMAINING ms instead, so the countdown freezes too.
   */
  restEndsAt: number | null;
  /** Sets typed or ticked so far, per subtask. */
  draftSets: Record<string, LoggedSet[]>;
  /** Subtasks marked done in this session. */
  doneStepIds: string[];
}

export type FocusAction =
  | { type: "pause"; now: number }
  | { type: "resume"; now: number }
  | { type: "goTo"; index: number; now: number }
  | { type: "completeStep"; now: number }
  | { type: "setSets"; stepId: string; sets: LoggedSet[] }
  | { type: "startRest"; seconds: number; now: number }
  | { type: "skipRest" };

export function startFocus(input: { taskId: string; day: string; dateISO: string; stepIds: string[]; alreadyDone?: string[]; now: number }): FocusState {
  const done = new Set(input.alreadyDone ?? []);
  // Open on the first step not already ticked today.
  const first = input.stepIds.findIndex((id) => !done.has(id));
  return {
    taskId: input.taskId,
    day: input.day,
    dateISO: input.dateISO,
    stepIds: input.stepIds,
    stepIndex: first === -1 ? 0 : first,
    runningSince: input.now,
    stepBankedMs: 0,
    totalBankedMs: 0,
    restEndsAt: null,
    draftSets: {},
    doneStepIds: [...done].filter((id) => input.stepIds.includes(id)),
  };
}

/** Ms on the current step at `now`. */
export function stepElapsedMs(s: FocusState, now: number): number {
  return s.stepBankedMs + (s.runningSince != null ? Math.max(0, now - s.runningSince) : 0);
}

/** Ms on the whole session at `now`. */
export function totalElapsedMs(s: FocusState, now: number): number {
  return s.totalBankedMs + (s.runningSince != null ? Math.max(0, now - s.runningSince) : 0);
}

/** Seconds of rest left at `now`; 0 when not resting or the rest is over. */
export function restRemainingSeconds(s: FocusState, now: number): number {
  if (s.restEndsAt == null) return 0;
  const ms = s.runningSince == null ? s.restEndsAt : s.restEndsAt - now;
  return Math.max(0, Math.ceil(ms / 1000));
}

export function currentStepId(s: FocusState): string | null {
  return s.stepIds[s.stepIndex] ?? null;
}

export function isLastStep(s: FocusState): boolean {
  return s.stepIds.length === 0 || s.stepIndex >= s.stepIds.length - 1;
}

/** Bank the running time into both counters and keep running from `now`. */
function bank(s: FocusState, now: number): FocusState {
  if (s.runningSince == null) return s;
  const ran = Math.max(0, now - s.runningSince);
  return { ...s, stepBankedMs: s.stepBankedMs + ran, totalBankedMs: s.totalBankedMs + ran, runningSince: now };
}

export function focusReducer(s: FocusState, action: FocusAction): FocusState {
  switch (action.type) {
    case "pause": {
      if (s.runningSince == null) return s;
      // A pause also stops the rest countdown: its end moves out by the pause.
      return { ...bank(s, action.now), runningSince: null, restEndsAt: s.restEndsAt != null ? s.restEndsAt - action.now : null };
    }
    case "resume": {
      if (s.runningSince != null) return s;
      // While paused, restEndsAt held the remaining ms; turn it back into a time.
      return { ...s, runningSince: action.now, restEndsAt: s.restEndsAt != null ? action.now + s.restEndsAt : null };
    }
    case "goTo": {
      if (s.stepIds.length === 0) return s;
      const index = Math.max(0, Math.min(s.stepIds.length - 1, action.index));
      if (index === s.stepIndex) return s;
      const banked = bank(s, action.now);
      return { ...banked, stepIndex: index, stepBankedMs: 0, restEndsAt: null };
    }
    case "completeStep": {
      const id = currentStepId(s);
      const doneStepIds = id && !s.doneStepIds.includes(id) ? [...s.doneStepIds, id] : s.doneStepIds;
      const next = { ...s, doneStepIds };
      if (s.stepIds.length === 0) return next;
      // Move to the next step not yet done, wrapping to any earlier skipped one.
      const order = [...s.stepIds.slice(s.stepIndex + 1), ...s.stepIds.slice(0, s.stepIndex)];
      const target = order.find((sid) => !doneStepIds.includes(sid));
      if (!target) return next;
      return focusReducer(next, { type: "goTo", index: s.stepIds.indexOf(target), now: action.now });
    }
    case "setSets":
      return { ...s, draftSets: { ...s.draftSets, [action.stepId]: action.sets } };
    case "startRest":
      if (action.seconds <= 0) return s;
      return s.runningSince == null
        ? { ...s, restEndsAt: action.seconds * 1000 } // paused: hold the remaining ms
        : { ...s, restEndsAt: action.now + action.seconds * 1000 };
    case "skipRest":
      return { ...s, restEndsAt: null };
  }
}

/** Every step is done (or the task has none and the timer was run). */
export function allStepsDone(s: FocusState): boolean {
  return s.stepIds.length > 0 && s.stepIds.every((id) => s.doneStepIds.includes(id));
}

/** A saved session only resumes on the day it was started. */
export function isFocusResumable(s: FocusState | null | undefined, todayISO: string): s is FocusState {
  return !!s && s.dateISO === todayISO && typeof s.taskId === "string";
}

/** "1:05", "12:40", "1:02:03" — the display clock. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** The storage key both apps use for the in-progress session. */
export const FOCUS_STORAGE_KEY = "planr-focus-session";
