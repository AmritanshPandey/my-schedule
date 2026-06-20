"use client";

/**
 * Platform detection helpers — all SSR-safe (return false on the server).
 *
 * iOS Safari/PWA (a single WebKit memory-budget per tab) is markedly more
 * crash-prone than desktop browsers under heavy DOM + compositor load. These
 * helpers let us shed the most expensive work (transform/layout animations,
 * over-promoted GPU layers) specifically on iOS without touching the rest.
 */

/** True on iPhone/iPad Safari or a home-screen PWA (incl. iPadOS desktop UA). */
export function isIOS(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports a macOS UA — detect the touch-capable Mac as iPad.
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSDevice || iPadOS;
}

/** True when the OS "Reduce Motion" accessibility setting is enabled. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
