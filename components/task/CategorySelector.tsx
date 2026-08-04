"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconMinus, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import type { TaskCategory } from "@/lib/useScheduleDB";
import { canDeleteCategory } from "@/lib/taskCategories";
import { accentStyles } from "@/lib/colorSystem";
import { iconGlyph } from "@/components/SectionIcons";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

export interface CategorySelectorProps {
  categories: TaskCategory[];
  selectedId: string;
  onSelect: (category: TaskCategory) => void;
  /**
   * Clears the selection back to no category. Required whenever `optional` is
   * set: without it the field is a one-way door — the placeholder advertises
   * "no category" as a valid state, but once one is picked there is no way
   * back to it.
   */
  onClear?: () => void;
  /** Opens the category sheet so the user is never blocked mid-task. */
  onCreate: () => void;
  /** Opens the same sheet in edit mode. Omitted → no pencil on the rows. */
  onEdit?: (category: TaskCategory) => void;
  /** Omitted → no trash on the rows. Guarded by `usage` below. */
  onDelete?: (category: TaskCategory) => void;
  /**
   * Task counts per category id, from `categoryUsageCounts`. Required for
   * delete to ever be enabled — with no counts there is no evidence a category
   * is unused, so the button stays disabled rather than guessing.
   */
  usage?: ReadonlyMap<string, number>;
  /**
   * Commitments may go uncategorised — held time is often genuinely anonymous.
   * Labels the field so the requirement is visible rather than implied by a
   * disabled Save button, and reveals the clear action above.
   */
  optional?: boolean;
}

/**
 * Picks the category a task belongs to — and therefore its icon and colour.
 *
 * Replaces TaskSheet's 30-icon grid + colour picker: identity is chosen once
 * per category, not re-chosen on every task. Deliberately mirrors PlanSelector
 * so the two dropdowns in this sheet behave identically.
 */
export function CategorySelector({ categories, selectedId, onSelect, onClear, onCreate, onEdit, onDelete, usage, optional = false }: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = categories.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showClear = optional && !!onClear;
  const SelectedIcon = selected ? iconGlyph(selected.icon) : null;
  const selectedAccent = selected ? accentStyles(selected.color) : null;

  return (
    <div ref={ref} className="relative">
      <p className={`mb-1.5 ${SECTION_LABEL}`}>Category{optional && " (optional)"}</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-left transition-colors dark:border-white/10 dark:bg-white/[0.04]"
      >
        {selected && SelectedIcon && selectedAccent ? (
          <>
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${selectedAccent.tint} ${selectedAccent.icon}`}>
              <SelectedIcon size={13} strokeWidth={2} />
            </div>
            <span className="flex-1 truncate text-[14px] font-semibold text-neutral-900 dark:text-white">
              {selected.title}
            </span>
          </>
        ) : (
          <span className="flex-1 text-[14px] font-medium text-neutral-400 dark:text-neutral-500">
            {optional ? "No category — counts as held time" : "Select a category…"}
          </span>
        )}
        <IconChevronDown
          size={16}
          strokeWidth={2}
          className={`shrink-0 text-neutral-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-10 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900">
          <div className="max-h-[220px] overflow-y-auto">
            {/* A selection in its own right, not an action like "New category"
                below — so it carries the same check mark as a category row. */}
            {showClear && (
              <button
                type="button"
                onClick={() => { onClear!(); setOpen(false); }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  !selected ? "bg-neutral-50 dark:bg-white/[0.04]" : "hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 dark:border-white/20">
                  <IconMinus size={14} strokeWidth={2} className="text-neutral-400 dark:text-neutral-500" />
                </div>
                <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">
                  No category — counts as held time
                </p>
                {!selected && (
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-600 dark:bg-white/[0.12] dark:text-neutral-200">
                    <IconCheck size={10} strokeWidth={3} />
                  </div>
                )}
              </button>
            )}
            {categories.map((category, i) => {
              const Icon = iconGlyph(category.icon);
              const accent = accentStyles(category.color);
              const sel = selectedId === category.id;
              const inUse = usage?.get(category.id) ?? 0;
              // No counts means no evidence it is unused, so delete stays
              // disabled. `canDeleteCategory` on an empty map would report
              // every category as free — fail closed on a destructive action.
              const deletable = !!usage && canDeleteCategory(category.id, usage);
              return (
                // A row, not a button. Edit and delete are peers of the select
                // action: nesting them inside one would be invalid HTML and the
                // inner clicks would never reach their own handlers.
                <div
                  key={category.id}
                  className={`group flex w-full items-center transition-colors ${
                    i > 0 || showClear ? "border-t border-neutral-100 dark:border-white/[0.05]" : ""
                  } ${sel ? "bg-neutral-50 dark:bg-white/[0.04]" : "hover:bg-neutral-50 dark:hover:bg-white/[0.04]"}`}
                >
                  <button
                    type="button"
                    onClick={() => { onSelect(category); setOpen(false); }}
                    className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-3 pr-1 text-left"
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accent.tint} ${accent.icon}`}>
                      <Icon size={14} strokeWidth={2} />
                    </div>
                    <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-900 dark:text-white">
                      {category.title}
                    </p>
                    {sel && (
                      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${accent.tint} ${accent.icon}`}>
                        <IconCheck size={10} strokeWidth={3} />
                      </div>
                    )}
                  </button>

                  {(onEdit || onDelete) && (
                    <div className="flex shrink-0 items-center gap-0.5 pr-2">
                      {onEdit && (
                        <button
                          type="button"
                          // Closes the dropdown: the edit sheet renders in a
                          // portal, so leaving this open would stack two layers
                          // and the outside-click handler would close it anyway.
                          onClick={() => { setOpen(false); onEdit(category); }}
                          aria-label={`Edit ${category.title}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-200/70 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.08] dark:hover:text-neutral-200"
                        >
                          <IconPencil size={14} strokeWidth={2} />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => { if (deletable) onDelete(category); }}
                          disabled={!deletable}
                          // Names the reason rather than just going dim, so the
                          // refusal is explainable instead of mysterious.
                          aria-label={
                            deletable
                              ? `Delete ${category.title}`
                              : `Can't delete ${category.title} — used by ${inUse} task${inUse === 1 ? "" : "s"}`
                          }
                          title={deletable ? undefined : "Move those tasks to another category first"}
                          className="grid h-8 w-8 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:pointer-events-none disabled:opacity-30 dark:text-neutral-500 dark:hover:text-rose-400"
                        >
                          <IconTrash size={14} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); onCreate(); }}
            className="flex w-full items-center gap-2 border-t border-neutral-100 px-3 py-2.5 text-left text-[13px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 dark:border-white/[0.05] dark:text-neutral-400 dark:hover:bg-white/[0.04]"
          >
            <IconPlus size={14} strokeWidth={2.2} className="shrink-0" />
            New category
          </button>
        </div>
      )}
    </div>
  );
}
