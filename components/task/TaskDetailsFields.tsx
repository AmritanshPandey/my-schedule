"use client";

import Input, { FORM_LABEL, Textarea } from "@/components/ui/Input";
import DateInput from "@/components/ui/DateInput";
import { ChipRow, ChoiceChip } from "@/components/ui/FormChips";
import { typography } from "@/components/ui/Typography";
import type { ProgressTracker } from "@/lib/useScheduleDB";
import type { TaskFieldDef, TaskFieldTemplate } from "@/lib/taskFields";

const SUFFIX: Partial<Record<TaskFieldDef["type"], string>> = { minutes: "min", percent: "%" };

/**
 * The category-specific fields of a task (lib/taskFields.ts), as form inputs.
 * Values are the raw typed strings; TaskSheet converts them on save. Every
 * field is optional.
 */
export default function TaskDetailsFields({
  template,
  values,
  onChange,
  trackers,
}: {
  template: TaskFieldTemplate;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** The plan's trackers, for a Finance task's "Log amount to". */
  trackers: readonly ProgressTracker[];
}) {
  return (
    <section className="space-y-4" data-testid="task-details-fields">
      <p className={typography.eyebrow}>{template.label} details</p>
      {template.fields.map((def) => {
        const value = values[def.key] ?? "";
        const set = (v: string) => onChange(def.key, v);
        switch (def.type) {
          case "longtext":
            return <Textarea key={def.key} label={def.label} value={value} onChange={(e) => set(e.target.value)} placeholder={def.placeholder} rows={2} />;
          case "date":
            return (
              <div key={def.key}>
                <p className={FORM_LABEL}>{def.label}</p>
                <DateInput value={value} onChange={set} ariaLabel={def.label} />
              </div>
            );
          case "select":
            return (
              <ChipRow key={def.key} label={def.label} ariaLabel={def.label}>
                {def.options!.map((option) => (
                  <ChoiceChip key={option} active={value === option} label={option} onClick={() => set(value === option ? "" : option)} />
                ))}
              </ChipRow>
            );
          case "tracker":
            if (trackers.length === 0) return null;
            return (
              <ChipRow key={def.key} label={def.label} ariaLabel={def.label}>
                <ChoiceChip active={!value} label="Don't log" onClick={() => set("")} />
                {trackers.map((t) => (
                  <ChoiceChip key={t.id} active={value === t.id} label={t.title} onClick={() => set(t.id)} />
                ))}
              </ChipRow>
            );
          case "number":
          case "minutes":
          case "money":
          case "percent": {
            const suffix = SUFFIX[def.type];
            return (
              <Input
                key={def.key}
                label={suffix ? `${def.label} (${suffix})` : def.label}
                type="number"
                inputMode="decimal"
                min="0"
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={def.placeholder}
              />
            );
          }
          default:
            return <Input key={def.key} label={def.label} value={value} onChange={(e) => set(e.target.value)} placeholder={def.placeholder} />;
        }
      })}
    </section>
  );
}
