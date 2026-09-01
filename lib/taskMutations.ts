/**
 * Pure schedule mutation helpers.
 *
 * Every function returns a `(prev: Schedule) => Schedule` updater so callers
 * can pass it directly to setSchedule(). No component logic lives here.
 */

import type { Schedule, Task, TaskException, TaskSlot } from "./useScheduleDB";
import { DAYS, type DayKey } from "./scheduleConstants";
import { uid } from "./id";
import { localISODate } from "./dateUtils";
import { parseTimeToMinutes, toScheduleDayMinutes } from "./timeUtils";
import type { ScheduleEntry } from "@/components/ScheduleItem";

export { uid } from "./id";
export type { TaskSlot } from "./useScheduleDB";

// ── Slots ─────────────────────────────────────────────────────────────────────

/**
 * The task's time blocks as a non-empty array. Tasks without an explicit `slots`
 * list expose their single startTime/endTime block. Use this everywhere that
 * renders or reasons about a task's time so single- and multi-slot tasks share
 * one code path.
 */
export function getSlots(task: Pick<Task, "startTime" | "endTime" | "slots">): TaskSlot[] {
  return task.slots && task.slots.length > 0
    ? task.slots
    : [{ startTime: task.startTime, endTime: task.endTime }];
}

/**
 * Enforce the slot invariant on a task: slots are sorted by start time and
 * startTime/endTime always mirror the earliest slot. A single-block task is
 * stored without a `slots` field (kept clean / back-compatible).
 */
export function withSlots<T extends Task | Omit<Task, "id">>(task: T): T {
  const slots = task.slots;
  if (!slots || slots.length === 0) {
    const { slots: _drop, ...rest } = task as T & { slots?: TaskSlot[] };
    return rest as T;
  }
  const sorted = [...slots].sort((a, b) => {
    const am = parseTimeToMinutes(a.startTime);
    const bm = parseTimeToMinutes(b.startTime);
    if (am === null && bm === null) return 0;
    if (am === null) return 1;
    if (bm === null) return -1;
    return toScheduleDayMinutes(am) - toScheduleDayMinutes(bm);
  });
  const first = sorted[0];
  if (sorted.length === 1) {
    const { slots: _drop, ...rest } = task as T & { slots?: TaskSlot[] };
    return { ...rest, startTime: first.startTime, endTime: first.endTime } as T;
  }
  return { ...task, slots: sorted, startTime: first.startTime, endTime: first.endTime };
}

/**
 * Retime one slot of a task, preserving every other slot. Use this instead of
 * writing `startTime`/`endTime` directly whenever a task may be multi-slot —
 * a bare `{...task, startTime, endTime}` would move the mirrored first block
 * while leaving `slots` stale, silently breaking the mirror invariant.
 *
 * `withSlots` re-sorts afterwards, so dragging a later phase earlier than an
 * earlier one reorders cleanly and startTime/endTime still mirror slots[0].
 */
export function retimeSlot<T extends Task | Omit<Task, "id">>(
  task: T,
  slotIndex: number,
  startTime: string,
  endTime: string
): T {
  const slots = getSlots(task);
  if (slots.length <= 1) {
    return withSlots({ ...task, slots: undefined, startTime, endTime });
  }
  const next = slots.map((slot, i) => (i === slotIndex ? { startTime, endTime } : slot));
  return withSlots({ ...task, slots: next });
}

/**
 * Relocate one slot of a task between weekday buckets (Cmd/Ctrl-drag a block
 * to a different day column). Same-day is a plain retimeSlot; cross-day
 * removes the slot from sourceDay (dropping the whole entry if it was the
 * last slot there) and appends it to targetDay (merging into an existing
 * copy of the same task id if one already exists there, else creating a new
 * entry). completedSlotIndices is remapped through both the removal and the
 * merge-sort so the checkbox state travels with the moved slot, not a stale
 * position. completionHistory follows a full relocation, but never a split:
 * when the source entry remains, its dated history stays there because
 * analytics identifies occurrences by weekday and task id. On a merge after a
 * full relocation, the two independent per-bucket histories are concatenated.
 *
 * `targetDateISO` matters only for a `recurrence: { type: "once" }` task (one
 * pinned to a single calendar date rather than every matching weekday):
 * without repinning `dateISO` to the drop date, isTaskScheduledOn would keep
 * checking the *old* date against the new weekday bucket — which that bucket
 * is never queried with — and the relocated task would stop rendering
 * anywhere at all.
 */
