/**
 * Connected goals (§6.4) — the relationships between goals, and what those
 * relationships actually *do*.
 *
 * The product thesis is "people's goals don't exist in isolation, but their
 * planning tools do". A relationship that is only a label on a card does not
 * discharge that: it is a diagram, not a system. So each of the four types
 * earns its place by producing a real consequence the user could not have seen
 * otherwise:
 *
 *  - `depends_on` — when the goal you depend on is off track, this goal is
 *    blocked, whatever its own numbers say. That is the case a per-goal health
 *    reading structurally cannot surface.
 *  - `supports` — when a supporting goal slips, the support it was providing
 *    is weaker, and that is worth saying before the supported goal slips too.
 *  - `conflicts_with` / `shares_resource` — two active goals competing for the
 *    same week. Reported with the real combined weekly load of their plans'
 *    tasks, not as a vague warning.
 *
 * §17 asks how to represent this "without creating a complex graph interface".
 * The answer taken here: never draw the graph. Relationships are entered one
 * at a time from a goal, and read back as sentences about *this* goal. The
 * graph exists in the data and nowhere in the UI.
 *
 * Pure and React-free, so it is unit-testable directly.
 */

import type {
  Goal,
  GoalConnection,
  GoalConnectionType,
  Schedule,
  Task,
} from "./useScheduleDB";
import { isPlanRunning } from "./planLifecycle";
import { calculateGoalProgress, type GoalHealth } from "./goalProgress";
import { isTrackedTask } from "./taskCompletion";
import { getSlots } from "./taskMutations";
import { DAYS } from "./scheduleConstants";
import { parseTimeToMinutes } from "./timeUtils";
import { uid } from "./id";

// ── Vocabulary ───────────────────────────────────────────────────────────────

/** Types that read the same from either side, so direction is presentational. */
const MUTUAL_TYPES: readonly GoalConnectionType[] = ["conflicts_with", "shares_resource"];

export function isMutualType(type: GoalConnectionType): boolean {
  return MUTUAL_TYPES.includes(type);
}

/**
 * How the relationship reads *from the perspective of* `goalId`.
 *
 * A directional connection says the opposite thing from each end — "depends on
 * X" one way is "X is blocking" the other — so every reader needs the goal it
 * is reading for, never just the row.
 */
export type ConnectionPerspective =
  | "supports"        // this goal supports the other
  | "supported_by"    // the other supports this goal
  | "depends_on"      // this goal needs the other first
  | "blocks"          // the other needs this goal first
  | "conflicts_with"
  | "shares_resource";

export interface ResolvedConnection {
  connection: GoalConnection;
  /** The goal at the other end. */
  other: Goal;
  /** What the relationship means for the goal being read. */
  perspective: ConnectionPerspective;
}

const PERSPECTIVE_LABEL: Record<ConnectionPerspective, string> = {
  supports: "Supports",
  supported_by: "Supported by",
  depends_on: "Depends on",
  blocks: "Blocks",
  conflicts_with: "Conflicts with",
  shares_resource: "Shares resources with",
};

export function perspectiveLabel(perspective: ConnectionPerspective): string {
  return PERSPECTIVE_LABEL[perspective];
}

/** The four types, with the copy the picker shows. */
export const CONNECTION_TYPE_OPTIONS: ReadonlyArray<{
  type: GoalConnectionType;
  label: string;
  hint: string;
}> = [
  { type: "supports", label: "Supports", hint: "Progress here makes the other goal more likely." },
  { type: "depends_on", label: "Depends on", hint: "This can't really progress until the other does." },
  { type: "conflicts_with", label: "Conflicts with", hint: "They compete for the same time or energy." },
  { type: "shares_resource", label: "Shares resources with", hint: "Both draw on one limited thing." },
];

// ── Reading ──────────────────────────────────────────────────────────────────

function perspectiveFor(connection: GoalConnection, goalId: string): ConnectionPerspective {
  const isFrom = connection.fromGoalId === goalId;
  switch (connection.type) {
    case "supports":
      return isFrom ? "supports" : "supported_by";
    case "depends_on":
      return isFrom ? "depends_on" : "blocks";
    default:
      return connection.type;
  }
}

/**
 * Every connection touching `goalId`, from either end, resolved against the
 * live goal list. Rows whose other endpoint no longer exists are dropped.
 */
