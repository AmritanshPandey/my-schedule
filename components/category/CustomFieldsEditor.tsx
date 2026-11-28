"use client";

import { IconArrowDown, IconArrowUp, IconChevronDown, IconTrash } from "@tabler/icons-react";
import type { CustomTaskField, CustomTaskFieldType } from "@/lib/useScheduleDB";
import { CUSTOM_FIELD_LABEL_MAX, CUSTOM_FIELD_TYPES, MAX_CUSTOM_FIELDS, newCustomFieldKey, normalizeCustomFields } from "@/lib/taskFields";
import AddRowButton from "@/components/ui/AddRowButton";
import IconButton from "@/components/ui/IconButton";
import { FORM_INPUT_CLASS } from "@/components/ui/Input";

/** A field while it's being edited: choices stay raw text so typing a comma works. */
export interface CustomFieldDraft {
  key: string;
  label: string;
  type: CustomTaskFieldType;
  optionsText: string;
  role?: "duration";
}

export function toFieldDrafts(fields: readonly CustomTaskField[] | undefined): CustomFieldDraft[] {
  return (fields ?? []).map((f) => ({ key: f.key, label: f.label, type: f.type, optionsText: (f.options ?? []).join(", "), role: f.role }));
}

export function fromFieldDrafts(drafts: readonly CustomFieldDraft[]): CustomTaskField[] {
  return normalizeCustomFields(drafts.map((d) => ({ key: d.key, label: d.label, type: d.type, options: d.optionsText.split(","), role: d.role })));
}

const SELECT_CLASS =
  "h-11 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-9 text-[16px] font-semibold text-neutral-700 outline-none transition-colors focus:border-neutral-300 focus:bg-neutral-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-200 dark:focus:border-white/20 dark:focus:bg-white/[0.07]";

/**
 * The person's own task fields for a category: a name and a type each, choices
 * for a "Choice" field, in the order tasks will show them. Every field stays
 * optional on the task, like the built-in sets.
 */
export default function CustomFieldsEditor({
  fields,
  onChange,
}: {
  fields: CustomFieldDraft[];
  onChange: (next: CustomFieldDraft[]) => void;
}) {
  const update = (i: number, patch: Partial<CustomFieldDraft>) => onChange(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...fields];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3" data-testid="custom-fields-editor">
      {fields.length === 0 && (
        <p className="text-[12px] text-neutral-500 dark:text-neutral-400">No fields yet. Add the things you want each task here to ask for.</p>
      )}
      {fields.map((field, i) => (
        <div key={field.key} className="space-y-2 rounded-2xl border border-neutral-200 p-3 dark:border-white/[0.08]">
          <div className="flex items-center gap-2">
            <input
              value={field.label}
              maxLength={CUSTOM_FIELD_LABEL_MAX}
              onChange={(e) => update(i, { label: e.target.value })}
              placeholder="Field name"
              aria-label={`Field ${i + 1} name`}
              autoComplete="off"
              className={`${FORM_INPUT_CLASS} min-w-0 flex-1 px-3`}
            />
            <IconButton label={`Move ${field.label || "field"} up`} variant="ghost" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
              <IconArrowUp size={15} strokeWidth={2} />
            </IconButton>
            <IconButton label={`Move ${field.label || "field"} down`} variant="ghost" size="sm" disabled={i === fields.length - 1} onClick={() => move(i, 1)}>
              <IconArrowDown size={15} strokeWidth={2} />
            </IconButton>
            <IconButton label={`Remove ${field.label || "field"}`} variant="destructive" size="sm" onClick={() => onChange(fields.filter((_, j) => j !== i))}>
              <IconTrash size={15} strokeWidth={2} />
            </IconButton>
          </div>
          <div className="relative">
            <select
              aria-label={`Field ${i + 1} type`}
              value={field.type}
              onChange={(e) => update(i, { type: e.target.value as CustomTaskFieldType })}
              className={SELECT_CLASS}
            >
              {CUSTOM_FIELD_TYPES.map((t) => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
            <IconChevronDown size={14} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-neutral-400" />
          </div>
          {field.type === "select" && (
            <input
              value={field.optionsText}
              onChange={(e) => update(i, { optionsText: e.target.value })}
              placeholder="Choices, separated by commas"
              aria-label={`Field ${i + 1} choices`}
              autoComplete="off"
              className={`${FORM_INPUT_CLASS} px-3`}
            />
          )}
          {field.type === "minutes" && (
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] font-medium text-neutral-600 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={field.role === "duration"}
                onChange={(e) => update(i, { role: e.target.checked ? "duration" : undefined })}
                className="h-4 w-4 accent-neutral-900 dark:accent-white"
              />
              Counts toward the task&apos;s length
            </label>
          )}
        </div>
      ))}
      {fields.length < MAX_CUSTOM_FIELDS && (
        <AddRowButton label="Add field" onClick={() => onChange([...fields, { key: newCustomFieldKey(), label: "", type: "text", optionsText: "" }])} />
      )}
    </div>
  );
}
