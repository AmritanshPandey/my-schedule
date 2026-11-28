"use client";

import { useEffect, useState } from "react";
import type { CategoryKind, CustomTaskField, TaskCategory, TaskFieldKind } from "@/lib/useScheduleDB";
import { customFieldsFrom, inferFieldKind, TASK_FIELD_KINDS, TASK_FIELD_TEMPLATES } from "@/lib/taskFields";
import CustomFieldsEditor, { fromFieldDrafts, toFieldDrafts, type CustomFieldDraft } from "@/components/category/CustomFieldsEditor";
import { IconChevronDown } from "@tabler/icons-react";
import { colorFromIcon, type AccentColor } from "@/lib/colorSystem";
import { defaultCategoryTitle } from "@/lib/taskCategories";
import { SECTION_ICONS } from "@/components/SectionIcons";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { iconPickerClass, PlanColorPicker } from "@/components/plan/planFormShared";
import { typography } from "@/components/ui/Typography";

export const CATEGORY_TITLE_MAX = 24;

export interface CategoryDraft {
  title: string;
  icon: string;
  color: AccentColor;
  kind: CategoryKind;
  /** Undefined = suggested from the title or icon (lib/taskFields.ts). */
  fieldKind?: TaskFieldKind | "none" | "custom";
  /** The person's own fields; kept even while a built-in set is chosen. */
  customFields?: CustomTaskField[];
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
  // "auto" = follow what the title/icon suggest; stored as no fieldKind.
  const [fieldKind, setFieldKind] = useState<TaskFieldKind | "none" | "custom" | "auto">("auto");
  const [customFields, setCustomFields] = useState<CustomFieldDraft[]>([]);

  useEffect(() => {
    if (!open) return;
    if (category) {
      setTitle(category.title);
      setIcon(category.icon);
      setColor(category.color);
      setKind(category.kind ?? "active");
      setFieldKind(category.fieldKind ?? "auto");
      setCustomFields(toFieldDrafts(category.customFields));
      setColorTouched(true);
      setTitleTouched(true);
    } else {
      setTitle("");
      setIcon("star");
      setColor(colorFromIcon("star"));
      setKind("active");
      setFieldKind("auto");
      setCustomFields([]);
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
  const suggested = inferFieldKind({ title: trimmed, icon });
  const effectiveKind = fieldKind === "auto" ? suggested : fieldKind === "none" || fieldKind === "custom" ? null : fieldKind;
  const effectiveTemplate = effectiveKind ? TASK_FIELD_TEMPLATES[effectiveKind] : null;

  function handleFieldKindChange(next: TaskFieldKind | "none" | "custom" | "auto") {
    // Going custom for the first time starts from the set already showing, so
    // it's an edit of something familiar, and tasks keep the values they hold.
    if (next === "custom" && customFields.length === 0) setCustomFields(toFieldDrafts(customFieldsFrom(effectiveTemplate)));
    setFieldKind(next);
  }

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
            <p className={`mb-2 ${typography.eyebrow}`}>
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
            <p className={`mb-2 ${typography.eyebrow}`}>
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

          <div>
            <p className={`mb-2 ${typography.eyebrow}`}>Task fields</p>
            <div className="relative">
              <select
                aria-label="Task fields"
                value={fieldKind}
                onChange={(e) => handleFieldKindChange(e.target.value as TaskFieldKind | "none" | "custom" | "auto")}
                className="h-11 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-9 text-[16px] font-semibold text-neutral-700 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-200 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
              >
                <option value="auto">{suggested ? `Suggested: ${TASK_FIELD_TEMPLATES[suggested].label}` : "Suggested: none"}</option>
                {TASK_FIELD_KINDS.map((k) => (
                  <option key={k} value={k}>{TASK_FIELD_TEMPLATES[k].label}</option>
                ))}
                <option value="custom">Custom</option>
                <option value="none">None</option>
              </select>
              <IconChevronDown size={14} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-neutral-400" />
            </div>
            {fieldKind === "custom" ? (
              <div className="mt-3">
                <CustomFieldsEditor fields={customFields} onChange={setCustomFields} />
              </div>
            ) : (
            <p className="mt-2 text-[12px] text-neutral-500 dark:text-neutral-400">
              {effectiveTemplate
                ? `Tasks here ask for ${effectiveTemplate.fields.map((f) => f.label.toLowerCase()).join(", ")}${effectiveTemplate.listLabel !== "Checklist" ? `, and their checklist is ${effectiveTemplate.listLabel.toLowerCase()}` : ""}.`
                : "Tasks here have no extra fields."}
            </p>
            )}
          </div>

          <Button
            variant="primary"
            className="w-full"
            disabled={!canSave}
            onClick={() => { if (canSave) onSave({ title: trimmed, icon, color, kind, fieldKind: fieldKind === "auto" ? undefined : fieldKind, customFields: (() => { const f = fromFieldDrafts(customFields); return f.length > 0 ? f : undefined; })() }); }}
          >
            {category ? "Save category" : "Create category"}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
