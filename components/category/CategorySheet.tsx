"use client";

import { useEffect, useState } from "react";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { SheetTitle, typography } from "@/components/ui/Typography";
import Button from "@/components/ui/Button";
import { IconPicker } from "@/components/ui/IconPicker";
import { PlanColorPicker } from "@/components/plan/planFormShared";
import type { AccentColor } from "@/lib/colorSystem";
import type { Category } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";

const NAME_MAX = 24;

interface CategorySheetProps {
  open: boolean;
  onClose: () => void;
  initial?: Category | null;
  onSave: (data: Omit<Category, "id">) => void;
  /** Absent when this is the last category — there must always be one left. */
  onDelete?: () => void;
}

/**
 * Create or edit one category: name, icon, colour.
 *
 * A category needs its own icon because commitments have no icon of their own —
 * the task sheet hides that control for them, so the category is what the
 * wallpaper and the chips draw.
 */
export default function CategorySheet({ open, onClose, initial, onSave, onDelete }: CategorySheetProps) {
  const isEdit = !!initial;
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("star");
  const [color, setColor] = useState<AccentColor>("cyan");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setIcon(initial?.icon ?? "star");
    setColor(initial?.color ?? "cyan");
    // Pre-fill only on open, so typing isn't clobbered by a parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSave = name.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    haptic("light");
    onSave({ name: name.trim().slice(0, NAME_MAX), icon, color, sortOrder: initial?.sortOrder });
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-5 pb-6 pt-2">
        <SheetTitle className="mb-5">{isEdit ? "Edit Category" : "New Category"}</SheetTitle>

        <div className="space-y-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
            placeholder="e.g. Deep work, Family, Travel…"
            autoFocus
            aria-label="Category name"
            className="h-11 w-full min-w-0 rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[16px] font-medium text-neutral-900 outline-none placeholder:text-neutral-400 transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-500 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
          />

          <IconPicker
            value={icon}
            onChange={setIcon}
            labelClassName={`mb-2 ${typography.eyebrow}`}
          />

          <PlanColorPicker value={color} onChange={setColor} />

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-[15px] font-bold text-white transition-opacity disabled:opacity-40 dark:bg-white dark:text-neutral-950"
          >
            {isEdit ? <IconCheck size={16} strokeWidth={2.5} /> : <IconPlus size={16} strokeWidth={2.5} />}
            {isEdit ? "Save Category" : "Add Category"}
          </button>

          {isEdit && onDelete && (
            <Button
              variant="dangerSecondary"
              fullWidth
              onClick={() => { haptic("light"); onDelete(); onClose(); }}
            >
              Delete Category
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
