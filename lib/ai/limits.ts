/**
 * How much one AI response is allowed to do.
 *
 * `AIActionResult` payloads carry unbounded `tasks[]` / `milestones[]` /
 * `subtasks[]` arrays, and the default provider is a local MLX model
 * (`lib/ai/config.ts`) running on the user's own machine — so a runaway
 * generation spends the user's CPU and GPU, and whatever it emits is written
 * straight into React state and IndexedDB.
 *
 * Two tiers, because "large" and "broken" are different problems:
 *
 *  - **Soft caps** are the point at which a human should look before it lands.
 *    A 48-session curriculum is a legitimate thing to want; it just shouldn't
 *    happen without being seen. Exceeding one never fails, it only demands an
 *    explicit confirmation.
 *  - **Hard caps** are an order of magnitude higher and mean the response is
 *    malformed rather than ambitious. Those are rejected outright, so a broken
 *    generation cannot write thousands of rows.
 *
 * Pure — no React, no DB.
 */

import type { AIActionResult } from "@/lib/ai";

export const SOFT_LIMITS = {
  tasks: 25,
  milestones: 15,
  subtasks: 20,
  /** Everything the action creates, added together. */
  total: 60,
} as const;

/** Past this a payload is treated as malformed, not merely large. */
export const HARD_LIMITS = {
  tasks: 250,
  milestones: 250,
  subtasks: 250,
  total: 500,
} as const;

/** How many of each thing an action would create. */
export interface CreationCounts {
  plans: number;
  tasks: number;
  milestones: number;
  subtasks: number;
  trackers: number;
  rituals: number;
  total: number;
}

export interface LimitBreach {
  kind: keyof typeof SOFT_LIMITS;
  count: number;
  limit: number;
}

export interface LimitCheck {
  counts: CreationCounts;
  /** Over a soft cap: allowed, but must be confirmed explicitly. */
  needsConfirmation: boolean;
  softBreaches: LimitBreach[];
  /** Over a hard cap: refuse the action entirely. */
  rejected: boolean;
  hardBreaches: LimitBreach[];
}

function emptyCounts(): CreationCounts {
  return { plans: 0, tasks: 0, milestones: 0, subtasks: 0, trackers: 0, rituals: 0, total: 0 };
}

/** What an action would add to the schedule, counted by kind. */
export function countCreations(action: AIActionResult): CreationCounts {
  const c = emptyCounts();
  switch (action.type) {
    case "create_plan": {
      c.plans = 1;
      c.tasks = action.payload.tasks?.length ?? 0;
      c.milestones = action.payload.milestones?.length ?? 0;
      c.subtasks = (action.payload.tasks ?? []).reduce(
        (n, t) => n + ((t as { subtasks?: unknown[] }).subtasks?.length ?? 0),
        0,
      );
      break;
    }
    case "add_task":
      c.tasks = 1;
      c.subtasks = action.payload.subtasks?.length ?? 0;
      break;
    case "add_subtasks":
      c.subtasks = action.payload.subtasks.length;
      break;
    case "suggest_milestones":
      c.milestones = action.payload.milestones.length;
      break;
    case "add_tracker":
      c.trackers = 1;
      break;
    case "create_ritual":
      c.rituals = 1;
      break;
    case "create_strategy":
      // A written document, not schedule rows — nothing to count.
      break;
    default:
      break;
  }
  c.total = c.plans + c.tasks + c.milestones + c.subtasks + c.trackers + c.rituals;
  return c;
}

function breaches(counts: CreationCounts, limits: typeof SOFT_LIMITS | typeof HARD_LIMITS): LimitBreach[] {
  const out: LimitBreach[] = [];
  for (const kind of ["tasks", "milestones", "subtasks", "total"] as const) {
    const count = counts[kind];
    if (count > limits[kind]) out.push({ kind, count, limit: limits[kind] });
  }
  return out;
}

export function checkLimits(action: AIActionResult): LimitCheck {
  const counts = countCreations(action);
  const softBreaches = breaches(counts, SOFT_LIMITS);
  const hardBreaches = breaches(counts, HARD_LIMITS);
  return {
    counts,
    softBreaches,
    needsConfirmation: softBreaches.length > 0,
    hardBreaches,
    rejected: hardBreaches.length > 0,
  };
}

/** One line naming what tripped, for the review sheet. */
export function describeBreaches(breaches: readonly LimitBreach[]): string | null {
  if (breaches.length === 0) return null;
  const parts = breaches.map((b) =>
    b.kind === "total" ? `${b.count} items` : `${b.count} ${b.kind}`,
  );
  return `This would create ${parts.join(" and ")} at once.`;
}

// ── Request bounds ────────────────────────────────────────────────────────────

/**
 * Longest a single generation may run before it is aborted.
 *
 * Local inference has no server-side timeout to fall back on: if the MLX
 * process stalls, the stream simply never ends and the UI waits forever.
 */
export const REQUEST_TIMEOUT_MS = 90_000;

/** Ceiling on `maxTokens`, so no caller can ask for an unbounded generation. */
export const MAX_TOKENS_CEILING = 4096;

export function clampMaxTokens(requested: number | undefined, fallback = 1024): number {
  const n = typeof requested === "number" && Number.isFinite(requested) ? requested : fallback;
  return Math.max(1, Math.min(MAX_TOKENS_CEILING, Math.round(n)));
}
