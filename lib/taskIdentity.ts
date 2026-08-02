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
import { isTrackedTask } from "./taskCompletion";

export interface TaskIdentity {
  /** A `SECTION_ICONS` name; the neutral star when there is no category. */
  icon: string;
  /**
   * The accent, or `null` when the task should render neutral — a commitment
   * (held time has no identity by design) or a task whose category was deleted.
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
  // Held time stays neutral even if it somehow carries a category.
  if (!isTrackedTask(task)) return NEUTRAL;
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
