"use client";

import { useMemo, useState } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import type { Schedule, TaskCategory } from "@/lib/useScheduleDB";
import { canDeleteCategory, categoryUsageCounts } from "@/lib/taskCategories";
import { accentStyles } from "@/lib/colorSystem";
import { iconGlyph } from "@/components/SectionIcons";
import { haptic } from "@/lib/haptics";
import CategorySheet, { type CategoryDraft } from "@/components/category/CategorySheet";

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

interface CategoryManagerProps {
  schedule: Schedule;
  setSchedule: SetScheduleFn;
}

function uid(): string {
  return `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Settings → Categories. Create, rename, recolour and delete the categories
 * every task's identity resolves through.
 *
 * Deleting an in-use category is blocked rather than cascading: silently
 * stripping colour from twelve tasks is the kind of change a user can't undo
 * and wouldn't have asked for. The row states the count instead.
 */
export default function CategoryManager({ schedule, setSchedule }: CategoryManagerProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TaskCategory | null>(null);

  const usageById = useMemo(() => categoryUsageCounts(schedule.activities), [schedule.activities]);

  const categories = useMemo(
    () => [...schedule.categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title)),
    [schedule.categories],
  );

  function handleSave(draft: CategoryDraft) {
    setSchedule((prev) => {
      if (editing) {
        return {
          ...prev,
          categories: prev.categories.map((c) => (c.id === editing.id ? { ...c, ...draft } : c)),
        };
      }
      return { ...prev, categories: [...prev.categories, { id: uid(), ...draft }] };
    });
    setSheetOpen(false);
    setEditing(null);
  }

  function handleDelete(category: TaskCategory) {
    if (!canDeleteCategory(category.id, usageById)) return;
    haptic("light");
    setSchedule((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.id !== category.id) }));
  }

  return (
    <>
      {categories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center dark:border-white/[0.10]">
          <p className="text-[13px] font-bold text-neutral-900 dark:text-white">No categories yet</p>
          <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
            Add one to give your tasks a colour.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
          {categories.map((category) => {
            const Icon = iconGlyph(category.icon);
            const accent = accentStyles(category.color);
            const inUse = usageById.get(category.id) ?? 0;
            return (
              <div key={category.id} className="flex items-center gap-3 py-2.5">
                <button
                  type="button"
                  onClick={() => { haptic("light"); setEditing(category); setSheetOpen(true); }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${accent.tint} ${accent.icon}`}>
                    <Icon size={17} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold text-neutral-900 dark:text-white">
                      {category.title}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-neutral-500 dark:text-neutral-400">
                      {inUse === 0 ? "Not used yet" : `Used by ${inUse} task${inUse === 1 ? "" : "s"}`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(category)}
                  disabled={inUse > 0}
                  aria-label={
                    inUse > 0
                      ? `Can't delete ${category.title} — used by ${inUse} task${inUse === 1 ? "" : "s"}`
                      : `Delete ${category.title}`
                  }
                  title={inUse > 0 ? "Move those tasks to another category first" : undefined}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-neutral-400 transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:pointer-events-none disabled:opacity-30 dark:text-neutral-500 dark:hover:text-rose-400"
                >
                  <IconTrash size={16} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => { haptic("light"); setEditing(null); setSheetOpen(true); }}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-200 py-2.5 text-[13px] font-semibold text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-700 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:border-white/20 dark:hover:text-neutral-200"
      >
        <IconPlus size={15} strokeWidth={2.2} />
        New category
      </button>

      <CategorySheet
        open={sheetOpen}
        category={editing}
        onClose={() => { setSheetOpen(false); setEditing(null); }}
        onSave={handleSave}
      />
    </>
  );
}
