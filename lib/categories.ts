/**
 * Categories: what *kind of time* a block is.
 *
 * Lives here rather than in `useScheduleDB.ts` for the same reason
 * `scheduleNormalize.ts` does — that file is a "use client" React hook module,
 * and this logic has to stay importable from plain unit tests. `useScheduleDB`
 * re-exports everything below, so import sites can use either path.
 *
 * Every read of a task's category goes through `resolveCategory`. That matters
 * because the donut claims to total the day: if a task's `categoryId` pointed at
 * a deleted category and we skipped it — the way `buildDayBreakdown` skips a
 * dangling `planId` — its minutes would silently vanish from a chart whose whole
 * job is to account for them. A dangling plan loses a wedge; a dangling category
 * loses the truth.
 */

import type { AccentColor } from "./colorSystem";
import type { Schedule } from "./useScheduleDB";
import { DAYS } from "./scheduleConstants";
import { seedCategoryIdFromIcon } from "./scheduleNormalize";

/**
 * Orthogonal to both `Plan` (which owns milestones and consistency) and
 * `taskType` (which decides whether a block is tracked at all). Plans answer
 * "what am I working toward"; categories answer "where did the day actually
 * go" — and a commitment with no plan still has a real answer to the second.
 *
 * Uses `AccentColor` rather than a narrow union of its own: `RitualColor` went
 * the other way and cost four duplicated Tailwind class maps.
 */
export interface Category {
  id: string;
  name: string;
  icon: string;          // a SECTION_ICONS name
  color: AccentColor;
  sortOrder?: number;
}

/**
 * Fixed ids, not generated ones: migration must assign a category to an existing
 * task without seeing the category list, and re-running it must not duplicate.
 */
export const SEED_CATEGORY_IDS = {
  work: "cat-work",
  sleep: "cat-sleep",
  routine: "cat-routine",
} as const;

export function seedCategories(): Category[] {
  return [
    { id: SEED_CATEGORY_IDS.work, name: "Work", icon: "briefcase", color: "red", sortOrder: 0 },
    { id: SEED_CATEGORY_IDS.sleep, name: "Sleep", icon: "sleep", color: "blue", sortOrder: 1 },
    { id: SEED_CATEGORY_IDS.routine, name: "Routine", icon: "star", color: "orange", sortOrder: 2 },
  ];
}

/** Last-resort category when the list is somehow empty. Never persisted. */
const FALLBACK: Category = { id: SEED_CATEGORY_IDS.routine, name: "Routine", icon: "star", color: "orange" };

/**
 * The category a task belongs to. Always returns something:
 * exact match → icon-derived seed → first category → a built-in fallback.
 */
export function resolveCategory(
  categories: readonly Category[],
  categoryId: string | undefined,
  icon?: string,
): Category {
  if (categoryId) {
    const exact = categories.find((c) => c.id === categoryId);
    if (exact) return exact;
  }
  // A task whose seeded category the user deleted still has a sensible home.
  if (icon) {
    const seeded = categories.find((c) => c.id === seedCategoryIdFromIcon(icon));
    if (seeded) return seeded;
  }
  return categories[0] ?? FALLBACK;
}

/**
 * Normalize a stored category list, seeding the three defaults when it is empty
 * or missing. Shape-filters the same way `migrate()` handles rituals.
 */
export function normalizeCategories(raw: unknown): Category[] {
  const list = Array.isArray(raw)
    ? (raw as Category[]).filter(
        (c) =>
          c &&
          typeof c.id === "string" &&
          typeof c.name === "string" &&
          typeof c.icon === "string",
      )
    : [];
  return list.length > 0 ? list : seedCategories();
}

/** How many tasks across the whole week reference a category. */
export function countTasksInCategory(
  activities: Partial<Record<string, Array<{ id: string; categoryId?: string; icon: string }>>>,
  categories: readonly Category[],
  categoryId: string,
): number {
  const seen = new Set<string>();
  for (const tasks of Object.values(activities)) {
    for (const task of tasks ?? []) {
      // One shared id spans every weekday copy — count the task, not the copies.
      if (seen.has(task.id)) continue;
      if (resolveCategory(categories, task.categoryId, task.icon).id === categoryId) {
        seen.add(task.id);
      }
    }
  }
  return seen.size;
}

/**
 * Remove a category and re-file every task that pointed at it.
 *
 * The reassignment is the point: leaving tasks with a dangling id would work
 * (they'd fall back at read time) but the fallback is a safety net, not a
 * storage strategy — the user should be able to see where their time went.
 * Refuses to delete the last remaining category.
 */
export function deleteCategory(id: string, reassignTo: string) {
  return (prev: Schedule): Schedule => {
    const remaining = (prev.categories ?? []).filter((c) => c.id !== id);
    if (remaining.length === 0) return prev;

    const target = remaining.some((c) => c.id === reassignTo) ? reassignTo : remaining[0].id;
    const activities = { ...prev.activities };
    for (const day of DAYS) {
      const tasks = activities[day];
      if (!tasks?.length) continue;
      let changed = false;
      const next = tasks.map((t) => {
        if (t.categoryId !== id) return t;
        changed = true;
        return { ...t, categoryId: target };
      });
      if (changed) activities[day] = next;
    }

    return { ...prev, categories: remaining, activities };
  };
}