export function moveTaskSlot(
  taskId: string,
  sourceDay: DayKey,
  slotIndex: number,
  targetDay: DayKey,
  targetDateISO: string,
  startTime: string,
  endTime: string
): (prev: Schedule) => Schedule {
  return (prev) => {
    const sourceList = prev.activities[sourceDay] ?? [];
    const sourceTask = sourceList.find((t) => t.id === taskId);
    if (!sourceTask) return prev; // dragged task vanished mid-drag — no-op

    if (sourceDay === targetDay) {
      return {
        ...prev,
        activities: {
          ...prev.activities,
          [sourceDay]: sourceList.map((t) =>
            t.id === taskId ? retimeSlot(t, slotIndex, startTime, endTime) : t
          ),
        },
      };
    }

    // ── Cross-day ──────────────────────────────────────────────────────────
    const sourceSlots = getSlots(sourceTask);
    const remainingSourceSlots = sourceSlots.filter((_, i) => i !== slotIndex);
    const sourceEntryRemains = remainingSourceSlots.length > 0;
    const movedSlotWasCompleted = (sourceTask.completedSlotIndices ?? []).includes(slotIndex);
    const remapAfterRemoval = (indices: number[] | undefined): number[] =>
      (indices ?? []).filter((i) => i !== slotIndex).map((i) => (i > slotIndex ? i - 1 : i));

    const nextSourceList =
      !sourceEntryRemains
        ? sourceList.filter((t) => t.id !== taskId)
        : sourceList.map((t) =>
            t.id !== taskId
              ? t
              : withSlots({
                  ...t,
                  slots: remainingSourceSlots,
                  completedSlotIndices: remapAfterRemoval(t.completedSlotIndices),
                })
          );

    const targetList = prev.activities[targetDay] ?? [];
    const targetTaskIdx = targetList.findIndex((t) => t.id === taskId);
    const newSlot: TaskSlot = { startTime, endTime };

    let nextTargetList: Task[];
    if (targetTaskIdx === -1) {
      // No existing copy on targetDay — relocate the whole task there.
      const relocatedSource = sourceEntryRemains
        ? (() => {
            const { completionHistory: _history, ...withoutHistory } = sourceTask;
            return withoutHistory;
          })()
        : sourceTask;
      const relocated = withSlots<Task>({
        ...relocatedSource,
        ...(sourceTask.recurrence?.type === "once"
          ? { recurrence: { ...sourceTask.recurrence, dateISO: targetDateISO } }
          : null),
        slots: [newSlot],
        completedSlotIndices: movedSlotWasCompleted ? [0] : [],
      });
      nextTargetList = [...targetList, relocated];
    } else {
      // Merge into the existing copy. withSlots' internal sort reorders the
      // *same* slot object references (a shallow [...slots].sort(), no
      // per-slot cloning — confirmed in withSlots' implementation), so
      // completedSlotIndices can be remapped by reference lookup rather than
      // assuming append position == final sorted index.
      const existingTarget = targetList[targetTaskIdx];
      const existingSlots = getSlots(existingTarget);
      const sorted = withSlots<Task>({ ...existingTarget, slots: [...existingSlots, newSlot] });
      const finalSlots = getSlots(sorted);
      const existingCompletedIndices = existingTarget.completed
        ? existingSlots.map((_, index) => index)
        : existingTarget.completedSlotIndices ?? [];
      const carriedCompleted = existingCompletedIndices
        .map((i) => finalSlots.indexOf(existingSlots[i]))
        .filter((i) => i !== -1);
      const newSlotFinalIndex = finalSlots.indexOf(newSlot);
      const completedSlotIndices = movedSlotWasCompleted
        ? [...carriedCompleted, newSlotFinalIndex]
        : carriedCompleted;
      const allSlotsCompleted = completedSlotIndices.length === finalSlots.length;
      nextTargetList = targetList.map((t, i) =>
        i !== targetTaskIdx
          ? t
          : {
              ...sorted,
              completedSlotIndices,
              completed: allSlotsCompleted,
              completedAt: allSlotsCompleted ? existingTarget.completedAt : undefined,
              completionHistory: [
                ...(existingTarget.completionHistory ?? []),
                ...(!sourceEntryRemains ? sourceTask.completionHistory ?? [] : []),
              ],
            }
      );
    }

    return {
      ...prev,
      activities: { ...prev.activities, [sourceDay]: nextSourceList, [targetDay]: nextTargetList },
    };
  };
}

