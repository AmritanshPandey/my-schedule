/**
 * What a routine says about itself — the reference detail shown under its
 * title, so the plan is on screen the moment you mark it done ("Lunch: dal,
 * rice, salad · 1:00 PM"), and when it happens ("Anytime", "8:00 AM",
 * "3× a day").
 *
 * Detail is supportive, never a gate: nothing here decides whether the day is
 * done. Pure and React-free.
 */

import type { Ritual } from "./useScheduleDB";
import { formatDisplayTime, parseTimeToMinutes } from "./timeUtils";

export interface RoutineDetailItem {
  id: string;
  label: string;
  /** Display time ("1:00 PM"), when the item has one. */
  time?: string;
}

/** "1,500" not "1500" — targets are read at a glance. */
export function formatAmount(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function displayTime(raw: string | undefined): string | undefined {
  if (!raw || parseTimeToMinutes(raw) === null) return undefined;
  return formatDisplayTime(raw);
}

/**
 * The routine's listed items, in time order where they have times (untimed
 * items keep their place after the timed ones). For "times" routines the
 * occurrences themselves are the items.
 */
export function routineDetailItems(ritual: Pick<Ritual, "trackingType" | "steps">): RoutineDetailItem[] {
  const steps = ritual.steps ?? [];
  if (ritual.trackingType === "times") {
    return steps.map((s) => ({ id: s.id, label: formatDisplayTime(s.label) }));
  }
  const items = steps.map((s, index) => ({
    item: { id: s.id, label: s.label, time: displayTime(s.time) } as RoutineDetailItem,
    minutes: s.time ? parseTimeToMinutes(s.time) : null,
    index,
  }));
  const timed = items.filter((x) => x.minutes !== null).sort((a, b) => a.minutes! - b.minutes! || a.index - b.index);
  const untimed = items.filter((x) => x.minutes === null);
  return [...timed, ...untimed].map((x) => x.item);
}

/** When it happens: "Anytime", "8:00 AM", or "3× a day" for several times. */
export function routineWhenLabel(ritual: Pick<Ritual, "trackingType" | "steps" | "anyTime" | "time">): string {
  if (ritual.trackingType === "times" && (ritual.steps?.length ?? 0) > 0) {
    const n = ritual.steps!.length;
    return n === 1 ? formatDisplayTime(ritual.steps![0].label) : `${n}× a day`;
  }
  if (ritual.anyTime) return "Anytime";
  return formatDisplayTime(ritual.time);
}

/** The goal for a measured routine — "Goal 120 g" — or null. */
export function routineGoalLabel(ritual: Pick<Ritual, "trackingType" | "target" | "unit">): string | null {
  const t = ritual.trackingType;
  if (t !== "quantity" && t !== "duration" && t !== "count") return null;
  if (typeof ritual.target !== "number" || ritual.target <= 0) return null;
  return `Goal ${formatAmount(ritual.target)}${ritual.unit ? ` ${ritual.unit}` : ""}`;
}

/**
 * One line of detail for a list row: the items (with their times), else the
 * goal, else the description. Null when the routine carries no detail.
 */
export function routineDetailLine(
  ritual: Pick<Ritual, "trackingType" | "steps" | "target" | "unit" | "description">,
): string | null {
  const items = routineDetailItems(ritual);
  const goal = routineGoalLabel(ritual);
  if (items.length > 0 && ritual.trackingType !== "times") {
    const text = items.map((i) => (i.time ? `${i.label} ${i.time}` : i.label)).join(" · ");
    return goal ? `${goal} · ${text}` : text;
  }
  if (items.length > 1 && ritual.trackingType === "times") {
    const text = items.map((i) => i.label).join(" · ");
    return goal ? `${goal} · ${text}` : text;
  }
  if (goal) return goal;
  return ritual.description?.trim() || null;
}

/** The ratings offered after "done" — coarse on purpose: a feel, not a score. */
export const FOLLOWED_OPTIONS = [25, 50, 75, 100] as const;

/** "fully followed" at 100, otherwise "75% followed". */
export function followedPhrase(pct: number): string {
  return pct >= 100 ? "fully followed" : `${pct}% followed`;
}
