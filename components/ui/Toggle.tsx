"use client";

import { haptic } from "@/lib/haptics";

interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — the visible row label is usually the right value. */
  label: string;
  disabled?: boolean;
}

/** The app's switch control. Lives here rather than beside its first caller so
 *  a second settings row doesn't fork a slightly different one. */
export default function Toggle({ on, onChange, label, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => { haptic("light"); onChange(!on); }}
      className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 ${
        on ? "bg-[#00A63E]" : "bg-neutral-200 dark:bg-white/[0.12]"
      }`}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-[left] duration-200 ${
          on ? "left-[21px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}