// ── Time format converters — re-exported from timeUtils for convenience ───────

export { displayToInputTime, inputToDisplayTime } from "./timeUtils";

// ── Task mutations ────────────────────────────────────────────────────────────

interface PlanItemsUpdate {
  planId: string;
  items: ScheduleEntry[];
}

/**
 * What "delete" means for a task that recurs.
 *
 * - `"date"` removes ONE dated occurrence, implemented as a per-date skip
 *   (`setTaskException(..., { skipped: true })`) rather than a second removal
 *   mechanism. Skip already keeps the task's completion history intact, which
 *   is what streaks and analytics need — genuinely deleting the occurrence
 *   would silently rewrite the past.
 * - `"day"` removes the whole weekday bucket (every future Monday).
 * - `"all"` removes the task from every weekday it appears on.
 *
 * Only `"day"` and `"all"` reach createTaskDeleteSnapshot; `"date"` is handled
 * by the caller because it edits the task rather than removing it.
 */
export type TaskDeleteScope = "date" | "day" | "all";

/** The scopes that actually remove rows. `"date"` edits the task instead. */
export type TaskRemovalScope = Exclude<TaskDeleteScope, "date">;

export interface TaskDeleteSnapshot {
  taskId: string;
  scope: TaskRemovalScope;
  sourceDay: DayKey;
  affectedDays: Array<{
    day: DayKey;
    entries: Array<{ index: number; task: Task }>;
  }>;
  milestoneLinks: Array<{ milestoneId: string; linkedActivities: string[] }>;
}

function reconcileEditedTask(existing: Task, updates: Omit<Task, "id">): Task {
  const merged = withSlots({ ...existing, ...updates });
  if (updates.taskType === "session") return merged;

  // Drop any completed-slot index that no longer exists after the edit (e.g. a
  // slot was removed), and fold slot-completeness into whether the task as a
  // whole stays "completed".
  const totalSlots = getSlots(merged).length;
  const completedSlotIndices = Array.from(new Set(existing.completedSlotIndices ?? [])).filter(
    (i) => i < totalSlots
  );
  const slotsStayDone = totalSlots <= 1 || completedSlotIndices.length >= totalSlots;

  const nextSubtaskIds = new Set(updates.subtasks?.map((subtask) => subtask.id) ?? []);
  const completedSubtaskIds = Array.from(
    new Set(existing.completedSubtaskIds ?? [])
  ).filter((id) => nextSubtaskIds.has(id));
  const wasCompleted = existing.completed ?? (
    nextSubtaskIds.size > 0 && completedSubtaskIds.length === nextSubtaskIds.size
  );
  const staysCompleted =
    (nextSubtaskIds.size === 0
      ? wasCompleted && (existing.subtasks?.length ?? 0) === 0
      : wasCompleted && completedSubtaskIds.length === nextSubtaskIds.size) && slotsStayDone;
  const today = localISODate(new Date());
  const completionHistory = (existing.completionHistory ?? []).filter((event) => {
    if (localISODate(new Date(event.completedAt)) !== today) return true;
    if (event.completionType === "subtask") {
      return !!event.subtaskId && nextSubtaskIds.has(event.subtaskId);
    }
    if (event.completionType === "slot") {
      return event.slotIndex !== undefined && event.slotIndex < totalSlots;
    }
    if (event.completionType === "missed" && event.subtaskId) {
      return nextSubtaskIds.has(event.subtaskId);
    }
    if (event.completionType === "task") return staysCompleted;
    return true;
  });

  return {
    ...merged,
    completed: staysCompleted,
    completedAt: staysCompleted ? existing.completedAt : undefined,
    completedSubtaskIds,
    completedSlotIndices,
    completionHistory,
  };
}

/**
 * Adds a new task to the given days and optionally updates the parent plan's
 * items (subtasks). Generates a single ID shared across all repeat-day copies
 * so they can be recognised as the same recurring task.
 */
