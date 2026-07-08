/**
 * Motion tokens — the single source of truth for animation timing.
 *
 * Scale:
 * - fast (150ms): hover, press, icon flips, checkmark draws
 * - base (200ms): enter/exit, tab switches, small reveals
 * - slow (300ms): large surface moves (position eases, panel slides)
 * - data (450ms): progress fills, chart bars, number count-ups
 *
 * EASE_OUT is the house curve (ease-out-quint family) — decisive deceleration,
 * no bounce. Mirrored as CSS vars in globals.css (--dur-*, --ease-out-quint)
 * for keyframe animations.
 */

export const DUR = { fast: 0.15, base: 0.2, slow: 0.3, data: 0.45 } as const;

export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export const SPRING_SHEET = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 } as const;
export const SPRING_PRESS = { type: "spring", stiffness: 420, damping: 30 } as const;

export const TRANSITION_FAST = { duration: DUR.fast, ease: EASE_OUT } as const;
export const TRANSITION_BASE = { duration: DUR.base, ease: EASE_OUT } as const;
export const TRANSITION_SLOW = { duration: DUR.slow, ease: EASE_OUT } as const;
export const TRANSITION_DATA = { duration: DUR.data, ease: EASE_OUT } as const;
