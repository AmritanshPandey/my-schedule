"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconChevronDown, IconPlus } from "@tabler/icons-react";
import type { TaskCategory } from "@/lib/useScheduleDB";
import { accentStyles } from "@/lib/colorSystem";
import { iconGlyph } from "@/components/SectionIcons";

const SECTION_LABEL =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500";

export interface CategorySelectorProps {
  categories: TaskCategory[];
  selectedId: string;
  onSelect: (category: TaskCategory) => void;
  /** Opens the category sheet so the user is never blocked mid-task. */
  onCreate: () => void;
}

/**
 * Picks the category a task belongs to — and therefore its icon and colour.
 *
 * Replaces TaskSheet's 30-icon grid + colour picker: identity is chosen once
 * per category, not re-chosen on every task. Deliberately mirrors PlanSelector
 * so the two dropdowns in this sheet behave identically.
 */
export function CategorySelector({ categories, selectedId, onSelect, onCreate }: CategorySelectorProps) {
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

  const SelectedIcon = selected ? iconGlyph(selected.icon) : null;
  const selectedAccent = selected ? accentStyles(selected.color) : null;

  return (
    <div ref={ref} className="relative">
      <p className={`mb-1.5 ${SECTION_LABEL}`}>Category</p>
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
            Select a category…
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
            {categories.map((category, i) => {
              const Icon = iconGlyph(category.icon);
              const accent = accentStyles(category.color);
              const sel = selectedId === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => { onSelect(category); setOpen(false); }}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                    i > 0 ? "border-t border-neutral-100 dark:border-white/[0.05]" : ""
                  } ${sel ? "bg-neutral-50 dark:bg-white/[0.04]" : "hover:bg-neutral-50 dark:hover:bg-white/[0.04]"}`}
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
