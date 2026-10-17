import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Native port of lib/performance/useReducedMotion.ts — the OS "Reduce Motion"
 * setting, live (the web reads `prefers-reduced-motion`). Starts false and
 * settles on the first read; animations it gates are short enough that the
 * first frame never matters.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (!cancelled) setReduced(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduced;
}
