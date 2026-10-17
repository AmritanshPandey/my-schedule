/**
 * Pure schedule migration — the load/restore pipeline every stored or synced
 * snapshot passes through, shared by apps/web (lib/useScheduleDB.ts, on top of
 * IndexedDB) and apps/native (apps/native/src/lib/useScheduleDB.ts, on top of
 * MMKV). Split out of lib/useScheduleDB.ts verbatim so both platforms read a
 * cloud snapshot, a backup file or a corrupt local record identically — a
 * schedule that loads on one device can never come back different on another.
 *
 * No React, no storage, no auth: callers pass their own error logger to
 * `safeMigrate` (web's lib/errorLog.ts, native's equivalent).
 */

import type {
  CategoryKind,
  DayActivities,
  DomainEventType,
  Goal,
  GoalConnection,
  GoalConnectionType,
  GoalStatus,
  MetricEntry,
  Milestone,
  Note,
  Plan,
  PlanCategory,
  PlanCoachMessage,
  ProgressTracker,
  Ritual,
  RitualCompletion,
  Schedule,
  ScheduleEvent,
  SchedulePreferences,
  ScheduleSyncMeta,
  TaskCategory,
} from "./scheduleTypes";
import type { ScheduleEntry } from "./scheduleEntry";
import { categoryFromIcon, colorFromIcon, resolveAccentColor } from "./colorSystem";
import { calculateMilestoneEndDate, normalizeMilestoneTimeline } from "./roadmapDates";
import { clampTrackingStart, localISODate } from "./dateUtils";
import { DAYS, MAX_SCHEDULE_EVENTS } from "./scheduleConstants";
import { normalizeDayStartTime } from "./timeline/displayWindow";
import { MIN_SLEEP_HOURS, MAX_SLEEP_HOURS } from "./timeline/sleepWindow";
import { normalizeTasks, entryToTask, resetStaleCompletions } from "./scheduleNormalize";
import { applyAutoMissed } from "./consistency/autoMiss";
import { CategoryRegistry } from "./taskCategories";
import { validateSchedule } from "./scheduleSchema";
import { entityMap, normalizeSyncMeta } from "./stampSchedule";

/** Where `safeMigrate` reports a rejected or corrupt payload. */
export type MigrateErrorLogger = (source: string, error: unknown) => void;

function applyPlanStartDates(activities: DayActivities, plans: Plan[]): DayActivities {
  const startDateByPlanId = new Map(
    plans.flatMap((plan) => (plan.startDate ? [[plan.id, plan.startDate] as const] : [])),
  );

  return Object.fromEntries(
    DAYS.map((day) => [
      day,
      activities[day].map((task) => {
        const planStartDate = startDateByPlanId.get(task.planId);
        if (!planStartDate || (task.activeFrom && task.activeFrom >= planStartDate)) return task;
        return { ...task, activeFrom: planStartDate };
      }),
    ]),
  ) as DayActivities;
}

export function emptyDayActivities(): DayActivities {
  return Object.fromEntries(DAYS.map((d) => [d, []])) as unknown as DayActivities;
}

/**
 * True if a schedule holds anything the user actually created — used to decide
 * whether orphaned guest data is worth migrating into a freshly signed-in
 * account. Empty/untouched guest records are ignored.
 */
export function hasMeaningfulData(s: Schedule): boolean {
  if ((s.goals?.length ?? 0) > 0) return true;
  if ((s.plans?.length ?? 0) > 0) return true;
  if ((s.notes?.length ?? 0) > 0) return true;
  if ((s.progressTrackers?.length ?? 0) > 0) return true;
  if ((s.rituals?.length ?? 0) > 0) return true;
  if ((s.milestones?.length ?? 0) > 0) return true;
  if (Object.values(s.activities ?? {}).some((arr) => (arr?.length ?? 0) > 0)) return true;
  return false;
}

function isPerDay(val: unknown): boolean {
  return !!val && typeof val === "object" && !Array.isArray(val) && "monday" in (val as object);
}

function hasAnyTasks(activities: unknown): boolean {
  if (!isPerDay(activities)) return false;
  return DAYS.some((day) => {
    const tasks = (activities as Record<string, unknown>)[day];
    return Array.isArray(tasks) && tasks.length > 0;
  });
}

