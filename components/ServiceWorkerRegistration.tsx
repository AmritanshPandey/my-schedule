"use client";

import { useEffect } from "react";
import { DISABLE_SW_ON_IOS, isIOSSafeMode } from "@/lib/iosSafeMode";

const CACHE_PREFIX = "planr-";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isDev = process.env.NODE_ENV !== "production";
    const disableForIOS = DISABLE_SW_ON_IOS && isIOSSafeMode();

    if (isDev || disableForIOS) {
      // Prevent stale cached JS in local development from causing hydration mismatches.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => {
          reg.unregister().catch((err) => console.error("Service worker unregister failed:", err));
        });
      });

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX))
            .forEach((key) => {
              caches.delete(key).catch((err) => console.error("Cache delete failed:", err));
            });
        });
      }

      return;
    }

    // iOS Safari intermittently fails the first registration (e.g. during a
    // cold launch). Retry once after a short delay so a transient failure
    // doesn't leave the PWA permanently uncontrolled — which would mean stale
    // caches are never cleaned and the user never receives updates.
    let retryTimer: number | undefined;

    function register(attempt: number) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          void registration.update();
        })
        .catch((err) => {
          console.error("Service worker registration failed:", err);
          if (attempt === 0) {
            retryTimer = window.setTimeout(() => register(1), 3000);
          }
        });
    }

    register(0);

    return () => {
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, []);

  return null;
}
