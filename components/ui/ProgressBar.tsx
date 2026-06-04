"use client";

import { motion } from "framer-motion";

interface ProgressBarProps {
  /** Fill amount, 0–100. */
  pct: number;
  /** Track height in px (default 6). */
  height?: number;
  /** Tailwind class(es) for the fill colour (default brand green). Ignored when `fillColor` is set. */
  fillClassName?: string;
  /** Explicit fill colour (hex/rgb) — for plan/category colours. Overrides `fillClassName`. */
  fillColor?: string;
  /** Corner rounding for both track and fill (default fully rounded). */
  rounded?: string;
  /** Show a thin sliver for small non-zero values so progress is always visible (default true). */
  minVisible?: boolean;
  /** Animate width changes (default true). */
  animate?: boolean;
  /** Extra wrapper classes (e.g. width, margins). */
  className?: string;
  /** Extend/override the track background. */
  trackClassName?: string;
}

/**
 * The one progress bar used across the app. Unified track —
 * `neutral-200` in light, `white/10` in dark — with a colour fill on top.
 */
export default function ProgressBar({
  pct,
  height = 6,
  fillClassName = "bg-emerald-500",
  fillColor,
  rounded = "rounded-full",
  minVisible = true,
  animate = true,
  className = "",
  trackClassName = "",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, pct));
  const width = clamped <= 0 ? 0 : minVisible ? Math.max(clamped, 6) : clamped;

  return (
    <div
      className={`relative w-full overflow-hidden bg-neutral-200 dark:bg-white/10 ${rounded} ${trackClassName} ${className}`}
      style={{ height }}
    >
      <motion.div
        className={`absolute inset-y-0 left-0 ${rounded} ${fillColor ? "" : fillClassName}`}
        style={fillColor ? { backgroundColor: fillColor } : undefined}
        initial={false}
        animate={{ width: `${width}%` }}
        transition={animate ? { duration: 0.45, ease: [0.34, 1.1, 0.64, 1] } : { duration: 0 }}
      />
    </div>
  );
}