function legacyActivityPlan(): Plan {
  return {
    id: "legacy-activities",
    title: "General Plan",
    description: "Imported activities",
    category: "routine",
    emoji: "star",
    color: colorFromIcon("star"),
    items: [],
    metaFields: [],
    summary: [],
    goals: [],
  };
}

function ensureActivityPlans(plans: Plan[], activities: unknown): Plan[] {
  if (plans.length > 0 || !hasAnyTasks(activities)) return plans;
  return [legacyActivityPlan()];
}

function normalizePlan(value: unknown): Plan | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Plan;
  const rawMetric = (p as Plan & { metric?: unknown }).metric;
  const metric =
    rawMetric && typeof rawMetric === "object" && "name" in rawMetric
      ? { name: String((rawMetric as { name: unknown }).name ?? ""), unit: String((rawMetric as { unit?: unknown }).unit ?? "") }
      : undefined;
  const rawCoachMessages = (value as { coachMessages?: unknown }).coachMessages;
  const coachMessages: PlanCoachMessage[] = Array.isArray(rawCoachMessages)
    ? rawCoachMessages
        .filter((m): m is Record<string, unknown> =>
          !!m &&
          typeof m === "object" &&
          ((m as Record<string, unknown>).role === "user" || (m as Record<string, unknown>).role === "assistant") &&
          typeof (m as Record<string, unknown>).content === "string"
        )
        .map((m) => {
          const suggestedMilestones = Array.isArray(m.suggestedMilestones)
            ? m.suggestedMilestones
                .filter((s): s is Record<string, unknown> =>
                  !!s && typeof s === "object" && typeof (s as Record<string, unknown>).title === "string"
                )
                .map((s) => ({
                  title: String(s.title),
                  description: typeof s.description === "string" ? s.description : "",
                  targetDate: typeof s.targetDate === "string" ? s.targetDate : undefined,
                }))
            : undefined;
          return {
            role: m.role as "user" | "assistant",
            content: String(m.content),
            type: m.type === "confirmation" ? "confirmation" : undefined,
            suggestedMilestones,
          };
        })
    : [];

  return {
    id: p.id,
    title: p.title,
    description: typeof (p as Plan & { description?: unknown }).description === "string" ? (p as Plan & { description: string }).description : undefined,
    startDate: typeof (p as Plan & { startDate?: unknown }).startDate === "string" ? (p as Plan & { startDate: string }).startDate : undefined,
    endDate: typeof (p as Plan & { endDate?: unknown }).endDate === "string" ? (p as Plan & { endDate: string }).endDate : undefined,
    category: (p as Plan & { category?: PlanCategory }).category ?? categoryFromIcon(p.emoji),
    emoji: p.emoji,
    color: resolveAccentColor((p as Plan & { color?: string }).color, p.emoji),
    items: Array.isArray(p.items) ? p.items : [],
    metaFields: Array.isArray(p.metaFields) ? p.metaFields : [],
    summary: Array.isArray(p.summary) ? p.summary : [],
    goals: Array.isArray(p.goals) ? p.goals : [],
    metric,
    coachMessages,
    goalId: typeof (p as Plan & { goalId?: unknown }).goalId === "string" ? (p as Plan & { goalId: string }).goalId : undefined,
    // Anything unrecognised (including absent, the case for every Plan that
    // predates this field) normalizes to "active" — a stored plan must never
    // come back paused because of a typo in the payload.
    status: (() => {
      const raw = (p as Plan & { status?: unknown }).status;
      return raw === "paused" || raw === "completed" ? raw : "active";
    })(),
  };
}

/** Keep only well-formed stored Goals; anything malformed is dropped. */
function normalizeGoal(value: unknown): Goal | null {
  if (!value || typeof value !== "object") return null;
  const g = value as Record<string, unknown>;
  if (typeof g.id !== "string" || !g.id) return null;
  if (typeof g.title !== "string" || !g.title.trim()) return null;
  const now = new Date().toISOString();
  const status: GoalStatus =
    g.status === "completed" || g.status === "paused" || g.status === "archived" ? g.status : "active";
  return {
    id: g.id,
    title: g.title,
    description: typeof g.description === "string" ? g.description : undefined,
    status,
    startDate: typeof g.startDate === "string" ? g.startDate : undefined,
    targetDate: typeof g.targetDate === "string" ? g.targetDate : undefined,
    createdAt: typeof g.createdAt === "string" ? g.createdAt : now,
    updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : now,
    schemaVersion: typeof g.schemaVersion === "number" ? g.schemaVersion : 1,
  };
}

