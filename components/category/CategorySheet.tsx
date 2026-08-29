"use client";

import { useEffect, useState } from "react";
import type { CategoryKind, TaskCategory } from "@/lib/useScheduleDB";
import { colorFromIcon, type AccentColor } from "@/lib/colorSystem";
import { defaultCategoryTitle } from "@/lib/taskCategories";
import { SECTION_ICONS } from "@/components/SectionIcons";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { iconPickerClass, PlanColorPicker } from "@/components/plan/planFormShared";

export const CATEGORY_TITLE_MAX = 24;

export interface CategoryDraft {
  title: string;
  icon: string;
  color: AccentColor;
  kind: CategoryKind;
}

/**
 * What this category's hours *are*, for the Overview's day accounting.
 *
 * Sleep defines the waking day rather than being spent inside it, and rest is
 * recovery you scheduled on purpose — neither is work. Without this the app had
 * to guess, and guessed "work" for everything, which is how a night's sleep
 * ended up charged against the same budget as a workout.
 */
const KIND_OPTIONS: Array<{ value: CategoryKind; label: string; hint: string }> = [
  { value: "active", label: "Active", hint: "Work, training, errands — effort that fills your day." },
  { value: "rest", label: "Rest", hint: "Deliberate recovery. Counts as time spent, never as work." },
  { value: "sleep", label: "Sleep", hint: "Sets the waking day. Kept out of the active budget entirely." },
];

interface CategorySheetProps {
  open: boolean;
  /** The category being edited, or null to create a new one. */
  category: TaskCategory | null;
  onClose: () => void;
  onSave: (draft: CategoryDraft) => void;
}

/**
 * Create or edit one category.
 *
 * This form used to live on the task (TaskSheet's icon grid + colour picker),
 * where it made every block's colour a per-task decision. Moving it here is what
 * makes colour mean "what kind of work this is".
 */
export default function CategorySheet({ open, category, onClose, onSave }: CategorySheetProps) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("star");
  const [color, setColor] = useState<AccentColor>("cyan");
  // Until the user picks a colour, the icon keeps choosing one for them — the
  // same rule TaskSheet used, moved here with the rest of identity.
  const [colorTouched, setColorTouched] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [kind, setKind] = useState<CategoryKind>("active");

  useEffect(() => {
    if (!open) return;
    if (category) {
      setTitle(category.title);
      setIcon(category.icon);
      setColor(category.color);
      setKind(category.kind ?? "active");
      setColorTouched(true);
      setTitleTouched(true);
    } else {
      setTitle("");
      setIcon("star");
      setColor(colorFromIcon("star"));
      setKind("active");
      setColorTouched(false);
      setTitleTouched(false);
    }
  }, [open, category]);

  function handleSelectIcon(name: string) {
    setIcon(name);
    // Matches what `normalizeCategories` infers for an unclassified sleep-icon
    // category, so the picker and the stored default never disagree.
    if (name === "sleep" && kind === "active") setKind("sleep");
    if (!colorTouched) setColor(colorFromIcon(name));
    // An untouched title follows the icon too, so picking "Workout" and hitting
    // save just works — but anything the user typed is never overwritten.
    if (!titleTouched) setTitle(defaultCategoryTitle(name));
  }

  const trimmed = title.trim();
  const canSave = trimmed.length > 0;

  return (
    <BottomSheet open={open} onClose={onClose} desktopWidth="max-w-[520px]">
      <div
        className="px-5 pt-2"
        style={{ paddingBottom: "max(32px, calc(env(safe-area-inset-bottom) + 20px))" }}
      >
        <SheetHeader
          eyebrow="Category"
          title={category ? "Edit category" : "New category"}
          onClose={onClose}
        />

        <div className="mt-5 space-y-5">
          <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
            Every task in this category shares its icon and colour.
          </p>
          <Input
            label="Title"
            value={title}
            maxLength={CATEGORY_TITLE_MAX}
            onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }}
            placeholder="Deep work"
            autoComplete="off"
            enterKeyHint="done"
            aria-label="Category title"
          />

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              Icon
            </p>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
              {SECTION_ICONS.map(({ name, label, icon: Icon }) => (
                <button
                  key={name}
                  type="button"
                  aria-label={label}
                  aria-pressed={icon === name}
                  title={label}
                  onClick={() => handleSelectIcon(name)}
                  className={iconPickerClass(icon === name)}
                >
                  <Icon size={18} strokeWidth={1.9} />
                </button>
              ))}
            </div>
          </div>

          <PlanColorPicker value={color} onChange={(next) => { setColor(next); setColorTouched(true); }} />

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
              Counts as
            </p>
            <div role="radiogroup" aria-label="Counts as" className="flex gap-2">
              {KIND_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === option.value}
                  onClick={() => setKind(option.value)}
                  className={`flex-1 rounded-xl border px-3 py-2 text-[13px] font-bold transition-colors ${
                    kind === option.value
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                      : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.12] dark:text-neutral-300 dark:hover:bg-white/[0.05]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-neutral-500 dark:text-neutral-400">
              {KIND_OPTIONS.find((o) => o.value === kind)?.hint}
            </p>
          </div>

          <Button
            variant="primary"
            className="w-full"
            disabled={!canSave}
            onClick={() => { if (canSave) onSave({ title: trimmed, icon, color, kind }); }}
          >
            {category ? "Save category" : "Create category"}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
