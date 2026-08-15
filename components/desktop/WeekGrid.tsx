"use client";

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconChevronLeft, IconChevronRight, IconDotsVertical, IconX, IconAlertTriangle } from "@tabler/icons-react";
import type { DayKey, Plan, Ritual, RitualCompletion, Schedule, Task, TaskSlot } from "@/lib/useScheduleDB";
import { DAYS } from "@/lib/useScheduleDB";
import { getSlots, sortTasksByTime } from "@/lib/taskMutations";
import { completionForDate, getTaskCheckableItems, getTaskSubtaskSummary, isTrackedTask, resolveTaskState } from "@/lib/taskCompletion";
import { isTaskScheduledOn, resolveOccurrence } from "@/lib/taskOccurrence";
import { addDaysToISO, localISODate, todayISO } from "@/lib/dateUtils";
import { currentMinutes, parseTimeToMinutes } from "@/lib/timeUtils";
import { categoryHex } from "@/lib/colorSystem";
import { taskIdentity, categoriesById } from "@/lib/taskIdentity";
import { haptic } from "@/lib/haptics";
import {
  CLICK_DEFAULT_DURATION,
  DRAG_MIN_DURATION,
  DRAG_THRESHOLD_PX,
  clampMinutes,
  minutesToDisplayTime,
  pointerToMinutes,
  snapMinutes,
} from "@/lib/timeline/dragTimeUtils";
import {
  buildTimelineGridMarks,
  getNowOnTimeline,
  getTimelineDisplayStartMinutes,
  mapMinutesToTimeline,
  TIMELINE_END_MINUTES,
} from "@/lib/timeline/displayWindow";
import { SCHEDULE_DAY_HANDOVER_MINUTES, taskContinuations } from "@/lib/timeline/overnight";
import TimelineDraftCard from "@/components/timeline/TimelineDraftCard";
import RitualStrip from "@/components/timeline/RitualStrip";

export type CalendarView = "1day" | "3day" | "7day" | "custom3";

const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
};

const VIEW_LABELS: Record<CalendarView, string> = {
  "1day": "1D", "3day": "3D", "7day": "7D", "custom3": "Custom",
};

const PX_MIN = 2;
const RAIL_W = 78;
const DAY_MIN_W = 156;
const TASK_VERTICAL_INSET = 2;

