"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/performance/useReducedMotion";
import { isIOSSafeMode } from "@/lib/iosSafeMode";

/**
 * Count-up for metric numbers. rAF-based (no framer dependency), eased with
 * the house curve, capped at 450ms so Playwright's auto-retrying text
 * assertions settle well within timeout. Renders the final value instantly
 * when reduced motion is on, in iOS safe mode, or on non-animated updates.
 */

// House ease-out-quint (matches lib/motion.ts EASE_OUT closely enough for
// a scalar interpolation).
function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

export function useCountUp(target: number, duration = 450): number {
  const reduced = useReducedMotion();
  const skipAnimation = reduced || isIOSSafeMode();
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (skipAnimation || fromRef.current === target) {
      fromRef.current = target;
      setDisplay(target);
      return;
    }
    const from = fromRef.current;
    fromRef.current = target;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(from + (target - from) * easeOutQuint(t));
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, skipAnimation]);

  return display;
}

export default function AnimatedNumber({
  value,
  format,
  duration = 450,
  className,
}: {
  value: number;
  /** Formats the interpolated value each frame (default: rounded integer). */
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  // Animate from 0 on first mount so the number "arrives" with the card.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const display = useCountUp(mounted ? value : 0, duration);
  return <span className={className}>{format ? format(display) : String(Math.round(display))}</span>;
}
