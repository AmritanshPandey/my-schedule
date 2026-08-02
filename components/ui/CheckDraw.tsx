"use client";

import { useRef } from "react";
import { IconCheck } from "@tabler/icons-react";

/**
 * Completion checkmark that draws itself in when a task is completed.
 *
 * Drop-in for the `{done && <IconCheck />}` pattern: pass `visible` instead of
 * conditionally rendering, so the component can tell a fresh completion
 * (animate: path draw + scale pop) from mounting an already-done task
 * (render static).
 *
 * The animation is CSS, not framer. Several call sites render outside any
 * LazyMotion provider — the iOS Overview and Today lists — where framer builds
 * no visual element, so `animate` never runs while `initial` is still committed
 * to the DOM. That left `pathLength: 0` baked in and the tick invisible on any
 * non-iOS phone. CSS keyframes work in every rendering context, and the global
 * `prefers-reduced-motion` block in globals.css neutralises them for free.
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
  // Latches true once the check has been hidden during this mount — meaning a
  // later `visible` is a real completion, not initial state. Idempotent ref
  // write, safe under StrictMode double-render.
  const wasHiddenRef = useRef(!visible);
  if (!visible) {
    wasHiddenRef.current = true;
    return null;
  }

  // Mounting already-done (e.g. scrolling a completed task into view) renders
  // static; only a fresh completion animates.
  if (!wasHiddenRef.current) {
    return <IconCheck size={size} strokeWidth={strokeWidth} className={className} />;
  }

  return (
    <span
      className="animate-check-pop flex items-center justify-center"
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
        <path
          className="animate-check-draw"
          d="M5 12l5 5l10 -10"
          pathLength={1}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