function fmtRail(m: number): string {
  let h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, "0")} ${ap}`;
}

interface BlockLayout {
  /**
   * "continuation" = the tail of *yesterday's* task, finishing in this column.
   * Derived and read-only: it has no identity of its own, and every mutation
   * path is gated on this rather than on the column's day, because completing
   * or deleting through it would write the source task into the wrong bucket.
   */
  kind: "task" | "continuation";
  task: Task;
  /** The specific slot this block renders (a multi-slot task yields one block per slot). */
  slot: TaskSlot;
  slotIndex: number;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}

function buildDayLayout(
  tasks: Task[],
  startMin: number,
  endMin: number,
  carryIn: Task[] = [],
): { timed: BlockLayout[]; untimed: Task[] } {
  const untimed: Task[] = [];
  const parsed: { kind: BlockLayout["kind"]; task: Task; slot: TaskSlot; slotIndex: number; s: number; e: number }[] = [];
  for (const t of tasks) {
    const slots = getSlots(t);
    let anyTimed = false;
    slots.forEach((slot, slotIndex) => {
      const parsedStart = parseTimeToMinutes(slot.startTime);
      if (parsedStart == null) return;
      anyTimed = true;
      const s = mapMinutesToTimeline(parsedStart, startMin, endMin);
      let e = parseTimeToMinutes(slot.endTime);
      if (e == null) e = s + 30;
      else e = mapMinutesToTimeline(e, startMin, endMin);
      while (e <= s) e += 1440;
      parsed.push({ kind: "task", task: t, slot, slotIndex, s, e });
    });
    if (!anyTimed) untimed.push(t);
  }
  // Carried-in tails share the lane packing below rather than being drawn on a
  // separate layer, so a 4-7 AM continuation and a 6 AM workout split the
  // column like any other overlap instead of stacking on top of each other.
  for (const t of carryIn) {
    for (const c of taskContinuations(t, endMin)) {
      parsed.push({ kind: "continuation", task: t, slot: c.slot, slotIndex: c.slotIndex, s: c.interval.start, e: c.interval.end });
    }
  }
  parsed.sort((a, b) => a.s - b.s || a.e - b.e);

  const laneEnd: number[] = [];
  const withLane = parsed.map((p) => {
    let lane = laneEnd.findIndex((end) => end <= p.s);
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(p.e); } else laneEnd[lane] = p.e;
    return { ...p, lane };
  });

  const timed: BlockLayout[] = [];
  let i = 0;
  while (i < withLane.length) {
    let clusterEnd = withLane[i].e;
    let j = i + 1;
    while (j < withLane.length && withLane[j].s < clusterEnd) { clusterEnd = Math.max(clusterEnd, withLane[j].e); j++; }
    const cluster = withLane.slice(i, j);
    const lanes = Math.max(...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) {
      const top = (Math.max(c.s, startMin) - startMin) * PX_MIN;
      const bottom = (Math.min(c.e, endMin) - startMin) * PX_MIN;
      timed.push({
        kind: c.kind,
        task: c.task,
        slot: c.slot,
        slotIndex: c.slotIndex,
        top,
        height: Math.max(22, bottom - top),
        widthPct: 100 / lanes,
        leftPct: (100 / lanes) * c.lane,
      });
    }
    i = j;
  }
  return { timed, untimed };
}

interface RitualMark { top: number; rituals: Ritual[] }

/** Rituals due on `day`, grouped by mapped time, positioned to the timeline. */
function buildRitualMarks(rituals: Ritual[], day: DayKey, startMin: number, endMin: number): RitualMark[] {
  const byTime = new Map<number, Ritual[]>();
  for (const r of rituals) {
    if (r.repeatDays && r.repeatDays.length > 0 && !r.repeatDays.includes(day)) continue;
    const mins = parseTimeToMinutes(r.time);
    if (mins == null) continue;
    const mapped = mapMinutesToTimeline(mins, startMin, endMin);
    if (mapped < startMin || mapped > endMin) continue;
    if (!byTime.has(mapped)) byTime.set(mapped, []);
    byTime.get(mapped)!.push(r);
  }
  return Array.from(byTime.entries())
    .sort(([a], [b]) => a - b)
    .map(([mapped, rs]) => ({ top: (mapped - startMin) * PX_MIN, rituals: rs }));
}

/** Held time / uncategorised blocks in the all-day band. */
const NEUTRAL_UNTIMED_HEX = "#A3A3A3";

interface WeekGridProps {
  schedule: Schedule;
  plansById: Map<string, Plan>;
  rituals: Ritual[];
  ritualCompletions: RitualCompletion[];
  onToggleRitual: (id: string, dateISO: string) => void;
  weekDates: Array<{ day: DayKey; date: Date }>;
  todayKey: DayKey;
  weekLabel: string;
  activeDay: DayKey;
  calendarView: CalendarView;
  customDays: DayKey[];
  onDaySelect: (day: DayKey) => void;
  /** Open the swap/duplicate day-actions menu for a given weekday. */
  onDayActions?: (day: DayKey) => void;
  onWeekPrev: () => void;
  onWeekNext: () => void;
  onWeekToday: () => void;
  onCalendarViewChange: (v: CalendarView) => void;
  onCustomDaysChange: (days: DayKey[]) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string, day: DayKey) => void;
  onToggleTaskComplete: (taskId: string, allSubtaskIds: string[], day: DayKey, dateISO: string) => void;
  /** Independent completion for one phase of a multi-slot task. */
  onToggleSlot: (taskId: string, slotIndex: number, day: DayKey, dateISO: string) => void;
  onCreateTaskAtTime: (day: DayKey, startMin: number, endMin: number) => void;
  /**
   * Reschedule one slot of a task by dragging its block — only fires for
   * today's column (see the drag handler for why). `startTime`/`endTime` are
   * display-time strings ("9:30 AM"), same shape `retimeSlot` expects.
   */
  onRetimeTask?: (taskId: string, day: DayKey, slotIndex: number, startTime: string, endTime: string) => void;
  /** Grid block hover-icon, today only, not-yet-missed: mark it missed. */
  onMarkMissed?: (taskId: string, allSubtaskIds: string[], day: DayKey, dateISO: string) => void;
  /** Grid block hover-icon, any column showing an already-missed occurrence:
   *  opens the reschedule/dismiss sheet (same one Overview's Needs Attention
   *  card opens — this just adds a second entry point from the timeline). */
  onOpenMissedRecovery?: (params: { task: Task; plan: Plan | null; dateISO: string }) => void;
  /**
   * Render prop for the task card inside each time block.
   * WeekGrid handles positioning; the parent injects the card so
   * visual changes on mobile automatically apply here too.
   */
  renderCard: (
    task: Task,
    height: number,
    widthPct: number,
    readOnly: boolean,
    onToggle: () => void,
    onDelete: () => void,
    slot?: TaskSlot,
    slotIndex?: number,
    /** Squares off the edge an overnight block is cut on. */
    edgeCut?: "top" | "bottom",
    /** Hover-revealed "mark/handle missed" icon — see TaskBlockCard.gridMenuAction. */
    gridMenuAction?: { label: string; icon: ReactNode; onClick: () => void },
  ) => ReactNode;
}

export function WeekGrid({
  schedule,
  plansById,
  rituals,
  ritualCompletions,
  onToggleRitual,
  weekDates,
  todayKey,
  weekLabel,
  activeDay,
  calendarView,
  customDays,
  onDaySelect,
  onDayActions,
  onWeekPrev,
  onWeekNext,
  onWeekToday,
  onCalendarViewChange,
  onCustomDaysChange,
  onEditTask,
  onDeleteTask,
  onToggleTaskComplete,
  onToggleSlot,
  onCreateTaskAtTime,
  onRetimeTask,
  onMarkMissed,
  onOpenMissedRecovery,
  renderCard,
}: WeekGridProps) {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [dragCreate, setDragCreate] = useState<{ day: DayKey; startMin: number; endMin: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const clearDragCreateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createDragRef = useRef<{
    day: DayKey;
    columnEl: HTMLDivElement;
    pointerId: number;
    startClientY: number;
    startMin: number;
    dragging: boolean;
    lastEndMin: number;
  } | null>(null);

  // ── Cmd/Ctrl-drag to reschedule (today's column only — see handler) ────────
  // Preview state for the ghost block; the original block dims in place while
  // dragging (mirrors ScheduleApp's single-day dragMove pattern).
  const [dragMove, setDragMove] = useState<{
    taskId: string; slotIndex: number; day: DayKey; previewStartMin: number; durationMin: number;
  } | null>(null);
  const moveDragRef = useRef<{
    taskId: string; slotIndex: number; day: DayKey; task: Task; slot: TaskSlot;
    durationMin: number; grabOffsetMin: number; pointerId: number;
    dragging: boolean; startClientY: number; columnEl: HTMLDivElement; currentPreviewStartMin: number;
  } | null>(null);
  // Set true the instant a drag crosses the threshold; consumed by the
  // block's onClickCapture so the native click that otherwise follows
  // pointerup doesn't also open the edit sheet after a real drag.
  const suppressClickRef = useRef(false);
  // Cmd/Ctrl-held affordance (cursor-grab) so the gesture is discoverable
  // before a user ever drags. `blur` resets it so alt-tabbing away while
  // holding the key can't leave it stuck on.
  const [modifierHeld, setModifierHeld] = useState(false);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Meta" || e.key === "Control") setModifierHeld(true);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Meta" || e.key === "Control") setModifierHeld(false);
    }
    function onBlur() {
      setModifierHeld(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // Built once per render, not once per task: this feeds a doubly-nested loop
  // (days -> untimed tasks), matching how ScheduleApp/IOSScheduleApp memoize it.
  const categoryMap = useMemo(() => categoriesById(schedule.categories), [schedule.categories]);

  const days = weekDates.map(({ day, date }) => {
    const dateISO = localISODate(date);
    const dayIsToday = dateISO === todayISO();
    const raw = sortTasksByTime(schedule.activities[day] ?? []).filter((t) => isTaskScheduledOn(t, dateISO, true));
    const tasks = raw.map((t) => {
      const r = resolveOccurrence(t, dateISO);
      return dayIsToday ? r : { ...r, ...completionForDate(t, dateISO) };
    });
    // Yesterday's overnight tails, which finish inside this column. Resolved
    // against the *previous* date so a skipped or retimed occurrence carries in
    // what it actually ran. `activities` is weekday-keyed and dateless, so the
    // week boundary needs no special case: Monday's carry-in is the `sunday`
    // bucket read against the preceding Sunday's date.
    const prevDay = DAYS[(DAYS.indexOf(day) + 6) % 7];
    const prevISO = addDaysToISO(dateISO, -1);
    const carryIn = (schedule.activities[prevDay] ?? [])
      .filter((t) => isTaskScheduledOn(t, prevISO, true))
      .map((t) => resolveOccurrence(t, prevISO));
    return { day, date, dateISO, dayIsToday, tasks, carryIn };
  });

  const hasCarryIn = days.some((d) => d.carryIn.some((t) => taskContinuations(t).length > 0));
  const startMin = getTimelineDisplayStartMinutes({
    dayStartTime: schedule.preferences?.dayStartTime,
    tasks: days.flatMap((day) => day.tasks),
    // A continuation begins at the handover, which is earlier than the window
    // would otherwise open — without this it would be clipped off the top.
    mustShowFromMinutes: hasCarryIn ? SCHEDULE_DAY_HANDOVER_MINUTES : undefined,
  });
  const endMin = TIMELINE_END_MINUTES;
  // null when the clock is outside the visible window — see getNowOnTimeline.
  const [now, setNow] = useState<number | null>(() => getNowOnTimeline(currentMinutes(), startMin, endMin));
  const totalPx = (endMin - startMin) * PX_MIN;
  const railLabels = buildTimelineGridMarks(startMin, endMin);

  useEffect(() => {
    setNow(getNowOnTimeline(currentMinutes(), startMin, endMin));
    const id = setInterval(
      () => setNow(getNowOnTimeline(currentMinutes(), startMin, endMin)),
      60_000,
    );
    return () => clearInterval(id);
  }, [endMin, startMin]);

  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current || !scrollRef.current) return;
    const showsToday = weekDates.some(({ date }) => localISODate(date) === todayISO());
    if (!showsToday) return;
    const offset = (Math.max(startMin, Math.min(currentMinutes(), endMin)) - startMin) * PX_MIN - 140;
    scrollRef.current.scrollTo({ top: Math.max(0, offset) });
    didAutoScroll.current = true;
  }, [endMin, startMin, weekDates]);

  useEffect(() => {
    if (!showCustomPicker) return;
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowCustomPicker(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showCustomPicker]);

  useEffect(() => {
    let rafId: number | null = null;
    let pendingCreate: { day: DayKey; startMin: number; endMin: number } | null = null;

    function flush() {
      rafId = null;
      if (pendingCreate) {
        setDragCreate(pendingCreate);
        pendingCreate = null;
      }
    }

    function scheduleFlush() {
      if (rafId === null) rafId = requestAnimationFrame(flush);
    }

    function onPointerMove(e: PointerEvent) {
      const drag = createDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (!drag.dragging && Math.abs(e.clientY - drag.startClientY) < DRAG_THRESHOLD_PX) return;
      if (!drag.dragging) drag.dragging = true;

      e.preventDefault();
      const currentMin = pointerToMinutes(e.clientY, drag.columnEl, 0, PX_MIN * 60, startMin);
      const snapped = snapMinutes(currentMin);
      const clamped = clampMinutes(snapped, startMin, endMin - DRAG_MIN_DURATION);
      const nextEndMin = Math.max(clamped, drag.startMin + DRAG_MIN_DURATION);
      drag.lastEndMin = nextEndMin;
      if (
        pendingCreate?.day !== drag.day ||
        pendingCreate?.startMin !== drag.startMin ||
        pendingCreate?.endMin !== nextEndMin
      ) {
        pendingCreate = { day: drag.day, startMin: drag.startMin, endMin: nextEndMin };
        scheduleFlush();
      }
    }

    function onPointerUp(e: PointerEvent) {
      const drag = createDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      createDragRef.current = null;
      // No `if (!drag.dragging) return` here: a click that never crossed
      // DRAG_THRESHOLD_PX still names a time, it just doesn't name a length.
      // lastEndMin is seeded with the click default and overwritten by
      // onPointerMove once a drag starts, so both gestures read the same field.
      haptic("light");
      onCreateTaskAtTime(drag.day, drag.startMin, drag.lastEndMin);
      if (clearDragCreateTimerRef.current) clearTimeout(clearDragCreateTimerRef.current);
      clearDragCreateTimerRef.current = setTimeout(() => {
        setDragCreate(null);
        clearDragCreateTimerRef.current = null;
      }, 900);
    }

    function onPointerCancel(e: PointerEvent) {
      const drag = createDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      createDragRef.current = null;
      setDragCreate(null);
      if (clearDragCreateTimerRef.current) {
        clearTimeout(clearDragCreateTimerRef.current);
        clearDragCreateTimerRef.current = null;
      }
    }

    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (clearDragCreateTimerRef.current) clearTimeout(clearDragCreateTimerRef.current);
    };
  }, [endMin, onCreateTaskAtTime, startMin]);

  const displayLabel = (() => {
    if (calendarView === "7day") return weekLabel;
    if (weekDates.length === 0) return weekLabel;
    if (calendarView === "1day" && weekDates[0]) {
      return weekDates[0].date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
    const first = weekDates[0].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const last = weekDates[weekDates.length - 1].date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${first} – ${last}`;
  })();

  function toggleCustomDay(d: DayKey) {
    const sel = customDays.includes(d);
    if (sel) {
      if (customDays.length > 1) onCustomDaysChange(customDays.filter((x) => x !== d));
    } else {
      onCustomDaysChange([...customDays, d]);
    }
  }

  const cols = Math.max(1, weekDates.length);
  const gridTemplate = `${RAIL_W}px repeat(${cols}, minmax(${DAY_MIN_W}px, 1fr))`;
  const minGridWidth = RAIL_W + cols * DAY_MIN_W;
  const hasUntimed = days.some((d) => d.tasks.some((t) => parseTimeToMinutes(t.startTime) == null));

  function handleDayPointerDown(day: DayKey, e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-task-block],[data-ritual-mark]")) return;
    if (clearDragCreateTimerRef.current) {
      clearTimeout(clearDragCreateTimerRef.current);
      clearDragCreateTimerRef.current = null;
    }
    const columnEl = e.currentTarget;
    // Measured against the column's own rect, which is inside the scroller and
    // therefore already reflects scroll position. Adding scrollTop on top of it
    // double-counts — that is what made a click land hours off once the grid
    // had been scrolled.
    const rawMin = pointerToMinutes(e.clientY, columnEl, 0, PX_MIN * 60, startMin);
    const startMinSnapped = clampMinutes(snapMinutes(rawMin), startMin, endMin - DRAG_MIN_DURATION);
    createDragRef.current = {
      day,
      columnEl,
      pointerId: e.pointerId,
      startClientY: e.clientY,
      startMin: startMinSnapped,
      dragging: false,
      lastEndMin: Math.min(startMinSnapped + CLICK_DEFAULT_DURATION, endMin),
    };
    columnEl.setPointerCapture(e.pointerId);
  }

  // ── Cmd/Ctrl-drag to reschedule a task block ────────────────────────────────
  // Scoped to today's column only: past/future columns render *resolved*
  // occurrences (resolveOccurrence/completionForDate), and retiming those has
  // no defined semantics yet (one-off exception vs. moving the template?) —
  // same reasoning as the existing `readOnly = !dayIsToday` gate below.
  function handleTaskBlockPointerDown(
    e: ReactPointerEvent<HTMLDivElement>,
    day: DayKey,
    dayIsToday: boolean,
    isContinuation: boolean,
    layout: BlockLayout,
  ) {
    if (!onRetimeTask || isContinuation || !dayIsToday) return;
    if (!(e.metaKey || e.ctrlKey)) return; // no modifier — let the click/checkbox behave normally
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return; // checkbox / grid-menu icon
    e.stopPropagation(); // don't also let the day column's create-drag fire
    const columnEl = (e.currentTarget as HTMLElement).closest<HTMLDivElement>("[data-day-col]");
    if (!columnEl) return;

    const slotStart = parseTimeToMinutes(layout.slot.startTime);
    if (slotStart == null) return;
    let slotEnd = parseTimeToMinutes(layout.slot.endTime) ?? slotStart + 30;
    if (slotEnd <= slotStart) slotEnd += 1440; // overnight
    const durationMin = slotEnd - slotStart;

    // layout.top/height are already in the mapped-minute domain PX_MIN
    // encodes (mapMinutesToTimeline), the same domain pointerToMinutes
    // resolves the pointer into — so grabOffset/newStart stay in that domain
    // right up until the final minutesToDisplayTime conversion on release.
    const blockStartMappedMin = startMin + layout.top / PX_MIN;
    const grabMin = pointerToMinutes(e.clientY, columnEl, 0, PX_MIN * 60, startMin);
    const grabOffsetMin = clampMinutes(grabMin - blockStartMappedMin, 0, durationMin);

    moveDragRef.current = {
      taskId: layout.task.id,
      slotIndex: layout.slotIndex,
      day,
      task: layout.task,
      slot: layout.slot,
      durationMin,
      grabOffsetMin,
      pointerId: e.pointerId,
      dragging: false,
      startClientY: e.clientY,
      columnEl,
      currentPreviewStartMin: blockStartMappedMin,
    };
  }

  useEffect(() => {
    if (!onRetimeTask) return;
    const retime = onRetimeTask; // narrowed once — closures below can't retain the guard's narrowing
    let rafId: number | null = null;
    let pendingPreviewMin: number | null = null;

    function flush() {
      rafId = null;
      if (pendingPreviewMin !== null) {
        const min = pendingPreviewMin;
        pendingPreviewMin = null;
        setDragMove((prev) => (prev ? { ...prev, previewStartMin: min } : prev));
      }
    }
    function scheduleFlush() {
      if (rafId === null) rafId = requestAnimationFrame(flush);
    }

    function onPointerMove(e: PointerEvent) {
      const drag = moveDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (!drag.dragging) {
        if (Math.abs(e.clientY - drag.startClientY) < DRAG_THRESHOLD_PX) return;
        drag.dragging = true;
        suppressClickRef.current = true;
        haptic("medium");
        setDragMove({ taskId: drag.taskId, slotIndex: drag.slotIndex, day: drag.day, previewStartMin: drag.currentPreviewStartMin, durationMin: drag.durationMin });
      }
      e.preventDefault();
      const currentMin = pointerToMinutes(e.clientY, drag.columnEl, 0, PX_MIN * 60, startMin);
      const newStartMin = clampMinutes(snapMinutes(currentMin - drag.grabOffsetMin), startMin, endMin - drag.durationMin);
      drag.currentPreviewStartMin = newStartMin;
      if (pendingPreviewMin !== newStartMin) {
        pendingPreviewMin = newStartMin;
        scheduleFlush();
      }
    }

    function onPointerUp(e: PointerEvent) {
      const drag = moveDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      moveDragRef.current = null;
      pendingPreviewMin = null;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (!drag.dragging) {
        // Modifier held, but released without crossing the threshold — no
        // click was suppressed, so this falls through to the normal
        // click-to-edit behavior exactly as if the modifier weren't held.
        setDragMove(null);
        return;
      }
      e.preventDefault();
      const newStartMin = drag.currentPreviewStartMin;
      const newEndMin = newStartMin + drag.durationMin;
      retime(drag.taskId, drag.day, drag.slotIndex, minutesToDisplayTime(newStartMin), minutesToDisplayTime(newEndMin));
      haptic("light");
      setDragMove(null);
    }

    function onPointerCancel(e: PointerEvent) {
      const drag = moveDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      moveDragRef.current = null;
      pendingPreviewMin = null;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      setDragMove(null);
    }

    document.addEventListener("pointermove", onPointerMove, { passive: false });
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("pointercancel", onPointerCancel);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [endMin, onRetimeTask, startMin]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">

      {/* ── Nav bar ─────────────────────────────────────────────────────────── */}
      <div className="relative z-20 mb-8 flex shrink-0 items-start justify-between gap-6">
        <div className="min-w-0">
          <span className="block min-w-0 truncate text-[17px] font-semibold leading-none text-neutral-950 dark:text-white">
            {displayLabel}
          </span>

          <div className="relative mt-5 flex h-11 w-[274px] shrink-0 items-center rounded-[14px] border border-neutral-200 bg-white p-1 dark:border-white/[0.08] dark:bg-neutral-900">
            {(["1day", "3day", "7day", "custom3"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  haptic("light");
                  onCalendarViewChange(v);
                  setShowCustomPicker(v === "custom3");
                }}
                className={`flex h-full flex-1 items-center justify-center rounded-[10px] text-[13px] font-semibold transition-colors ${
                  calendarView === v
                    ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                    : "text-neutral-400 hover:bg-neutral-100/80 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.06] dark:hover:text-neutral-200"
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}

            <AnimatePresence>
              {calendarView === "custom3" && showCustomPicker && (
                <m.div
                  ref={pickerRef}
                  initial={{ opacity: 0, y: -6, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.98 }}
                  transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/[0.08] dark:bg-neutral-900"
                >
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    Pick days · {customDays.length} selected
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => {
                      const sel = customDays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleCustomDay(d)}
                          className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                            sel
                              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                              : "border border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:border-white/10 dark:text-neutral-400 dark:hover:border-white/20"
                          }`}
                        >
                          {DAY_SHORT[d]}
                        </button>
                      );
                    })}
                  </div>
                  {customDays.length >= 1 && (
                    <button
                      type="button"
                      onClick={() => setShowCustomPicker(false)}
                      className="mt-3 w-full rounded-xl bg-neutral-900 py-1.5 text-[12px] font-bold text-white dark:bg-white dark:text-neutral-900"
                    >
                      Done
                    </button>
                  )}
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </div>

          <div className="flex shrink-0 items-center gap-2 pt-7">
            <button
              type="button"
              onClick={() => { haptic("light"); onWeekToday(); }}
              className="mr-2 rounded-full px-3 py-2 text-[13px] font-bold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => { haptic("light"); onWeekPrev(); }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
              aria-label="Previous"
            >
              <IconChevronLeft size={20} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={() => { haptic("light"); onWeekNext(); }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-white/[0.07] dark:hover:text-white"
              aria-label="Next"
            >
              <IconChevronRight size={20} strokeWidth={2.2} />
            </button>
          </div>
      </div>

      {/* One scroller for BOTH axes. A nested y-scroller would become an
          x-scroll container too (overflow-y:auto forces overflow-x away from
          visible), and `sticky left-0` inside it would resolve against a box
          whose scrollLeft is permanently 0 — i.e. do nothing. Sticky only
          works against the scrollport that actually moves. */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-950"
      >
        <div className="min-w-full" style={{ width: `max(100%, ${minGridWidth}px)` }}>
          {/* ── Fixed day-header row ─────────────────────────────────────────────── */}
          <div
            className="sticky top-0 z-30 grid h-[76px] border-b border-neutral-200 bg-white dark:border-white/[0.07] dark:bg-neutral-950"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="sticky left-0 z-10 border-r border-neutral-200 bg-white dark:border-white/[0.07] dark:bg-neutral-950" />
            {days.map(({ day, date, dayIsToday }) => {
              const isActive = day === activeDay;
              return (
                <div
                  key={day}
                  className={`group relative flex border-r border-neutral-200 transition-colors last:border-r-0 dark:border-white/[0.07] ${
                    isActive ? "bg-neutral-950 dark:bg-white" : "hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => { haptic("light"); onDaySelect(day); }}
                    className="flex flex-1 flex-col items-center justify-center gap-2"
                  >
                    <span className={`text-[13px] font-semibold leading-none ${
                      isActive ? "text-white/90 dark:text-neutral-900" : dayIsToday ? "text-rose-500" : "text-neutral-600 dark:text-neutral-300"
                    }`}>
                      {DAY_SHORT[day]}
                    </span>
                    <span className={`text-[22px] font-extrabold tabular-nums leading-none ${
                      isActive ? "text-white dark:text-neutral-900" : dayIsToday ? "text-rose-500" : "text-neutral-900 dark:text-neutral-100"
                    }`}>
                      {date.getDate()}
                    </span>
                  </button>
                  {onDayActions && (
                    <button
                      type="button"
                      aria-label={`${DAY_SHORT[day]} actions — swap or duplicate day`}
                      onClick={(e) => { e.stopPropagation(); haptic("light"); onDayActions(day); }}
                      className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 ${
                        isActive
                          ? "text-white/80 hover:bg-white/15 dark:text-neutral-900/70 dark:hover:bg-black/10"
                          : "text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-white/[0.08]"
                      }`}
                    >
                      <IconDotsVertical size={14} strokeWidth={2} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

        {/* All-day / untimed band */}
        {hasUntimed && (
          <div className="grid border-b border-neutral-200 dark:border-white/[0.07]" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="sticky left-0 z-20 flex items-start justify-end border-r border-neutral-200 bg-white px-2 pt-2 dark:border-white/[0.07] dark:bg-neutral-950">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-neutral-300 dark:text-neutral-600">All day</span>
            </div>
            {days.map(({ day, tasks, dayIsToday, dateISO }) => {
              const untimed = tasks.filter((t) => parseTimeToMinutes(t.startTime) == null);
              return (
                <div key={day} className="flex flex-col gap-1 border-r border-neutral-100 p-1.5 last:border-r-0 dark:border-white/[0.06]">
                  {untimed.map((task) => {
                    const identity = taskIdentity(task, categoryMap);
                    const hex = identity.color ? categoryHex(identity.color) : NEUTRAL_UNTIMED_HEX;
                    const linkedPlan = task.planId ? plansById.get(task.planId) ?? null : null;
                    const state = resolveTaskState(task, getTaskSubtaskSummary(task, linkedPlan).totalCount);
                    const done = state === "completed";
                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onEditTask(task)}
                        className={`flex items-center gap-1.5 rounded-lg border border-neutral-200/70 bg-white px-2 py-1 text-left dark:border-white/[0.08] dark:bg-neutral-900 ${done ? "opacity-60" : ""}`}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: hex }} />
                        <span className={`truncate text-[11px] font-semibold ${done ? "text-neutral-400 line-through dark:text-neutral-600" : "text-neutral-800 dark:text-neutral-200"}`}>
                          {task.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid */}
        <div
          className="relative flex"
          style={{ height: totalPx }}
        >
          {/* Time rail. z-20 so day-column content passes under it while the
              grid scrolls sideways; still below the header row's z-30 so the
              two don't fight over the corner. */}
          <div className="sticky left-0 z-20 shrink-0 border-r border-neutral-200 bg-white dark:border-white/[0.07] dark:bg-neutral-950" style={{ width: RAIL_W }}>
            {railLabels.map((m) => {
              const onHour = m % 60 === 0;
              const isFirst = m === startMin;
              return (
                <span
                  key={m}
                  className={`absolute right-3 whitespace-nowrap tabular-nums ${isFirst ? "" : "-translate-y-1/2"} ${
                    onHour
                      ? "text-[11px] font-bold text-neutral-500 dark:text-neutral-300"
                      : "text-[10px] font-semibold text-neutral-300 dark:text-neutral-600"
                  }`}
                  style={{ top: isFirst ? 14 : (m - startMin) * PX_MIN }}
                >
                  {fmtRail(m)}
                </span>
              );
            })}
          </div>

          {/* Day columns */}
          {days.map(({ day, dayIsToday, dateISO, tasks, carryIn }) => {
            const { timed } = buildDayLayout(tasks, startMin, endMin, carryIn);
            const ritualMarks = buildRitualMarks(rituals, day, startMin, endMin);
            const completedRituals = new Set(
              ritualCompletions.filter((c) => c.date === dateISO).map((c) => c.ritualId),
            );
            const showNow = dayIsToday && now !== null;
            const readOnly = !dayIsToday;
            return (
              <div
                key={day}
                data-day-col
                className="relative min-w-0 flex-1 border-r border-neutral-200 last:border-r-0 dark:border-white/[0.06]"
                onPointerDown={(e) => handleDayPointerDown(day, e)}
              >
                <div className="pointer-events-none absolute inset-0">
                  {railLabels.map((m) => {
                    const onHour = m % 60 === 0;
                    return (
                      <div
                        key={`${day}-grid-${m}`}
                        className={`absolute left-0 right-0 border-t ${
                          onHour
                            ? "border-neutral-100/90 dark:border-white/[0.05]"
                            : "border-dashed border-neutral-200/70 dark:border-white/[0.045]"
                        }`}
                        style={{ top: (m - startMin) * PX_MIN }}
                      />
                    );
                  })}
                </div>

                {timed.map((layout) => {
                  const isContinuation = layout.kind === "continuation";
                  // The source block is cut at the bottom by the day's end; the
                  // continuation is cut at the top by the same instant.
                  const cutAtBottom =
                    !isContinuation &&
                    taskContinuations(layout.task, endMin).some((c) => c.slotIndex === layout.slotIndex);
                  const visualHeight = Math.max(22, layout.height - TASK_VERTICAL_INSET * 2);
                  const linkedPlan = layout.task.planId ? plansById.get(layout.task.planId) ?? null : null;
                  const allSubtaskIds = getTaskCheckableItems(layout.task, linkedPlan).map((item) => item.id);
                  // Multi-slot tasks complete per phase; a single-slot task keeps
                  // the whole-task flag.
                  const totalSlots = getSlots(layout.task).length;
                  const slotDone = totalSlots > 1
                    ? (layout.task.completedSlotIndices ?? []).includes(layout.slotIndex)
                    : !!layout.task.completed;
                  // The block you should be executing right now — green ring
                  // (progress signal). Sanctioned chrome-led depth → data-glass.
                  const nowPx = now === null ? null : (now - startMin) * PX_MIN;
                  const isCurrent =
                    dayIsToday &&
                    !slotDone &&
                    !layout.task.missed &&
                    nowPx !== null &&
                    nowPx >= layout.top &&
                    nowPx < layout.top + layout.height;
                  const isBeingMoved =
                    dragMove?.taskId === layout.task.id && dragMove?.slotIndex === layout.slotIndex && dragMove?.day === day;
                  const canDragToRetime = !!onRetimeTask && dayIsToday && !isContinuation;
                  // Hover-icon: "mark missed" (today, not yet missed/done) or
                  // "handle missed" (any column showing an already-missed
                  // occurrence — completionForDate above already resolved the
                  // right historical flag for past days). Never on a continuation.
                  const gridMenuAction = isContinuation
                    ? undefined
                    : layout.task.missed && onOpenMissedRecovery
                    ? { label: "Handle missed", icon: <IconAlertTriangle size={13} strokeWidth={2} />, onClick: () => onOpenMissedRecovery({ task: layout.task, plan: linkedPlan, dateISO }) }
                    : dayIsToday && !layout.task.missed && !slotDone && isTrackedTask(layout.task) && onMarkMissed
                    ? { label: "Mark missed", icon: <IconX size={13} strokeWidth={2.5} />, onClick: () => onMarkMissed(layout.task.id, allSubtaskIds, day, dateISO) }
                    : undefined;
                  return (
                    <div
                      // `kind` is part of the key because a daily overnight task
                      // renders twice in the same column — today's block and
                      // yesterday's tail — with the same id and slot index.
                      key={`${layout.kind}-${layout.task.id}-${layout.slotIndex}`}
                      data-task-block
                      data-glass={isCurrent ? "" : undefined}
                      className={`absolute ${isCurrent ? "rounded-[10px] shadow-now" : ""} ${
                        isBeingMoved ? "opacity-30" : ""
                      } ${canDragToRetime && modifierHeld ? "cursor-grab" : ""}`}
                      style={{
                        top: layout.top + TASK_VERTICAL_INSET,
                        height: visualHeight,
                        left: `calc(${layout.leftPct}% + 5px)`,
                        width: `calc(${layout.widthPct}% - 10px)`,
                        minHeight: 22,
                      }}
                      onPointerDown={canDragToRetime ? (e) => handleTaskBlockPointerDown(e, day, dayIsToday, isContinuation, layout) : undefined}
                      onClickCapture={
                        canDragToRetime
                          ? (e) => {
                              if (suppressClickRef.current) {
                                e.preventDefault();
                                e.stopPropagation();
                                suppressClickRef.current = false;
                              }
                            }
                          : undefined
                      }
                    >
                      {renderCard(
                        layout.task,
                        layout.height,
                        layout.widthPct,
                        // A continuation is read-only even in today's column:
                        // `day`/`dateISO` here are *this* column's, but the task
                        // lives in the previous day's bucket, so completing or
                        // deleting through it would write to the wrong day.
                        readOnly || isContinuation,
                        () => {
                          if (isContinuation) return;
                          if (totalSlots > 1) onToggleSlot(layout.task.id, layout.slotIndex, day, dateISO);
                          else onToggleTaskComplete(layout.task.id, allSubtaskIds, day, dateISO);
                        },
                        () => { if (!isContinuation) onDeleteTask(layout.task.id, day); },
                        layout.slot,
                        layout.slotIndex,
                        isContinuation ? "top" : cutAtBottom ? "bottom" : undefined,
                        gridMenuAction,
                      )}
                    </div>
                  );
                })}

                {ritualMarks.map((mark) => (
                  <div
                    key={`ritual-${mark.top}`}
                    data-ritual-mark
                    className="absolute right-1.5 z-[5] flex max-w-[70%] -translate-y-1/2 flex-row-reverse flex-wrap items-center justify-start gap-1"
                    style={{ top: mark.top }}
                  >
                    {/* The name is revealed by the dot itself expanding into a
                        capsule (see RitualStrip) — no floating tooltip layer. */}
                    {mark.rituals.map((ritual) => (
                      <RitualStrip
                        key={ritual.id}
                        ritual={ritual}
                        completed={completedRituals.has(ritual.id)}
                        onToggle={() => onToggleRitual(ritual.id, dateISO)}
                      />
                    ))}
                  </div>
                ))}

                {dragCreate?.day === day && (() => {
                  const top = (dragCreate.startMin - startMin) * PX_MIN;
                  const height = Math.max((dragCreate.endMin - dragCreate.startMin) * PX_MIN, 24);
                  const showDuration = dragCreate.endMin - dragCreate.startMin >= 30;
                  return (
                    <div
                      className="pointer-events-none absolute left-0.5 right-0.5 z-[15]"
                      style={{ top, height }}
                    >
                      <TimelineDraftCard
                        startLabel={minutesToDisplayTime(dragCreate.startMin)}
                        endLabel={minutesToDisplayTime(dragCreate.endMin)}
                        durationLabel={showDuration ? `${Math.max(0, Math.round(dragCreate.endMin - dragCreate.startMin))}m` : null}
                        compact={height < 56}
                        className="h-full"
                      />
                    </div>
                  );
                })()}

                {/* Drag-move ghost — the real block dims (isBeingMoved above)
                    while this tracks the pointer at the snapped new time. */}
                {dragMove?.day === day && (() => {
                  const movingTask = tasks.find((t) => t.id === dragMove.taskId);
                  if (!movingTask) return null;
                  const top = (dragMove.previewStartMin - startMin) * PX_MIN;
                  const height = Math.max(dragMove.durationMin * PX_MIN, 24);
                  const previewSlot: TaskSlot = {
                    startTime: minutesToDisplayTime(dragMove.previewStartMin),
                    endTime: minutesToDisplayTime(dragMove.previewStartMin + dragMove.durationMin),
                  };
                  return (
                    <div className="pointer-events-none absolute left-0.5 right-0.5 z-[16] opacity-90" style={{ top, height }}>
                      {renderCard(movingTask, height, 100, true, () => {}, () => {}, previewSlot, dragMove.slotIndex, undefined)}
                    </div>
                  );
                })()}

                {showNow && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-[4] border-t-[1.5px] border-rose-500"
                    style={{ top: (now - startMin) * PX_MIN }}
                  >
                    <span className="absolute -left-[3px] -top-[4px] h-[7px] w-[7px] rounded-full bg-rose-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
}