export function connectionsForGoal(
  schedule: Pick<Schedule, "goals" | "goalConnections">,
  goalId: string,
): ResolvedConnection[] {
  const goalsById = new Map((schedule.goals ?? []).map((g) => [g.id, g]));
  return (schedule.goalConnections ?? [])
    .filter((c) => c.fromGoalId === goalId || c.toGoalId === goalId)
    .flatMap((connection) => {
      const otherId = connection.fromGoalId === goalId ? connection.toGoalId : connection.fromGoalId;
      const other = goalsById.get(otherId);
      if (!other) return [];
      return [{ connection, other, perspective: perspectiveFor(connection, goalId) }];
    });
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Link two goals. Returns the schedule unchanged for a self-link, a missing
 * endpoint, or a duplicate — where "duplicate" accounts for direction: a
 * mutual type already recorded the other way round is the same statement, and
 * recording it twice would render the relationship twice on both goals.
 */
export function connectGoals(
  schedule: Schedule,
  fromGoalId: string,
  toGoalId: string,
  type: GoalConnectionType,
  note?: string,
): Schedule {
  if (fromGoalId === toGoalId) return schedule;
  const ids = new Set((schedule.goals ?? []).map((g) => g.id));
  if (!ids.has(fromGoalId) || !ids.has(toGoalId)) return schedule;

  const existing = (schedule.goalConnections ?? []).some(
    (c) =>
      c.type === type
      && ((c.fromGoalId === fromGoalId && c.toGoalId === toGoalId)
        || (isMutualType(type) && c.fromGoalId === toGoalId && c.toGoalId === fromGoalId)),
  );
  if (existing) return schedule;

  const connection: GoalConnection = {
    id: uid(),
    fromGoalId,
    toGoalId,
    type,
    note: note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  return { ...schedule, goalConnections: [...(schedule.goalConnections ?? []), connection] };
}

export function disconnectGoals(schedule: Schedule, connectionId: string): Schedule {
  const connections = schedule.goalConnections ?? [];
  if (!connections.some((c) => c.id === connectionId)) return schedule;
  return { ...schedule, goalConnections: connections.filter((c) => c.id !== connectionId) };
}

/**
 * Drop every connection touching a deleted goal. Call alongside `deleteGoal`;
 * `normalizeSchedule` also prunes dangling rows on load, but relying on that
 * alone would leave the in-memory schedule inconsistent until the next reload.
 */
export function removeConnectionsForGoal(schedule: Schedule, goalId: string): Schedule {
  const connections = schedule.goalConnections ?? [];
  const next = connections.filter((c) => c.fromGoalId !== goalId && c.toGoalId !== goalId);
  return next.length === connections.length ? schedule : { ...schedule, goalConnections: next };
}

// ── Impact ───────────────────────────────────────────────────────────────────

export type ImpactSeverity = "warning" | "info";

export interface ConnectionImpact {
  connection: GoalConnection;
  other: Goal;
  perspective: ConnectionPerspective;
  severity: ImpactSeverity;
  /** One sentence naming the other goal and what it means for this one. */
  message: string;
}

/** Health values that mean the goal is not currently carrying its weight. */
const OFF_TRACK: readonly GoalHealth[] = ["at_risk", "delayed"];

function isOffTrack(health: GoalHealth): boolean {
  return OFF_TRACK.includes(health);
}

/** Minutes of tracked work a goal's running plans schedule in a normal week. */
export function weeklyLoadMinutes(schedule: Schedule, goalId: string): number {
  const planIds = new Set(
    schedule.plans.filter((p) => p.goalId === goalId && isPlanRunning(p)).map((p) => p.id),
  );
  if (planIds.size === 0) return 0;

  let total = 0;
  for (const day of DAYS) {
    for (const task of schedule.activities[day] ?? ([] as Task[])) {
      if (!planIds.has(task.planId) || !isTrackedTask(task)) continue;
      for (const slot of getSlots(task)) {
        const start = parseTimeToMinutes(slot.startTime);
        const end = parseTimeToMinutes(slot.endTime);
        if (start === null || end === null) continue;
        total += end >= start ? end - start : end + 24 * 60 - start;
      }
    }
  }
  return total;
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${Math.round(hours * 10) / 10}h`;
}

/**
 * What this goal's connections mean for it right now.
 *
 * Only relationships that currently say something appear — a dependency that
 * is on track produces no row. Surfacing every link regardless would be a
 * list of facts the user already entered, and would bury the one that matters.
 */
export function deriveConnectionImpacts(
  schedule: Schedule,
  goalId: string,
  now: Date = new Date(),
): ConnectionImpact[] {
  const goal = (schedule.goals ?? []).find((g) => g.id === goalId);
  if (!goal || goal.status !== "active") return [];

  const impacts: ConnectionImpact[] = [];

  for (const { connection, other, perspective } of connectionsForGoal(schedule, goalId)) {
    // An archived or completed counterpart is history, not a live constraint.
    if (other.status === "archived" || other.status === "completed") continue;

    const otherState = calculateGoalProgress(schedule, other, now);

    switch (perspective) {
      case "depends_on": {
        if (other.status === "paused") {
          impacts.push({
            connection, other, perspective, severity: "warning",
            message: `"${other.title}" is paused, and this goal depends on it — nothing here can really move until it resumes.`,
          });
        } else if (isOffTrack(otherState.health)) {
          impacts.push({
            connection, other, perspective, severity: "warning",
            message: `"${other.title}" is ${otherState.health === "delayed" ? "delayed" : "off pace"}, and this goal depends on it. Expect this one to slip too.`,
          });
        }
        break;
      }

      case "blocks": {
        // The reverse view. Only worth saying when THIS goal is the problem —
        // otherwise it is just an inventory of what depends on you.
        const ownState = calculateGoalProgress(schedule, goal, now);
        if (isOffTrack(ownState.health)) {
          impacts.push({
            connection, other, perspective, severity: "warning",
            message: `"${other.title}" is waiting on this goal, so this slipping holds that up too.`,
          });
        }
        break;
      }

      case "supported_by": {
        if (isOffTrack(otherState.health)) {
          impacts.push({
            connection, other, perspective, severity: "info",
            message: `"${other.title}" was meant to help this along, and it's off pace itself.`,
          });
        }
        break;
      }

      case "conflicts_with":
      case "shares_resource": {
        if (other.status === "paused") break; // a paused goal competes for nothing
        const mine = weeklyLoadMinutes(schedule, goalId);
        const theirs = weeklyLoadMinutes(schedule, other.id);
        if (mine === 0 || theirs === 0) break; // no real competition to report
        const verb = perspective === "conflicts_with" ? "competes with" : "shares resources with";
        impacts.push({
          connection, other, perspective, severity: "info",
          message: `This ${verb} "${other.title}" — together they ask for ${formatHours(mine + theirs)} a week (${formatHours(mine)} here, ${formatHours(theirs)} there).`,
        });
        break;
      }

      case "supports":
        // Nothing to warn about: this goal helping another is not a risk to
        // this goal. The reverse view ("supported_by") carries that case.
        break;
    }
  }

  // Warnings before information — the blocked case is the one to act on.
  return impacts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "warning" ? -1 : 1));
}
