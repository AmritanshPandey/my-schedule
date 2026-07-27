"use client";

import { useState } from "react";
import { IconChevronRight, IconPlus } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { SheetTitle } from "@/components/ui/Typography";
import CategorySheet from "@/components/category/CategorySheet";
import { SECTION_ICONS } from "@/components/SectionIcons";
import { accentStyles } from "@/lib/colorSystem";
import { countTasksInCategory } from "@/lib/categories";
import type { Category, DayKey, Task } from "@/lib/useScheduleDB";

const ICON_BY_NAME = new Map(SECTION_ICONS.map((s) => [s.name, s.icon]));

interface CategoryManagerSheetProps {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  activities: Partial<Record<DayKey, Task[]>>;
  onAdd: (data: Omit<Category, "id">) => void;
  onUpdate: (id: string, data: Omit<Category, "id">) => void;
  onDelete: (id: string) => void;
}

/**
 * The list of categories, with each one's task count. Reached from Settings.
 *
 * Deliberately not a top-level screen: categories are set up once and then
 * mostly picked from inside the task sheet, so they belong with the other
 * configuration rather than in the primary navigation.
 */
export default function CategoryManagerSheet({
  open,
  onClose,
  categories,
  activities,
  onAdd,
  onUpdate,
  onDelete,
}: CategoryManagerSheetProps) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const sorted = [...categories].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));

  return (
    <>
      <BottomSheet open={open} onClose={onClose}>
        <div className="px-5 pb-6 pt-2">
          <div className="mb-5 flex items-center justify-between gap-3">
            <SheetTitle>Categories</SheetTitle>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-bold text-white dark:bg-white dark:text-neutral-950"
            >
              <IconPlus size={14} strokeWidth={2.5} />
              New
            </button>
          </div>

          <p className="mb-4 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            Categories are how the day splits in &ldquo;Where the day goes&rdquo;. Every task
            belongs to one, whether or not it belongs to a plan.
          </p>

          <ul className="flex flex-col gap-2">
            {sorted.map((category) => {
              const Icon = ICON_BY_NAME.get(category.icon) ?? ICON_BY_NAME.get("star")!;
              const styles = accentStyles(category.color);
              const count = countTasksInCategory(activities, categories, category.id);
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(category)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 bg-white px-3 py-3 text-left transition-colors hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${styles.tint} ${styles.text}`}>
                      <Icon size={17} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-neutral-900 dark:text-white">
                        {category.name}
                      </span>
                      <span className="block text-[12px] text-neutral-500 dark:text-neutral-400">
                        {count === 0 ? "No tasks" : `${count} task${count === 1 ? "" : "s"}`}
                      </span>
                    </span>
                    <IconChevronRight size={16} strokeWidth={2} className="shrink-0 text-neutral-300 dark:text-neutral-600" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </BottomSheet>

      <CategorySheet
        open={creating}
        onClose={() => setCreating(false)}
        onSave={onAdd}
      />

      <CategorySheet
        open={!!editing}
        onClose={() => setEditing(null)}
        initial={editing}
        onSave={(data) => editing && onUpdate(editing.id, data)}
        // Deleting the last category would leave tasks with nowhere to go.
        onDelete={editing && categories.length > 1 ? () => onDelete(editing.id) : undefined}
      />
    </>
  );
}
