"use client";

/**
 * Whether AI surfaces should render at all.
 *
 * Combines two switches so callers only ever ask one question:
 *  • AI_ENABLED  — the build-time kill switch (lib/featureFlags.ts). Ships AI
 *    off for everyone when false; nothing the user does can turn it back on.
 *  • getAIFeaturesEnabled() — the user's own per-device preference, exposed as
 *    a single toggle in Settings.
 *
 * Reactive on purpose. These gates used to read a module constant, so flipping
 * the preference could not re-render anything — the AI button would sit there
 * until a reload. Subscribing to AI_SETTINGS_CHANGED_EVENT makes every gated
 * surface appear and disappear the moment the toggle moves.
 */

import { useCallback, useEffect, useState } from "react";
import { AI_ENABLED } from "@/lib/featureFlags";
import { AI_SETTINGS_CHANGED_EVENT, getAIFeaturesEnabled, setAIFeaturesEnabled } from "./config";

function read(): boolean {
  return AI_ENABLED && getAIFeaturesEnabled();
}

/** Read-only gate — what almost every AI surface wants. */
export function useAIEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(read);

  useEffect(() => {
    const sync = () => setEnabled(read());
    // Re-read on mount too: the lazy initialiser runs before hydration on any
    // server-rendered caller, where localStorage isn't readable yet.
    sync();
    window.addEventListener(AI_SETTINGS_CHANGED_EVENT, sync);
    // `storage` fires for changes made in another tab, so two open tabs agree.
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(AI_SETTINGS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return enabled;
}

/** The gate plus a setter — for the Settings toggle itself. */
export function useAIEnabledSetting(): { enabled: boolean; setEnabled: (next: boolean) => void; lockedOff: boolean } {
  const enabled = useAIEnabled();
  const setEnabled = useCallback((next: boolean) => setAIFeaturesEnabled(next), []);
  // When the build flag is off there is nothing for the user to turn on, so the
  // toggle renders disabled rather than pretending to work.
  return { enabled, setEnabled, lockedOff: !AI_ENABLED };
}
