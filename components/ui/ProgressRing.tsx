"use client";

import { m, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { TRANSITION_DATA } from "@/lib/motion";

/**
 * A single-value circular progress ring.
 *
 * Replaces five hand-rolled copies (PlanCard, ReviewView, RitualView and two AI
 * surfaces) that disagreed on geometry, colour convention and animation — one
 * of them hard-coded its circumference as the literal `87.96` and labelled it at
 * 8.5px, below anything legible.
 *
 * Deliberately SVG rather than the `conic-gradient` DESIGN.md describes: the e2e
 * banned-effects guard fails any `conic-gradient`, so that component could never
 * have shipped.
 */
export interface ProgressRingProps {
  /** 0-100. Clamped. */
  value: number;
  size?: number;
  stroke?: number;
  /** Tailwind class for the arc, e.g. "stroke-emerald-500". */
  arcClassName?: string;
  trackClassName?: string;
  /** Rendered in the punched centre — a percentage label or a small icon. */
  children?: ReactNode;
  /** Announced to screen readers; the ring itself is decorative without it. */
  label?: string;
  className?: string;
}

export default function ProgressRing({
  value,
  size = 40,
  stroke = 4,
  arcClassName = "stroke-emerald-500",
  trackClassName = "stroke-neutral-200 dark:stroke-white/[0.08]",
  children,
  label,
  className = "",
}: ProgressRingProps) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, value));
  // Derived, not a magic literal — the radius has to survive changing `size`.
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (pct / 100) * circumference;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        /* -90deg so the arc starts at 12 o'clock. */
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className={trackClassName}
        />
        <m.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={arcClassName}
          initial={reduce ? false : { strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${filled} ${circumference - filled}` }}
          transition={reduce ? { duration: 0 } : TRANSITION_DATA}
        />
      </svg>
      {children !== undefined && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * The house status ramp from DESIGN.md §6 — green ≥70, amber 40-69, rose below.
 * Three slightly different thresholds existed across the app before this.
 */
export function ringArcClass(pct: number): string {
  if (pct >= 70) return "stroke-emerald-500";
  if (pct >= 40) return "stroke-amber-400";
  if (pct > 0) return "stroke-rose-400";
  return "stroke-neutral-300 dark:stroke-white/15";
}
