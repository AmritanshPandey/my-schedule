"use client";

import { useRef } from "react";

/**
 * The single-select mode switch: pick exactly one of two to four options.
 *
 * DESIGN.md §Segmented Tabs specifies this shape — a pill track with the
 * selected option raised out of it — and until now nothing implemented it, so
 * every caller reached for the nearest thing that existed: a row of
 * `rounded-full` buttons filled with ink when active. That is the *primary
 * button* costume, which made a tertiary control (which mode am I in) shout
 * louder on the page than the primary action (save the thing). TaskSheet alone
 * carried four hand-rolled copies of it.
 *
 * The track also fixes what four copies of a bare `<button>` could not:
 * selection is announced. A radiogroup with `aria-checked` and a roving
 * tabindex is what a screen reader needs to say "Session, 2 of 3, selected";
 * plain buttons say only "Session, button" and leave the user to guess.
 * `components/ui/TimeInput.tsx` already does this for AM/PM — this is the same
 * pattern, extracted.
 *
 * `rounded-full` is deliberately not used: the full-radius pill is this app's
 * *action* shape (Button, chips). A squarer track keeps a mode switch legible
 * as a mode switch.
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  /** Names the group for assistive tech — usually the visible section label. */
  ariaLabel: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export default function SegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onChange,
  className = "",
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  /** Arrows move the selection, which is how a radio group is expected to behave. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    if (!back && !forward) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + (forward ? 1 : options.length - 1)) % options.length];
    onChange(next.value);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`grid gap-1 rounded-2xl bg-neutral-100 p-1 dark:bg-white/[0.05] ${className}`}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-value={option.value}
            // Roving tabindex: the whole group is one tab stop.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`flex h-11 min-w-0 items-center justify-center rounded-xl px-2 text-[13px] font-semibold transition-colors duration-150 ${
              active
                ? "bg-white text-neutral-900 ring-1 ring-black/[0.06] dark:bg-white/[0.12] dark:text-white dark:ring-white/10"
                : // neutral-600, not the usual muted neutral-500: the track is
                  // one tone darker than the page, and the muted grey measured
                  // 4.35:1 on it, just under AA. Selection is carried by the
                  // raised fill, so the unselected label can be this readable
                  // without blurring which one is chosen.
                  "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
