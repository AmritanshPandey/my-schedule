"use client";

import { IconAlertTriangle } from "@tabler/icons-react";

interface AuthErrorNoteProps {
  /** Inline failure copy from `authErrorMessage`, or null for none. */
  message: string | null;
  /** True when Firebase isn't configured — sign-in can never succeed here. */
  unavailable?: boolean;
  /** Referenced by the button's `aria-describedby`. Unique per surface. */
  id?: string;
  /** Type scale for the host surface, e.g. "text-[11px]". */
  className?: string;
}

/**
 * The line beneath "Continue with Google".
 *
 * Two states, deliberately styled apart:
 *  - `unavailable` — a build fact, not something the user did. Calm and muted,
 *    always present, and it explains why the button is disabled.
 *  - `message` — an actual failure. Rose, announced via role="alert".
 *
 * Colors are `rose-600/400`, not the repo's more common `rose-500`: at these
 * 11–13px sizes rose-500 on white is ~3.7:1 and misses WCAG AA. This pairing
 * matches the sanctioned rose entry in `lib/colorSystem.ts`.
 *
 * Borderless by design — two of the three hosts sit inside a bordered card,
 * and DESIGN.md forbids nesting a bordered box in another.
 *
 * Intentionally NOT animated, unlike some status lines it sits near.
 * Both Framer entrances were tried here and both stranded the message
 * invisible: `height: "auto"` re-measured against the collapsed element on any
 * re-render (a theme toggle would do it) and latched at height:0, and the
 * opacity/translate variant never left its `initial` state at all. A message
 * that exists only to break a silent failure cannot depend on an animation
 * frame landing — so it renders plainly and is always visible. This also
 * matches the repo's most common inline-error idiom (TaskSheet, StrategyUpload).
 */
export function AuthErrorNote({
  message,
  unavailable = false,
  id,
  className = "text-[12px]",
}: AuthErrorNoteProps) {
  if (unavailable) {
    return (
      <p
        id={id}
        className={`mt-2 leading-snug text-neutral-500 dark:text-neutral-400 ${className}`}
      >
        Sync is unavailable in this build.
      </p>
    );
  }

  if (!message) return null;

  return (
    <p
      id={id}
      role="alert"
      className={`mt-2 flex items-start gap-1.5 leading-snug text-rose-600 dark:text-rose-400 ${className}`}
    >
      <IconAlertTriangle
        size={12}
        strokeWidth={2}
        className="mt-px shrink-0"
        aria-hidden="true"
      />
      {message}
    </p>
  );
}
