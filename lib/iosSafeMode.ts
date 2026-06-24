"use client";

export const DISABLE_SW_ON_IOS = true;

const logged = new Set<string>();
const BOOT_LOG_KEY = "planr-boot-log";
const MAX_BOOT_LOGS = 50;

export interface BootLogEntry {
  event: string;
  time: number;
}

function readBootLog(): BootLogEntry[] {
  try {
    const raw = localStorage.getItem(BOOT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as BootLogEntry[] : [];
  } catch {
    return [];
  }
}

export function bootLog(event: string): void {
  if (typeof window === "undefined") return;
  if (logged.has(event)) return;
  logged.add(event);
  try {
    const next = [...readBootLog(), { event, time: Date.now() }].slice(-MAX_BOOT_LOGS);
    localStorage.setItem(BOOT_LOG_KEY, JSON.stringify(next));
  } catch {
    /* best effort */
  }
  console.info(event);
}

export function getBootLog(): BootLogEntry[] {
  if (typeof window === "undefined") return [];
  return readBootLog();
}

export function clearBootLog(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOT_LOG_KEY);
  } catch {
    /* best effort */
  }
  logged.clear();
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