export function createTask(
  draft: Omit<Task, "id">,
  targetDays: DayKey[],
  planItems: PlanItemsUpdate | null
): (prev: Schedule) => Schedule {
  const id = uid();
  const normalizedDraft = withSlots(draft);
  const days = Array.from(new Set(targetDays.length > 0 ? targetDays : ["monday" as DayKey]));
  return (prev) => {
    const plans = planItems
      ? prev.plans.map((p) =>
          p.id === planItems.planId ? { ...p, items: planItems.items } : p
        )
      : prev.plans;

    const activities = days.reduce(
      (acc, day) => ({
        ...acc,
        [day]: [...acc[day], { ...normalizedDraft, id }],
      }),
      { ...prev.activities }
    );
    return { ...prev, plans, activities };
  };
}

/**
 * Updates an existing task on a single day and optionally updates the parent
 * plan's items. Preserves all completion history fields that aren't explicitly
 * overwritten.
 */
export function updateTask(
  taskId: string,
  day: DayKey,
  updates: Partial<Omit<Task, "id">>,
  planItems: PlanItemsUpdate | null
): (prev: Schedule) => Schedule {
  return (prev) => {
    const plans = planItems
      ? prev.plans.map((p) =>
          p.id === planItems.planId ? { ...p, items: planItems.items } : p
        )
      : prev.plans;

    const activities = {
      ...prev.activities,
      [day]: prev.activities[day].map((t) =>
        t.id === taskId ? withSlots({ ...t, ...updates }) : t
      ),
    };
    return { ...prev, plans, activities };
  };
}

/**
 * Updates a task's editable fields and the days it is visible on. Existing
 * per-day completion state is preserved because only the supplied editable
 * fields are merged into existing copies.
 */
export function updateTaskDays(
  taskId: string,
  updates: Omit<Task, "id">,
  targetDays: DayKey[],
  planItems: PlanItemsUpdate | null
): (prev: Schedule) => Schedule {
  const days = new Set(targetDays.length > 0 ? targetDays : ["monday" as DayKey]);

  return (prev) => {
    const plans = planItems
      ? prev.plans.map((p) =>
          p.id === planItems.planId ? { ...p, items: planItems.items } : p
        )
      : prev.plans;

    const activities = Object.fromEntries(
      DAYS.map((day) => {
        const existingTasks = prev.activities[day];
        const hasTask = existingTasks.some((t) => t.id === taskId);

        if (!days.has(day)) {
          return [day, existingTasks.filter((t) => t.id !== taskId)];
        }

        const updatedTasks = hasTask
          ? existingTasks.map((t) => (t.id === taskId ? reconcileEditedTask(t, updates) : t))
          : [...existingTasks, withSlots({ ...updates, id: taskId })];

        return [day, updatedTasks];
      })
    ) as Schedule["activities"];

    return { ...prev, plans, activities };
  };
}

/**
 * Like updateTaskDays, but applies a different set of slots to each weekday.
 * Shared (non-time) fields from `updates` are written to every target day; each
 * day's copy then gets its own slots from `perDaySlots` (falling back to
 * `updates`' slots/times when a day isn't listed). All copies keep the same id,
 * so the task stays one recurring task while holding different times per day.
 */
export function updateTaskPerDay(
  taskId: string,
  updates: Omit<Task, "id">,
  perDaySlots: Partial<Record<DayKey, TaskSlot[]>>,
  targetDays: DayKey[],
  planItems: PlanItemsUpdate | null
): (prev: Schedule) => Schedule {
  const days = new Set(targetDays.length > 0 ? targetDays : ["monday" as DayKey]);

  return (prev) => {
    const plans = planItems
      ? prev.plans.map((p) =>
          p.id === planItems.planId ? { ...p, items: planItems.items } : p
        )
      : prev.plans;

    const activities = Object.fromEntries(
      DAYS.map((day) => {
        const existingTasks = prev.activities[day];
        const hasTask = existingTasks.some((t) => t.id === taskId);

        if (!days.has(day)) {
          return [day, existingTasks.filter((t) => t.id !== taskId)];
        }

        const dayUpdates: Omit<Task, "id"> = { ...updates, slots: perDaySlots[day] ?? updates.slots };

        const updatedTasks = hasTask
          ? existingTasks.map((t) => (t.id === taskId ? reconcileEditedTask(t, dayUpdates) : t))
          : [...existingTasks, withSlots({ ...dayUpdates, id: taskId })];

        return [day, updatedTasks];
      })
    ) as Schedule["activities"];

    return { ...prev, plans, activities };
  };
}

