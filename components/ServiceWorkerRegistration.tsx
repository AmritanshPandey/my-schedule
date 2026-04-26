"use client";

import { useEffect } from "react";

const CACHE_PREFIX = "daily-planner-";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isDev = process.env.NODE_ENV !== "production";

    if (isDev) {
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

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .catch((err) => console.error("Service worker registration failed:", err));
  }, []);

  return null;
}
