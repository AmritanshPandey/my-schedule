"use client";

/**
 * "How closely did you follow it?" — the optional second beat after marking a
 * routine done. Four coarse steps, because this is a feel for the day rather
 * than a measurement; skipping it leaves the day at 100%.
 */
import { FOLLOWED_OPTIONS } from "@/lib/routineDetails";
import { haptic } from "@/lib/haptics";

interface FollowedPickerProps {
  /** The current rating, or null when the day isn't rated/done. */
  value: number | null;
  onChange: (pct: number) => void;
  /** Names the routine for screen readers. */
  routineTitle: string;
  /** Smaller caption above the chips; omit for none. */
  prompt?: string;
  className?: string;
}

export default function FollowedPicker({ value, onChange, routineTitle, prompt, className = "" }: FollowedPickerProps) {
  return (
    <div className={className}>
      {prompt && (
        <p className="mb-1.5 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">{prompt}</p>
      )}
      <div role="radiogroup" aria-label={`How closely you followed ${routineTitle}`} className="grid grid-cols-4 gap-1.5">
        {FOLLOWED_OPTIONS.map((pct) => {
          const selected = value === pct;
          return (
            <button
              key={pct}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => { haptic("light"); onChange(pct); }}
              className={`h-11 rounded-full border text-[13px] font-extrabold tabular-nums transition-colors ${
                selected
                  ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                  : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-white/[0.10] dark:bg-transparent dark:text-neutral-200 dark:hover:bg-white/[0.05]"
              }`}
            >
              {pct}%
            </button>
          );
        })}
      </div>
    </div>
  );
}
