"use client";

export const DISABLE_SW_ON_IOS = true;

const logged = new Set<string>();

export function bootLog(event: string): void {
  if (typeof window === "undefined") return;
  if (logged.has(event)) return;
  logged.add(event);
  console.info(event);
}

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalonePWA(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const standaloneNavigator = "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const standaloneMedia =
    typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return standaloneNavigator || standaloneMedia;
}

export function isIOSSafeMode(): boolean {
  return isIOSDevice();
}

