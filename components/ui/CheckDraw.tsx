"use client";

import { useRef } from "react";
import { m } from "framer-motion";
import { IconCheck } from "@tabler/icons-react";
import { useReducedMotion } from "@/lib/performance/useReducedMotion";
import { isIOSSafeMode } from "@/lib/iosSafeMode";
import { DUR, EASE_OUT, SPRING_PRESS } from "@/lib/motion";

/**
 * Completion checkmark that draws itself in when a task is completed.
 *
 * Drop-in for the `{done && <IconCheck />}` pattern: pass `visible` instead of
 * conditionally rendering, so the component can tell a fresh completion
 * (animate: path draw + scale pop) from mounting an already-done task
 * (render static). framer's `reducedMotion` config does not cover pathLength,
 * so reduced motion / iOS safe mode are gated explicitly with a static icon.
 */
export default function CheckDraw({
  visible,
  size = 14,
  strokeWidth = 3,
  className = "text-white",
}: {
  visible: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  // Latches true once the check has been hidden during this mount — meaning a
  // later `visible` is a real completion, not initial state. Idempotent ref
  // write, safe under StrictMode double-render.
  const wasHiddenRef = useRef(!visible);
  if (!visible) {
    wasHiddenRef.current = true;
    return null;
  }

  const animate = wasHiddenRef.current && !reduced && !isIOSSafeMode();
  if (!animate) {
    return <IconCheck size={size} strokeWidth={strokeWidth} className={className} />;
  }

  return (
    <m.span
      initial={{ scale: 0.7 }}
      animate={{ scale: 1 }}
      transition={SPRING_PRESS}
      className="flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Tabler IconCheck geometry so the animated and static marks match. */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        className={className}
        aria-hidden="true"
      >
        <m.path
          d="M5 12l5 5l10 -10"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: DUR.fast, ease: EASE_OUT }}
        />
      </svg>
    </m.span>
  );
}
