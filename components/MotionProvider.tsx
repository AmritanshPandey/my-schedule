"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { isIOS } from "@/lib/platform";

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
    if (isIOS()) setReducedMotion("always");
  }, []);

  return <MotionConfig reducedMotion={reducedMotion}>{children}</MotionConfig>;
}
