import type { Schedule } from '@planr/core/lib/scheduleTypes';
import { DAYS, type DayKey } from '@planr/core/lib/scheduleConstants';
import { colorFromIcon } from '@planr/core/lib/colorSystem';
import { stampSchedule } from '@planr/core/lib/stampSchedule';
import { normalizeMilestoneTimeline } from '@planr/core/lib/roadmapDates';
import { storage } from './mmkv';
import { writeLocalLastUpdated } from './localMeta';
import { getSyncUid, onCloudMerge, queueSync, type CloudSnapshot } from '../lib/cloudSync';

const KEY = 'schedule';

/** The plan every task falls back to when the user hasn't created one yet —
 * native's analog of lib/useScheduleDB.ts's `legacyActivityPlan()`. */
export const GENERAL_PLAN_ID = 'general';

function emptySchedule(): Schedule {
  return {
    goals: [],
    goalConnections: [],
    plans: [],
    categories: [],
    activities: DAYS.reduce((acc, d) => ({ ...acc, [d]: [] }), {} as Record<DayKey, Schedule['activities'][DayKey]>),
    progressTrackers: [],
    metricEntries: [],
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: [],
    events: [],
    preferences: {},
  };
}

export function getSchedule(): Schedule {
  const raw = storage.getString(KEY);
  if (!raw) return emptySchedule();
  try {
    const parsed = JSON.parse(raw);
    // Cheap shape guard, not a full validator (safeMigrate's Zod validation
    // stayed web-only — native has no legacy formats to migrate from).
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.plans) && parsed.activities) {
      return { ...emptySchedule(), ...parsed };
    }
    return emptySchedule();
  } catch {
    return emptySchedule();
  }
}

export function saveSchedule(schedule: Schedule): void {
  storage.set(KEY, JSON.stringify(schedule));
}

/**
 * Every local edit goes through here, which is what makes this the single
 * chokepoint to also drive cloud sync from — no screen needs to remember to
 * call queueSync itself. Mirrors lib/useScheduleDB.ts's write effect: stamp
 * the local "last changed" clock with the same timestamp the write used, then
 * queue a debounced push (a no-op for guests, see cloudSync.ts's queueSync).
 *
 * stampSchedule (packages/core/lib/stampSchedule.ts) runs on every mutation —
 * this was missing until now, which meant every entity native touched carried
 * no per-entity change timestamp at all. That's the exact information
 * mergeSchedules uses to decide whose edit is newer during a conflict, so an
 * unstamped edit here would have silently lost to a properly-stamped web edit
 * on the same entity, every time.
 *
 * Scope note: the schedule itself isn't yet namespaced per-account on native
 * (one MMKV key for everyone, unlike web's per-uid IndexedDB records) — only
 * the sync bookkeeping below is uid-scoped. Switching accounts on the same
 * device will carry the previous account's local data over until native gets
 * its own per-account storage keys; that's a separate piece of work.
 */
export function updateSchedule(mutator: (s: Schedule) => Schedule): Schedule {
  const previous = getSchedule();
  const next = stampSchedule(previous, mutator(previous));
  saveSchedule(next);
  const uid = getSyncUid();
  writeLocalLastUpdated(Date.now(), uid);
  queueSync(next);
  return next;
}

/** Wired once at app startup (see App.tsx) — absorbs a remote schedule this
 *  device didn't have locally. Persists directly rather than re-queuing a
 *  push: `pushed` merges already reflect what the cloud holds, and a pulled
 *  "missing"/"equal" result carries nothing to write in the first place. */
onCloudMerge((snapshot: CloudSnapshot) => {
  saveSchedule(snapshot.schedule);
  writeLocalLastUpdated(snapshot.lastUpdated, snapshot.uid);
});

/** Wipe everything back to a fresh, empty schedule. Native port of
 *  lib/useScheduleDB.ts's clearData — routed through updateSchedule so the
 *  wipe is expressed as stamped deletions (every entity that existed a
 *  moment ago now has a `deleted` timestamp), not just a bare empty object.
 *  Without that, a device that missed this edit would read "nothing here"
 *  as "nothing changed" and simply refill everything on the next merge. */
export function clearAllData(): Schedule {
  return updateSchedule(() => emptySchedule());
}

/**
 * Wipe all *progress* — task completions (incl. history), ritual check-ins,
 * and logged metric values — while keeping the structure (plans, tasks,
 * trackers, rituals, milestones, notes). Native port of
 * lib/useScheduleDB.ts's clearProgress.
 */
export function clearProgressOnly(): Schedule {
  return updateSchedule((schedule) => {
    const activities = {} as Schedule['activities'];
    for (const day of DAYS) {
      activities[day] = (schedule.activities[day] ?? []).map((t) => {
        const {
          completed: _c,
          completedAt: _a,
          completedSubtaskIds: _s,
          completedSlotIndices: _sl,
          completionHistory: _h,
          missed: _m,
          missedAt: _ma,
          missedSlotIndices: _msl,
          ...rest
        } = t;
        void _c, _a, _s, _sl, _h, _m, _ma, _msl;
        return rest;
      });
    }
    // Un-complete milestones: strip the completion dates and re-derive status
    // from the roadmap timeline (keeps the milestones, resets their progress).
    const milestonesByPlan = new Map<string, typeof schedule.milestones>();
    for (const m of schedule.milestones) {
      const { actualCompletedDate: _ad, completedDate: _cd, ...rest } = m;
      void _ad, _cd;
      const reset = { ...rest, status: 'upcoming' as const, completionStatus: 'pending' as const };
      const bucket = milestonesByPlan.get(reset.planId) ?? [];
      bucket.push(reset);
      milestonesByPlan.set(reset.planId, bucket);
    }
    const milestones = schedule.plans.flatMap((plan) =>
      normalizeMilestoneTimeline(milestonesByPlan.get(plan.id) ?? [], plan.startDate),
    );
    return { ...schedule, activities, milestones, ritualCompletions: [], metricEntries: [] };
  });
}

/** Ensures the fallback "General" plan exists, returning its id. Call before
 * creating a task/ritual that needs a `planId` and the user hasn't picked one. */
export function ensureGeneralPlan(schedule: Schedule): Schedule {
  if (schedule.plans.some((p) => p.id === GENERAL_PLAN_ID)) return schedule;
  return {
    ...schedule,
    plans: [
      ...schedule.plans,
      {
        id: GENERAL_PLAN_ID,
        title: 'General',
        category: 'routine',
        emoji: 'star',
        color: colorFromIcon('star'),
        items: [],
      },
    ],
  };
}