// ── Whole-day operations ────────────────────────────────────────────────────

/** Exchange two weekdays' entire task lists. Forward-looking template op. */
export function swapDays(a: DayKey, b: DayKey): (prev: Schedule) => Schedule {
  return (prev) => {
    if (a === b) return prev;
    return {
      ...prev,
      activities: {
        ...prev.activities,
        [a]: prev.activities[b],
        [b]: prev.activities[a],
      },
    };
  };
}

/** Strip per-occurrence completion/history so a copied task starts fresh. */
function freshCopy(task: Task): Task {
  const {
    completed: _c,
    completedAt: _ca,
    completedSubtaskIds: _cs,
    completedSlotIndices: _csl,
    missed: _m,
    missedAt: _ma,
    completionHistory: _ch,
    exceptions: _ex,
    ...rest
  } = task;
  return { ...rest, id: uid() };
}

/**
 * Copy a weekday's tasks onto one or more target weekdays as independent copies
 * (new ids, completion cleared). Recurrence is dropped so copies are plain
 * weekly on their new day. Copies are appended after any existing tasks.
 */
export function duplicateDay(
  source: DayKey,
  targets: DayKey[]
): (prev: Schedule) => Schedule {
  const targetSet = new Set(targets.filter((d) => d !== source));
  return (prev) => {
    if (targetSet.size === 0) return prev;
    const sourceTasks = prev.activities[source] ?? [];
    const activities = { ...prev.activities };
    for (const day of targetSet) {
      const copies = sourceTasks.map((t) => {
        const { recurrence: _r, ...copy } = freshCopy(t);
        return copy;
      });
      activities[day] = [...(prev.activities[day] ?? []), ...copies];
    }
    return { ...prev, activities };
  };
}

/**
 * Counts behind the "Clear day" confirmation.
 *
 * The copy has to name what is actually about to be destroyed — a day holding
 * three completed tasks is a very different thing to lose than an empty plan —
 * and the caller would otherwise repeat this weekday scan in the component.
 */
export interface DayClearSummary {
  total: number;
  completed: number;
  missed: number;
  /** Tasks that also run on another weekday, so they survive the clear there. */
  alsoOnOtherDays: number;
  /** Single-dated tasks, which have no other weekday to come back on. */
  onceOnly: number;
}

export function summarizeDayClear(schedule: Schedule, day: DayKey): DayClearSummary {
  const tasks = schedule.activities[day] ?? [];
  let completed = 0;
  let missed = 0;
  let alsoOnOtherDays = 0;
  let onceOnly = 0;
  for (const task of tasks) {
    if (task.completed) completed++;
    if (task.missed) missed++;
    if (task.recurrence?.type === "once") onceOnly++;
    if (DAYS.some((d) => d !== day && (schedule.activities[d] ?? []).some((t) => t.id === task.id))) {
      alsoOnOtherDays++;
    }
  }
  return { total: tasks.length, completed, missed, alsoOnOtherDays, onceOnly };
}

/**
 * Empty one weekday's task list.
 *
 * A *template* operation, like swapDays: this weekday is cleared for good, not
 * just for the date the user happened to be looking at. A task that also runs
 * on another weekday keeps those rows — only its row on `day` goes.
 *
 * Milestone links are pruned on exactly the rule `createTaskDeleteSnapshot`
 * uses: a link is dropped only when the task has no weekday left anywhere.
 * Assigning `activities[day] = []` directly would skip that and leave
 * `milestone.linkedActivities` pointing at tasks that no longer exist.
 *
 * One updater on purpose. A loop of single-task deletes would push one undo
 * entry each, so the toast's "Undo" would restore only the last task rather
 * than the day.
 */
