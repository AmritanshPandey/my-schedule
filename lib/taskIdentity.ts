/**
 * How a task looks — resolved from its category, never from the task itself.
 *
 * This replaces the old `resolveAccentColor(task.color, task.icon)` scattered
 * across the timeline, cards and donut. Colour now answers "what kind of work is
 * this?" rather than "what did I pick when I made this block?", which is the
 * whole point of categories.
 *
 * Pure and React-free.
 */

import type { AccentColor } from "./colorSystem";
import type { Task, TaskCategory } from "./useScheduleDB";

export interface TaskIdentity {
  /** A `SECTION_ICONS` name; the neutral star when there is no category. */
  icon: string;
  /**
   * The accent, or `null` when the task should render neutral. Neutral means
   * exactly two things: the task carries no `categoryId`, or it carries one
   * that no longer resolves (a deleted category). Task *type* does not enter
   * into it — a categorised commitment reads in its category's colour, the
   * same as it does in the day-breakdown donut.
   * Callers pair `null` with `TIMELINE_NEUTRAL_CARD` / `PLAN_NEUTRAL`.
   */
  color: AccentColor | null;
  category: TaskCategory | null;
}

const NEUTRAL: TaskIdentity = { icon: "star", color: null, category: null };

export function taskIdentity(
  task: Task,
  categoriesById: ReadonlyMap<string, TaskCategory>,
): TaskIdentity {
  // Held time is no longer forced neutral: a commitment can be categorised
  // ("Commute" is a real kind of time), and when it is, it should read the same
  // here as it does in the day-breakdown donut. An *uncategorised* commitment
  // still falls through to neutral below, which is the common case.
  if (!task.categoryId) return NEUTRAL;
  const category = categoriesById.get(task.categoryId);
  if (!category) return NEUTRAL; // dangling id — a data artefact, not a colour
  return { icon: category.icon, color: category.color, category };
}

/** Convenience for the many components that hold a plain array. */
export function categoriesById(
  categories: readonly TaskCategory[],
): Map<string, TaskCategory> {
  return new Map(categories.map((c) => [c.id, c]));
}