function normalizeGoals(raw: unknown): Goal[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeGoal).filter((g): g is Goal => g !== null);
}

const GOAL_CONNECTION_TYPES: readonly GoalConnectionType[] = [
  "supports",
  "depends_on",
  "conflicts_with",
  "shares_resource",
];

function normalizeGoalConnection(value: unknown): GoalConnection | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || !c.id) return null;
  if (typeof c.fromGoalId !== "string" || !c.fromGoalId) return null;
  if (typeof c.toGoalId !== "string" || !c.toGoalId) return null;
  // A goal related to itself is meaningless in every one of the four types,
  // and would make the impact walk self-referential.
  if (c.fromGoalId === c.toGoalId) return null;
  if (!GOAL_CONNECTION_TYPES.includes(c.type as GoalConnectionType)) return null;
  return {
    id: c.id,
    fromGoalId: c.fromGoalId,
    toGoalId: c.toGoalId,
    type: c.type as GoalConnectionType,
    note: typeof c.note === "string" && c.note.trim() ? c.note : undefined,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : new Date().toISOString(),
  };
}

/**
 * Drops malformed rows, and any connection whose endpoints no longer both
 * exist — a dangling connection would render as a relationship to nothing.
 */
function normalizeGoalConnections(raw: unknown, goals: Goal[]): GoalConnection[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(goals.map((g) => g.id));
  return raw
    .map(normalizeGoalConnection)
    .filter((c): c is GoalConnection => c !== null && ids.has(c.fromGoalId) && ids.has(c.toGoalId));
}

const KNOWN_EVENT_TYPES: readonly DomainEventType[] = [
  "GOAL_CREATED",
  "GOAL_UPDATED",
  "GOAL_COMPLETED",
  "GOAL_ARCHIVED",
  "GOAL_DELETED",
  "AI_PROPOSAL_CREATED",
  "AI_PROPOSAL_ACCEPTED",
  "AI_PROPOSAL_REJECTED",
  "AI_PROPOSAL_FAILED",
];

function normalizeScheduleEvent(value: unknown): ScheduleEvent | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  if (typeof e.id !== "string" || !e.id) return null;
  if (typeof e.entityId !== "string" || !e.entityId) return null;
  if (typeof e.timestamp !== "string") return null;
  if (typeof e.type !== "string" || !KNOWN_EVENT_TYPES.includes(e.type as DomainEventType)) return null;
  const data = e.data && typeof e.data === "object" && !Array.isArray(e.data) ? (e.data as Record<string, unknown>) : undefined;
  return { id: e.id, type: e.type as DomainEventType, entityId: e.entityId, timestamp: e.timestamp, data };
}

function normalizeScheduleEvents(raw: unknown): ScheduleEvent[] {
  if (!Array.isArray(raw)) return [];
  const events = raw.map(normalizeScheduleEvent).filter((e): e is ScheduleEvent => e !== null);
  return events.length > MAX_SCHEDULE_EVENTS ? events.slice(events.length - MAX_SCHEDULE_EVENTS) : events;
}

function defaultTrackerId(planId: string): string {
  return `${planId}-tracker-main`;
}

function normalizeTracker(value: unknown): ProgressTracker | null {
  if (!value || typeof value !== "object") return null;
  const t = value as ProgressTracker;
  if (!t.id || !t.planId || !t.title) return null;
  const gd = (t as ProgressTracker & { goalDirection?: unknown }).goalDirection;
  return {
    id: t.id,
    planId: t.planId,
    title: t.title,
    type: "number",
    unit: t.unit,
    goalDirection: gd === "increase_good" || gd === "decrease_good" ? gd : undefined,
    goalValue: typeof t.goalValue === "number" && Number.isFinite(t.goalValue) ? t.goalValue : undefined,
    startingValue: typeof t.startingValue === "number" && Number.isFinite(t.startingValue) ? t.startingValue : undefined,
    dailyTarget: typeof t.dailyTarget === "number" && Number.isFinite(t.dailyTarget) ? t.dailyTarget : undefined,
  };
}