export function clearDay(day: DayKey): (prev: Schedule) => Schedule {
  return (prev) => {
    const cleared = prev.activities[day] ?? [];
    // Identity, not a copy: an inert clear must not push an undo entry.
    if (cleared.length === 0) return prev;

    const activities = { ...prev.activities, [day]: [] } as Schedule["activities"];
    const orphaned = new Set(
      cleared
        .map((task) => task.id)
        .filter((id) => !DAYS.some((d) => activities[d].some((t) => t.id === id))),
    );

    // Checked before mapping, not inside it: a day of tasks that no milestone
    // references is the common case, and rebuilding the array anyway would
    // hand every milestone consumer a new identity for no change.
    const touchesMilestones =
      orphaned.size > 0
      && prev.milestones.some((m) => m.linkedActivities.some((id) => orphaned.has(id)));

    return {
      ...prev,
      activities,
      milestones: touchesMilestones
        ? prev.milestones.map((milestone) =>
            milestone.linkedActivities.some((id) => orphaned.has(id))
              ? {
                  ...milestone,
                  linkedActivities: milestone.linkedActivities.filter((id) => !orphaned.has(id)),
                }
              : milestone,
          )
        : prev.milestones,
    };
  };
}

// ── Per-date exceptions (single-occurrence skip / edit) ──────────────────────

/**
 * Merge a per-date exception onto a recurring task. Written to every weekday
 * bucket that holds the task id so the date-keyed override is consistent
 * regardless of which weekday the date falls on. Keys that resolve to
 * empty/false are pruned, and an empty exceptions map is removed entirely so
 * untouched tasks stay clean.
 */
export function setTaskException(
  taskId: string,
  dateISO: string,
  patch: TaskException
): (prev: Schedule) => Schedule {
  return (prev) => ({
    ...prev,
    activities: Object.fromEntries(
      DAYS.map((day) => [
        day,
        prev.activities[day].map((t) => {
          if (t.id !== taskId) return t;
          const nextExceptions = { ...(t.exceptions ?? {}) };
          const merged = { ...(nextExceptions[dateISO] ?? {}), ...patch };
          const cleaned = Object.fromEntries(
            Object.entries(merged).filter(([, v]) => v !== undefined && v !== false && v !== "")
          ) as TaskException;
          if (Object.keys(cleaned).length === 0) delete nextExceptions[dateISO];
          else nextExceptions[dateISO] = cleaned;

          const out = { ...t };
          if (Object.keys(nextExceptions).length > 0) out.exceptions = nextExceptions;
          else delete out.exceptions;
          return out;
        }),
      ])
    ) as Schedule["activities"],
  });
}

/** Remove a task's entire exception for one date (restores the template). */
export function clearTaskException(
  taskId: string,
  dateISO: string
): (prev: Schedule) => Schedule {
  return (prev) => ({
    ...prev,
    activities: Object.fromEntries(
      DAYS.map((day) => [
        day,
        prev.activities[day].map((t) => {
          if (t.id !== taskId || !t.exceptions?.[dateISO]) return t;
          const nextExceptions = { ...t.exceptions };
          delete nextExceptions[dateISO];
          const out = { ...t };
          if (Object.keys(nextExceptions).length > 0) out.exceptions = nextExceptions;
          else delete out.exceptions;
          return out;
        }),
      ])
    ) as Schedule["activities"],
  });
}

/** Removes a task from a single day. */
export function deleteTask(
  taskId: string,
  day: DayKey
): (prev: Schedule) => Schedule {
  return (prev) => ({
    ...prev,
    activities: {
      ...prev.activities,
      [day]: prev.activities[day].filter((t) => t.id !== taskId),
    },
  });
}

export function getTaskActiveDays(schedule: Schedule, taskId: string): DayKey[] {
  return DAYS.filter((day) => schedule.activities[day].some((task) => task.id === taskId));
}

export function createTaskDeleteSnapshot(
  schedule: Schedule,
  taskId: string,
  sourceDay: DayKey,
  // Narrower than TaskDeleteScope on purpose: "date" must never reach here. It
  // would fall through to the "day" branch below and wipe the whole weekday.
  scope: TaskRemovalScope
): TaskDeleteSnapshot {
  const activeDays = getTaskActiveDays(schedule, taskId);
  const daysToDelete =
    scope === "all"
      ? activeDays
      : activeDays.includes(sourceDay)
        ? [sourceDay]
        : [];
  const remainingDays = activeDays.filter((day) => !daysToDelete.includes(day));
  const removeMilestoneLinks = remainingDays.length === 0;

  return {
    taskId,
    scope,
    sourceDay,
    affectedDays: daysToDelete.map((day) => ({
      day,
      entries: schedule.activities[day]
        .map((task, index) => ({ task, index }))
        .filter(({ task }) => task.id === taskId),
    })),
    milestoneLinks: removeMilestoneLinks
      ? schedule.milestones
          .filter((milestone) => milestone.linkedActivities.includes(taskId))
          .map((milestone) => ({
            milestoneId: milestone.id,
            linkedActivities: [...milestone.linkedActivities],
          }))
      : [],
  };
}

