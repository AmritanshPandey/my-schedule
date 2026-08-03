"use client";

import { IconX } from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";

/**
 * The keyboard route to "mark missed", since a long-press is pointer-only.
 *
 * Always in the tab order; hidden until the row is hovered (desktop) or the
 * button itself takes focus.
 *
 * The reveal is plain `:focus`, not `:focus-visible` — focus-visible is a
 * heuristic that screen-reader focus does not reliably satisfy, which would
 * leave this invisible *and* pointer-events-none for exactly the people who
 * depend on it. `:focus` matches whenever the element actually holds focus.
 *
 * `opacity-0` rather than `hidden` keeps it in the accessibility tree at all
 * times, and the focus ring uses `outline` because `ring-*` compiles to
 * box-shadow, which the e2e banned-effects guard rejects.
 */
export default function MarkMissedButton({
  missed,
  onToggle,
}: {
  missed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        haptic("medium");
        onToggle();
      }}
      aria-label={missed ? "Clear missed mark" : "Mark missed"}
      aria-pressed={missed}
      className="tap-target pointer-events-none grid h-7 w-7 shrink-0 place-items-center rounded-lg text-neutral-400 opacity-0 transition-opacity focus:pointer-events-auto focus:opacity-100 focus:outline-2 focus:outline-offset-2 focus:outline-rose-500 dark:text-neutral-500 lg:group-hover/task-row:pointer-events-auto lg:group-hover/task-row:opacity-100"
    >
      <IconX size={15} strokeWidth={2.6} />
    </button>
  );
}