function trackersFromPlans(plans: Plan[], storedTrackers: ProgressTracker[]): ProgressTracker[] {
  if (storedTrackers.length > 0) return storedTrackers;
  return plans.flatMap((plan) => {
    if (plan.metric) {
      return [{ id: defaultTrackerId(plan.id), planId: plan.id, title: plan.metric.name, type: "number" as const, unit: plan.metric.unit }];
    }
    return (plan.metaFields ?? []).map((field) => ({
      id: `${plan.id}-tracker-${field.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      planId: plan.id,
      title: field,
      type: "number" as const,
      unit: "",
    }));
  });
}

function normalizeMilestone(value: unknown): Milestone | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Milestone & Record<string, unknown>;
  if (typeof m.id !== "string" || typeof m.planId !== "string" || typeof m.title !== "string") return null;
  const plannedDurationDays =
    typeof m.plannedDurationDays === "number"
      ? Math.max(1, Math.round(m.plannedDurationDays))
      : typeof m.estimatedDays === "number"
      ? Math.max(1, Math.round(m.estimatedDays))
      : 7;
  const startDate =
    typeof m.startDate === "string"
      ? m.startDate
      : typeof m.targetDate === "string"
      ? m.targetDate
      : localISODate(new Date());
  const plannedEndDate =
    typeof m.plannedEndDate === "string"
      ? m.plannedEndDate
      : typeof m.targetDate === "string"
      ? m.targetDate
      : calculateMilestoneEndDate(startDate, plannedDurationDays);
  const actualCompletedDate =
    typeof m.actualCompletedDate === "string"
      ? m.actualCompletedDate
      : typeof m.completedDate === "string"
      ? m.completedDate
      : undefined;
  const legacyCompleted = m.completionStatus === "completed";
  const rawStatus = m.status;
  const status =
    actualCompletedDate || legacyCompleted
      ? "completed"
      : rawStatus === "upcoming" || rawStatus === "active" || rawStatus === "delayed"
      ? rawStatus
      : "upcoming";
  const linkedTrackers = Array.isArray(m.linkedTrackers)
    ? m.linkedTrackers.filter((id): id is string => typeof id === "string")
    : typeof m.linkedTrackerId === "string"
    ? [m.linkedTrackerId]
    : [];
  const linkedActivities = Array.isArray(m.linkedActivities)
    ? m.linkedActivities.filter((id): id is string => typeof id === "string")
    : [];
  const now = new Date().toISOString();
  return {
    id: m.id,
    planId: m.planId,
    title: m.title,
    description: typeof m.description === "string" ? m.description : undefined,
    startDate,
    plannedDurationDays,
    plannedEndDate,
    actualCompletedDate,
    status,
    linkedActivities,
    linkedTrackers,
    createdAt: typeof m.createdAt === "string" ? m.createdAt : now,
    updatedAt: typeof m.updatedAt === "string" ? m.updatedAt : now,
    targetDate: plannedEndDate,
    estimatedDays: plannedDurationDays,
    linkedTrackerId: linkedTrackers[0],
    completionStatus: status === "completed" ? "completed" : "pending",
    completedDate: actualCompletedDate,
    notes: typeof m.notes === "string" ? m.notes : undefined,
    sortOrder: typeof m.sortOrder === "number" ? m.sortOrder : 0,
  };
}

function normalizeMetricEntry(value: unknown, trackers: ProgressTracker[]): MetricEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as MetricEntry;
  if (!e.id || !e.planId || typeof e.value !== "number" || !e.date) return null;
  const fallbackTracker = trackers.find((tracker) => tracker.planId === e.planId);
  const trackerId = e.trackerId || fallbackTracker?.id;
  if (!trackerId) return null;
  return { id: e.id, planId: e.planId, trackerId, value: e.value, date: e.date };
}

export function normalizeMilestoneTimelines(plans: Plan[], milestones: Milestone[]): Milestone[] {
  return plans.flatMap((plan) => {
    const planMilestones = milestones.filter((milestone) => milestone.planId === plan.id);
    // Preserve stored (possibly user-edited) start dates across loads; only
    // derived fields are recomputed. Re-laying from plan.startDate would wipe
    // every manual date change on the next reload.
    return normalizeMilestoneTimeline(planMilestones, plan.startDate);
  });
}


function defaultPlans(): Plan[] {
  return [
    {
      id: "diet",
      title: "Diet",
      description: "Track meals, hydration, and daily nutrition.",
      category: "health",
      emoji: "sleep",
      color: "emerald",
      items: [],
      metaFields: ["Calories", "Protein"],
      summary: [
        { label: "Calories", metaKey: "Calories", unit: "kcal", colorClass: "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35" },
        { label: "Protein", metaKey: "Protein", unit: "g", colorClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-400/35" },
      ],
    },
    {
      id: "workout",
      title: "Workout",
      description: "Plan workouts and track training progress.",
      category: "fitness",
      emoji: "barbell",
      color: "cyan",
      items: [],
      metaFields: ["Duration", "Calories", "Sets"],
      summary: [
        { label: "Duration", metaKey: "Duration", unit: "min", colorClass: "bg-sky-500/10 text-sky-600 border-sky-500/25 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-400/35" },
        { label: "Calories", metaKey: "Calories", unit: "kcal", colorClass: "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-400/35" },
      ],
    },
  ];
}

/**
 * A stored `kind` always wins; only an *unset* one is inferred, and only from
 * the sleep icon (the same signal lib/colorSystem.ts already reads). Inferring
 * on every pass instead would silently overrule a user who deliberately marked
 * their sleep-icon category as active — and since this runs on every load, it
 * would do so forever.
 */
function resolveCategoryKind(stored: unknown, icon: string): CategoryKind {
  if (stored === "active" || stored === "rest" || stored === "sleep") return stored;
  return icon === "sleep" ? "sleep" : "active";
}

/** Keep only well-formed stored categories; anything malformed is dropped. */
function normalizeCategories(value: unknown): TaskCategory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "string" || !c.id || seen.has(c.id)) return [];
    if (typeof c.title !== "string" || !c.title.trim()) return [];
    seen.add(c.id);
    const icon = typeof c.icon === "string" && c.icon ? c.icon : "star";
    return [{
      id: c.id,
      title: c.title.trim(),
      icon,
      color: resolveAccentColor(typeof c.color === "string" ? c.color : undefined, icon),
      ...(typeof c.sortOrder === "number" ? { sortOrder: c.sortOrder } : {}),
      kind: resolveCategoryKind(c.kind, icon),
    }];
  });
}

/** Migrate legacy day-activity data into flat per-day tasks plus dynamic plans. */
export function migrate(raw: unknown): Schedule {
  const empty = emptySchedule();
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const preferences = normalizeSchedulePreferences(r.preferences);

  // Seeded with whatever is stored, then handed to every normalizeTasks call so
  // pre-category tasks can adopt their old icon/colour as a category. Once every
  // task has a categoryId nothing is adopted, which makes this idempotent.
  const categories = new CategoryRegistry(normalizeCategories(r.categories));

  // Already current shape or existing activities that still need per-day normalization.
  if (isPerDay(r.activities) && Array.isArray(r.plans)) {
    const normalizedPlans = (r.plans as unknown[])
      .map((plan) => normalizePlan(plan))
      .filter((plan): plan is Plan => plan !== null);
    const plans = ensureActivityPlans(normalizedPlans, r.activities);
    // Guard: if plans is still empty but raw activities contain tasks, add the
    // legacy plan so those tasks aren't orphaned (hasAnyTasks may miss edge cases).
    if (plans.length === 0) {
      const hasRawTasks = DAYS.some((day) => {
        const dayData = (r.activities as Record<string, unknown>)?.[day];
        return Array.isArray(dayData) && dayData.length > 0;
      });
      if (hasRawTasks) plans.push(legacyActivityPlan());
    }
    const fallbackPlanId = plans[0]?.id ?? legacyActivityPlan().id;
    const progressTrackers = trackersFromPlans(
      plans,
      Array.isArray(r.progressTrackers)
        ? (r.progressTrackers as unknown[]).map(normalizeTracker).filter((t): t is ProgressTracker => t !== null)
        : []
    );
    const metricEntries: MetricEntry[] = Array.isArray(r.metricEntries)
      ? (r.metricEntries as unknown[]).map((entry) => normalizeMetricEntry(entry, progressTrackers)).filter((e): e is MetricEntry => e !== null)
      : [];
    const milestones: Milestone[] = Array.isArray(r.milestones)
      ? (r.milestones as unknown[]).map(normalizeMilestone).filter((m): m is Milestone => m !== null)
      : [];
    const normalizedMilestones = normalizeMilestoneTimelines(plans, milestones);

    const rituals: Ritual[] = Array.isArray(r.rituals)
      ? (r.rituals as Ritual[]).filter((ri) => ri && typeof ri.id === "string" && typeof ri.title === "string" && typeof ri.time === "string")
      : [];

    const notes = normalizeNotes(r.notes);

    const cutoff = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      return localISODate(d);
    })();
    const ritualCompletions: RitualCompletion[] = Array.isArray(r.ritualCompletions)
      ? (r.ritualCompletions as unknown[]).filter(
          (c): c is RitualCompletion =>
            c !== null && typeof c === "object" &&
            typeof (c as RitualCompletion).ritualId === "string" &&
            typeof (c as RitualCompletion).date === "string" &&
            (c as RitualCompletion).date >= cutoff
        )
      : [];

    // Normalize first: the registry only knows which categories to derive after
    // every task has been through it. Reading `categories.all()` inline in this
    // object literal would evaluate it before `activities` ran and return an
    // empty list, silently un-categorising the whole schedule.
    const migratedActivities = Object.fromEntries(
      DAYS.map((day) => [day, normalizeTasks((r.activities as Record<string, unknown>)[day], fallbackPlanId, undefined, undefined, categories)])
    ) as DayActivities;

    return {
      goals: normalizeGoals(r.goals),
      goalConnections: normalizeGoalConnections(r.goalConnections, normalizeGoals(r.goals)),
      plans,
      categories: categories.all(),
      activities: applyPlanStartDates(migratedActivities, plans),
      progressTrackers,
      metricEntries,
      milestones: normalizedMilestones,
      rituals,
      ritualCompletions,
      notes,
      events: normalizeScheduleEvents(r.events),
      preferences,
      // Carried raw here and pruned once in safeMigrate, where the final live
      // entity set is known. Dropping it in these literals is exactly how a new
      // top-level Schedule field goes missing on every reload.
      syncMeta: r.syncMeta as ScheduleSyncMeta | undefined,
    };
  }

  // v3/v4 migration: fixed diet/workout plans plus nested day sections.
  if (isPerDay(r.activities) && (Array.isArray(r.diet) || Array.isArray(r.workout))) {
    const plans = defaultPlans();
    const progressTrackers = trackersFromPlans(plans, []);
    const metricEntries: MetricEntry[] = Array.isArray(r.metricEntries)
      ? (r.metricEntries as unknown[]).map((entry) => normalizeMetricEntry(entry, progressTrackers)).filter((e): e is MetricEntry => e !== null)
      : [];
    plans[0].items = Array.isArray(r.diet) ? (r.diet as ScheduleEntry[]) : [];
    plans[1].items = Array.isArray(r.workout) ? (r.workout as ScheduleEntry[]) : [];
    // See the note in the branch above: normalize before reading the registry.
    const migratedActivities = Object.fromEntries(
      DAYS.map((day) => [day, normalizeTasks((r.activities as Record<string, unknown>)[day], plans[0].id, undefined, undefined, categories)])
    ) as DayActivities;

    return {
      goals: normalizeGoals(r.goals),
      goalConnections: normalizeGoalConnections(r.goalConnections, normalizeGoals(r.goals)),
      plans,
      categories: categories.all(),
      activities: migratedActivities,
      progressTrackers,
      metricEntries,
      milestones: [],
      rituals: [],
      ritualCompletions: [],
      notes: normalizeNotes(r.notes),
      events: normalizeScheduleEvents(r.events),
      preferences,
      // Carried raw here and pruned once in safeMigrate, where the final live
      // entity set is known. Dropping it in these literals is exactly how a new
      // top-level Schedule field goes missing on every reload.
      syncMeta: r.syncMeta as ScheduleSyncMeta | undefined,
    };
  }

  // Migrate from v2 (per-day work/personal) or v1 (flat arrays).
  const activities = emptyDayActivities();
  for (const day of DAYS) {
    const workItems: ScheduleEntry[] = isPerDay(r.work)
      ? ((r.work as Record<string, ScheduleEntry[]>)[day] ?? [])
      : day === "monday" && Array.isArray(r.work) ? r.work : [];
    const personalItems: ScheduleEntry[] = isPerDay(r.personal)
      ? ((r.personal as Record<string, ScheduleEntry[]>)[day] ?? [])
      : day === "monday" && Array.isArray(r.personal) ? r.personal : [];

    activities[day].push(...workItems.map((entry) => entryToTask(entry, "briefcase", "workout", "Work Schedule", categories)));
    activities[day].push(...personalItems.map((entry) => entryToTask(entry, "star", "diet", "Personal", categories)));
  }

  const plans = defaultPlans();
  const progressTrackers = trackersFromPlans(plans, []);
  const metricEntries: MetricEntry[] = Array.isArray(r.metricEntries)
    ? (r.metricEntries as unknown[]).map((entry) => normalizeMetricEntry(entry, progressTrackers)).filter((e): e is MetricEntry => e !== null)
    : [];
  plans[0].items = Array.isArray(r.diet) ? (r.diet as ScheduleEntry[]) : [];
  plans[1].items = Array.isArray(r.workout) ? (r.workout as ScheduleEntry[]) : [];

  return {
    goals: normalizeGoals(r.goals),
    goalConnections: normalizeGoalConnections(r.goalConnections, normalizeGoals(r.goals)),
    plans,
    categories: categories.all(),
    activities,
    progressTrackers,
    metricEntries,
    milestones: [],
    rituals: [],
    ritualCompletions: [],
    notes: normalizeNotes(r.notes),
    events: normalizeScheduleEvents(r.events),
    preferences,
    syncMeta: r.syncMeta as ScheduleSyncMeta | undefined,
  };
}

const MAX_NOTE_TAGS = 8;
const MAX_NOTE_TAG_LEN = 24;

function normalizeNoteTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const tag = t.trim().slice(0, MAX_NOTE_TAG_LEN);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= MAX_NOTE_TAGS) break;
  }
  return tags.length > 0 ? tags : undefined;
}

function normalizeNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((n): n is Record<string, unknown> =>
      n !== null && typeof n === "object" &&
      typeof (n as Record<string, unknown>).id === "string"
    )
    .map((n) => ({
      id: String(n.id),
      title: typeof n.title === "string" ? n.title : "",
      body: typeof n.body === "string" ? n.body : "",
      createdAt: typeof n.createdAt === "string" ? n.createdAt : new Date().toISOString(),
      updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : new Date().toISOString(),
      pinned: typeof n.pinned === "boolean" ? n.pinned : undefined,
      tags: normalizeNoteTags(n.tags),
      linkedTaskIds: Array.isArray(n.linkedTaskIds)
        ? (n.linkedTaskIds as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined,
      linkedPlanIds: Array.isArray(n.linkedPlanIds)
        ? (n.linkedPlanIds as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined,
    }));
}

function normalizeSchedulePreferences(raw: unknown): SchedulePreferences {
  if (!raw || typeof raw !== "object") return {};
  const source = raw as { dayStartTime?: unknown; dayEndMinutes?: unknown; dayEndAuto?: unknown; startDate?: unknown; lastRolloverISO?: unknown; acknowledgedMisses?: unknown; acknowledgedAttention?: unknown; sleepHours?: unknown };
  const dayStartTime = normalizeDayStartTime(source.dayStartTime);
  // Accept a numeric dayEndMinutes in minutes (may be > 1440 to represent next-day hours)
  let dayEndMinutes: number | undefined = undefined;
  if (typeof source.dayEndMinutes === "number" && Number.isFinite(source.dayEndMinutes)) {
    const v = Math.floor(source.dayEndMinutes as number);
    // Allow reasonable bounds: 24:00 (1440) .. 28:00 (1680)
    if (v >= 24 * 60 && v <= 28 * 60) dayEndMinutes = v;
  }
  // Accept an explicit boolean to derive the end from tasks
  const dayEndAuto = source.dayEndAuto === true ? true : undefined;

  // See clampTrackingStart: a future value here would blank the whole app.
  const startDate = clampTrackingStart(source.startDate, localISODate(new Date()));
  const lastRolloverISO =
    typeof source.lastRolloverISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.lastRolloverISO)
      ? source.lastRolloverISO
      : undefined;
  // Handled-miss keys ("taskId|YYYY-MM-DD"). Capped so the set can't grow without
  // bound; stale keys past the 7-day attention window are harmless (never read).
  const acknowledgedMisses = Array.isArray(source.acknowledgedMisses)
    ? (source.acknowledgedMisses.filter(
        (k): k is string => typeof k === "string" && /\|\d{4}-\d{2}-\d{2}$/.test(k),
      ).slice(-200))
    : undefined;
  // Same shape and cap as acknowledgedMisses: every key ends in the date that
  // scopes it, so anything without one can never match and is dropped.
  const acknowledgedAttention = Array.isArray(source.acknowledgedAttention)
    ? (source.acknowledgedAttention.filter(
        (k): k is string => typeof k === "string" && /\|\d{4}-\d{2}-\d{2}$/.test(k),
      ).slice(-200))
    : undefined;
  // Half-hour granularity, bounds-checked like dayEndMinutes above; invalid
  // input (non-numeric, NaN, out of range) is dropped rather than clamped, so
  // a bad value never silently enters persistence as something the user never
  // chose.
  let sleepHours: number | undefined = undefined;
  if (typeof source.sleepHours === "number" && Number.isFinite(source.sleepHours)) {
    const rounded = Math.round(source.sleepHours * 2) / 2;
    if (rounded >= MIN_SLEEP_HOURS && rounded <= MAX_SLEEP_HOURS) sleepHours = rounded;
  }
  return {
    ...(dayStartTime ? { dayStartTime } : {}),
    ...(typeof dayEndMinutes === "number" ? { dayEndMinutes } : {}),
    ...(dayEndAuto ? { dayEndAuto } : {}),
    ...(startDate ? { startDate } : {}),
    ...(lastRolloverISO ? { lastRolloverISO } : {}),
    ...(acknowledgedMisses && acknowledgedMisses.length ? { acknowledgedMisses } : {}),
    ...(acknowledgedAttention && acknowledgedAttention.length ? { acknowledgedAttention } : {}),
    ...(typeof sleepHours === "number" ? { sleepHours } : {}),
  };
}

export function emptySchedule(): Schedule {
  return {
    goals: [],
    goalConnections: [],
    plans: [],
    categories: [],
    activities: emptyDayActivities(),
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

/**
 * Migrate + reset, but never throw: a single corrupt record (e.g. malformed
 * completionHistory) must not reject the whole load and blank the app. On
 * failure it logs to the on-device error reporter and returns null so the caller
 * can fall back (and still let a healthy cloud snapshot load).
 */
export function safeMigrate(raw: unknown, logError: MigrateErrorLogger = () => {}): Schedule | null {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      logError("indexeddb:validation", "Schedule payload is not an object");
      return null;
    }
    const source = raw as Record<string, unknown>;
    const hasScheduleSignal = ["plans", "activities", "work", "personal", "diet", "workout"].some((key) => key in source);
    if (!hasScheduleSignal) {
      logError("indexeddb:validation", "Schedule payload has no recognized schedule structure");
      return null;
    }
    // Auto-miss past rolled-over occurrences (dated history events) before the
    // reset clears today-relative live flags — the two touch disjoint fields.
    const migrated = resetStaleCompletions(applyAutoMissed(migrate(raw), new Date()), localISODate(new Date()));
    // Prune the sync bookkeeping against what actually survived migration:
    // stamps for entities that are gone, and tombstones past the 90-day horizon
    // the cloud payload already trims to, can only grow the payload.
    const pruned: Schedule = {
      ...migrated,
      syncMeta: normalizeSyncMeta(migrated.syncMeta, new Set(entityMap(migrated).keys())),
    };
    const validation = validateSchedule(pruned);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      logError("indexeddb:validation", `Schedule validation failed at ${issue?.path.join(".") || "root"}: ${issue?.message || "invalid data"}`);
      return null;
    }
    return validation.data;
  } catch (err) {
    logError("indexeddb:migrate", err);
    return null;
  }
}

/**
 * Cheap content-equality check for two schedules. Both sides are produced by the
 * same normalize/migrate pipeline, so key order is deterministic and a string
 * compare is a reliable "did anything change". Used to skip no-op cloud merges
 * that would otherwise rebuild the whole render tree. Falls back to "not equal"
 * if serialization throws (e.g., unexpected cyclic data) so we never wrongly
 * suppress a real update.
 */
export function schedulesEqual(a: Schedule, b: Schedule): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}