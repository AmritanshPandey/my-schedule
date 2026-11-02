"use client";

/**
 * How often a tracker asks for an entry — daily, weekly, monthly or yearly.
 *
 * Two shapes of the same control: a segmented picker for the tracker forms,
 * where the choice is being made deliberately, and a compact select for the
 * metric cards, where it is visible but out of the way.
 */
import { IconChevronDown } from "@tabler/icons-react";
import { TRACKER_CADENCES, type TrackerCadence } from "@/lib/useScheduleDB";
import { CADENCE_LABEL } from "@/lib/trackerCadence";
import { typography } from "@/components/ui/Typography";
import { BUTTON_FOCUS_RING } from "@/components/ui/Button";

export function CadencePicker({
  value,
  onChange,
}: {
  value: TrackerCadence;
  onChange: (cadence: TrackerCadence) => void;
}) {
  return (
    <div>
      <p className={`mb-1.5 ${typography.eyebrow}`}>Check in</p>
      <div role="radiogroup" aria-label="How often to log" className="grid grid-cols-4 gap-1.5">
        {TRACKER_CADENCES.map((cadence) => {
          const sel = value === cadence;
          return (
            <button
              key={cadence}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => onChange(cadence)}
              className={`h-11 rounded-xl border text-[13px] font-semibold transition-colors ${
                sel
                  ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                  : "border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:border-white/20"
              }`}
            >
              {CADENCE_LABEL[cadence]}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
        PlanR asks for an entry once per {value === "daily" ? "day" : value.replace(/ly$/, "")} and shows when one is due.
      </p>
    </div>
  );
}

export function CadenceSelect({
  value,
  onChange,
  trackerTitle,
}: {
  value: TrackerCadence;
  onChange: (cadence: TrackerCadence) => void;
  trackerTitle: string;
}) {
  return (
    <label className="relative inline-flex h-11 shrink-0 items-center">
      <span className="sr-only">How often to log {trackerTitle}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TrackerCadence)}
        className={`h-11 appearance-none rounded-full bg-black/[0.05] pl-4 pr-9 text-[14px] font-semibold text-neutral-900 transition-colors hover:bg-black/[0.09] dark:bg-white/[0.08] dark:text-neutral-100 dark:hover:bg-white/[0.14] ${BUTTON_FOCUS_RING}`}
      >
        {TRACKER_CADENCES.map((cadence) => (
          <option key={cadence} value={cadence}>
            {CADENCE_LABEL[cadence]}
          </option>
        ))}
      </select>
      <IconChevronDown size={16} strokeWidth={2.4} aria-hidden="true" className="pointer-events-none absolute right-3.5 text-neutral-900 dark:text-neutral-100" />
    </label>
  );
}
