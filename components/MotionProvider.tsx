"use client";

import { useEffect, useState, type ReactNode } from "react";
import { LazyMotion, MotionConfig } from "framer-motion";
import { isIOSSafeMode } from "@/lib/iosSafeMode";

// Lazy-load the animation feature bundle so it is split out of the initial JS
// and fetched after first paint. `domMax` (not the leaner `domAnimation`) is
// required because the app uses layout animations (`layout`/`layoutId`) and drag
// (swipe-to-complete, bottom sheets). Components must use the lightweight `m.*`
// primitives (not `motion.*`) for this to actually shrink the initial bundle —
// `strict` enforces that at runtime in development.
const loadFeatures = () => import("framer-motion").then((mod) => (isIOSSafeMode() ? mod.domAnimation : mod.domMax));

/**
 * Global Framer Motion configuration.
 *
 * - Everywhere: `reducedMotion="user"` honors the OS "Reduce Motion" setting
 *   (an accessibility requirement that wasn't previously wired up).
 * - On iOS Safari/PWA: force `reducedMotion="always"`. This makes Framer skip
 *   transform/layout-driven tweens (the compositor- and memory-heavy ones)
 *   while keeping cheap opacity/color fades — directly reducing the memory
 *   pressure that surfaces as "A problem repeatedly occurred" on iPhone.
 *
 * Reversible: delete the iOS branch to restore full motion on iOS.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  // Start with "user" so server and first client render agree (no hydration
  // mismatch), then upgrade to "always" on iOS after mount.
  const [reducedMotion, setReducedMotion] = useState<"user" | "always">("user");

  useEffect(() => {
    if (isIOSSafeMode()) setReducedMotion("always");
  }, []);

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>
    </LazyMotion>
  );
}
