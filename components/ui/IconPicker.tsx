"use client";

import { SECTION_ICONS } from "@/components/SectionIcons";
import { iconPickerClass } from "@/components/plan/planFormShared";

/**
 * The shared icon grid. The same `SECTION_ICONS.map(...)` block was inlined at
 * five call sites; this is the one worth sharing, since the task sheet and the
 * category sheet must offer an identical set (a category's icon has to be
 * choosable from exactly what a task can wear).
 *
 * Left as-is at the plan sheets' call sites — they use different grid classes
 * and migrating them is unrelated churn.
 */
export function IconPicker({
  value,
  onChange,
  label = "Icon",
  labelClassName,
}: {
  value: string;
  onChange: (name: string) => void;
  /** Pass null to render the grid with no heading. */
  label?: string | null;
  labelClassName?: string;
}) {
  return (
    <div>
      {label !== null && <p className={labelClassName}>{label}</p>}
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {SECTION_ICONS.map(({ name, label: iconLabel, icon: Icon }) => (
          <button
            key={name}
            type="button"
            aria-label={iconLabel}
            aria-pressed={value === name}
            title={iconLabel}
            onClick={() => onChange(name)}
            className={iconPickerClass(value === name)}
          >
            <Icon size={18} strokeWidth={1.9} />
          </button>
        ))}
      </div>
    </div>
  );
}