export function applyTaskDelete(snapshot: TaskDeleteSnapshot): (prev: Schedule) => Schedule {
  return (prev) => {
    const affected = new Set(snapshot.affectedDays.map(({ day }) => day));
    const linkedMilestones = new Set(snapshot.milestoneLinks.map(({ milestoneId }) => milestoneId));

    return {
      ...prev,
      activities: Object.fromEntries(
        DAYS.map((day) => [
          day,
          affected.has(day)
            ? prev.activities[day].filter((task) => task.id !== snapshot.taskId)
            : prev.activities[day],
        ])
      ) as Schedule["activities"],
      milestones: linkedMilestones.size > 0
        ? prev.milestones.map((milestone) =>
            linkedMilestones.has(milestone.id)
              ? {
                  ...milestone,
                  linkedActivities: milestone.linkedActivities.filter((id) => id !== snapshot.taskId),
                }
              : milestone
          )
        : prev.milestones,
    };
  };
}

// Superseded by useScheduleDB's general undo stack (Cmd+Z / the delete
// toast's "Undo" both now call the same `undo()`) — restoreTaskDelete used to
// be a second, independent restore path keyed off this snapshot, which risked
// double-restoring a task if both were triggered. createTaskDeleteSnapshot/
// applyTaskDelete above are still used to *perform* the delete itself.

// ── Subtask factory ───────────────────────────────────────────────────────────

export function createSubtask(title: string, duration?: string): ScheduleEntry {
  return {
    id: uid(),
    task: title.trim(),
    duration: duration?.trim() || undefined,
  };
}

/**
 * Append a copy of a subtask to each target task. Each target gets its own fresh
 * subtask id (shared across that task's weekday copies so the recurring task
 * stays consistent). Lets a user reuse a subtask across other tasks without
 * retyping it.
 */
export function addSubtaskToTasks(
  targetTaskIds: string[],
  entry: ScheduleEntry
): (prev: Schedule) => Schedule {
  const idSet = new Set(targetTaskIds);
  const newIds = new Map<string, string>();
  for (const id of targetTaskIds) newIds.set(id, uid());
  return (prev) => {
    const activities = Object.fromEntries(
      DAYS.map((day) => [
        day,
        (prev.activities[day] ?? []).map((t) =>
          idSet.has(t.id)
            ? { ...t, subtasks: [...(t.subtasks ?? []), { ...entry, id: newIds.get(t.id)! }] }
            : t
        ),
      ])
    ) as Schedule["activities"];
    return { ...prev, activities };
  };
}

// ── Task sort ─────────────────────────────────────────────────────────────────

export function sortTasksByTime(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    const lso = left.sortOrder;
    const rso = right.sortOrder;
    if (lso !== undefined || rso !== undefined) {
      const orderDiff = (lso ?? Infinity) - (rso ?? Infinity);
      if (orderDiff !== 0) return orderDiff;
    }

    const leftMinutes = parseTimeToMinutes(left.startTime);
    const rightMinutes = parseTimeToMinutes(right.startTime);
    const lm = leftMinutes === null ? null : toScheduleDayMinutes(leftMinutes);
    const rm = rightMinutes === null ? null : toScheduleDayMinutes(rightMinutes);
    if (lm === null && rm === null) {
      return left.title.localeCompare(right.title);
    }
    if (lm === null) return 1;
    if (rm === null) return -1;
    if (lm !== rm) return lm - rm;
    const parsedLeftEnd = parseTimeToMinutes(left.endTime);
    const parsedRightEnd = parseTimeToMinutes(right.endTime);
    let le = parsedLeftEnd === null ? lm : parsedLeftEnd;
    let re = parsedRightEnd === null ? rm : parsedRightEnd;
    while (le <= lm) le += 1440;
    while (re <= rm) re += 1440;
    if (le !== re) return le - re;
    return left.title.localeCompare(right.title);
  });
}
