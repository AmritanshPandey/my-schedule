/**
 * Task categories — the thing a task *is*, and the owner of its identity.
 *
 * Colour and icon used to live on every individual task, so "Workout" was
 * orange only because the user picked orange each time. They now live here, on
 * a category the task points at, which is what makes a hue on the timeline mean
 * something. See `taskIdentity` for resolution and `CategoryRegistry` for the
 * one-time back-fill from the old per-task icons.
 *
 * Pure and React-free: `lib/scheduleNormalize.ts` imports it on the migration
 * path, which is unit-tested under plain node.
 */

import type { AccentColor } from "./colorSystem";
import { colorFromIcon } from "./colorSystem";
import { DAYS } from "./scheduleConstants";
import type { DayKey, Task, TaskCategory } from "./useScheduleDB";

/**
 * How many tasks reference each category, across every weekday bucket.
 *
 * A recurring task shares one id across the weekdays it repeats on, so ids are
 * de-duplicated — otherwise a Mon/Wed/Fri habit would report as three tasks and
 * make the "used by N" copy wrong.
 */
export function categoryUsageCounts(
  activities: Partial<Record<DayKey, Task[]>>,
): Map<string, number> {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const day of DAYS) {
    for (const task of activities[day] ?? []) {
      if (!task.categoryId || seen.has(task.id)) continue;
      seen.add(task.id);
      counts.set(task.categoryId, (counts.get(task.categoryId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Whether a category can be removed.
 *
 * Deleting one that is in use is blocked rather than cascading: silently
 * stripping the colour from twelve tasks is not something a user can undo or
 * would have asked for. Callers surface the count so the refusal is explainable
 * rather than mysterious.
 */
export function canDeleteCategory(categoryId: string, usage: ReadonlyMap<string, number>): boolean {
  return (usage.get(categoryId) ?? 0) === 0;
}

/**
 * Default category title for each icon name. Shared with `SECTION_ICONS`
 * (components/SectionIcons.tsx), which renders these as its picker labels —
 * one source of truth so a renamed icon can't mean two things.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  run: "Cardio",
  school: "Study",
  book: "Reading",
  sleep: "Sleep",
  star: "Routine",
  briefcase: "Work",
  car: "Commute",
  brain: "Project",
  barbell: "Workout",
  code: "Coding",
  heart: "Health",
  music: "Music",
  palette: "Art",
  plane: "Travel",
  chefhat: "Cooking",
  coin: "Finance",
  camera: "Photos",
  users: "Social",
  leaf: "Nature",
  pencil: "Writing",
  yoga: "Yoga",
  bike: "Cycling",
  mountain: "Hiking",
  droplet: "Hydration",
  moodsmile: "Mindset",
  flame: "Streak",
  language: "Language",
  pill: "Wellness",
  bolt: "Energy",
  dna: "Science",
};

/** Title a freshly derived category gets. Falls back to the raw icon name. */
export function defaultCategoryTitle(icon: string): string {
  return CATEGORY_LABELS[icon] ?? (icon ? icon[0].toUpperCase() + icon.slice(1) : "Category");
}

/** Stable id for a category derived from an icon, so re-runs don't duplicate. */
export function derivedCategoryId(icon: string): string {
  return `cat-${icon}`;
}

/**
 * Collects the categories a schedule needs while it is being normalized.
 *
 * Seeded with whatever categories are already stored; `adopt` is only reached
 * by tasks that still carry a pre-category `icon`, which makes the whole
 * migration idempotent — once every task has a `categoryId`, nothing is adopted
 * and `all()` returns the stored list untouched.
 *
 * Colours are tallied rather than taken first-come: when ten workouts are
 * orange and one is red, the category is orange. The minority colour is lost,
 * which is the accepted cost of collapsing per-task colour into per-category.
 */
export class CategoryRegistry {
  private readonly existing: TaskCategory[];
  private readonly existingIds: Set<string>;
  private readonly byIcon = new Map<string, Map<AccentColor, number>>();

  constructor(existing: readonly TaskCategory[] = []) {
    this.existing = existing.map((c) => ({ ...c }));
    this.existingIds = new Set(this.existing.map((c) => c.id));
  }

  /** True when this id already resolves to a stored category. */
  has(id: string): boolean {
    return this.existingIds.has(id);
  }

  /**
   * Map a legacy task icon (+ its old colour) onto a category, creating one on
   * first sight. Returns the category id to stamp on the task.
   */
  adopt(icon: string, color?: string): string {
    const key = icon || "star";
    const tally = this.byIcon.get(key) ?? new Map<AccentColor, number>();
    if (color) tally.set(color as AccentColor, (tally.get(color as AccentColor) ?? 0) + 1);
    this.byIcon.set(key, tally);
    return derivedCategoryId(key);
  }

  /** Stored categories first, then any derived during this pass. */
  all(): TaskCategory[] {
    const derived: TaskCategory[] = [];
    for (const [icon, tally] of this.byIcon) {
      const id = derivedCategoryId(icon);
      if (this.existingIds.has(id)) continue; // already stored — leave it alone
      let color: AccentColor = colorFromIcon(icon);
      let best = 0;
      for (const [candidate, count] of tally) {
        if (count > best) {
          best = count;
          color = candidate;
        }
      }
      derived.push({ id, title: defaultCategoryTitle(icon), icon, color });
    }
    derived.sort((a, b) => a.title.localeCompare(b.title));
    return [...this.existing, ...derived];
  }
}

/**
 * The category matching an icon, creating one if the user has none yet.
 *
 * Used by the non-sheet creation paths (AI, templates, bulk import) which think
 * in icons because that is what their prompts and fixtures produce.
 */
/**
 * Resolve an icon to a category id, appending a new category to `draft` when
 * none matches. `draft` is a working copy the caller writes back to the
 * schedule, so a batch import that mentions three new icons creates exactly
 * three categories.
 */
export function ensureCategoryIn(draft: TaskCategory[], icon: string): string {
  const { category, created } = categoryForIcon(draft, icon);
  if (created) draft.push(category);
  return category.id;
}

export function categoryForIcon(
  categories: readonly TaskCategory[],
  icon: string,
): { category: TaskCategory; created: boolean } {
  const existing = categories.find((c) => c.icon === icon);
  if (existing) return { category: existing, created: false };
  const key = icon || "star";
  return {
    category: {
      id: derivedCategoryId(key),
      title: defaultCategoryTitle(key),
      icon: key,
      color: colorFromIcon(key),
    },
    created: true,
  };
}
