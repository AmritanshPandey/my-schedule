"use client";

export const DISABLE_SW_ON_IOS = true;
export const PHONE_SHELL_MAX_SHORT_EDGE = 500;
export const PHONE_SHELL_MAX_LONG_EDGE = 1024;

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

export function isPhoneViewportDimensions(width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return false;
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);
  return shortEdge <= PHONE_SHELL_MAX_SHORT_EDGE && longEdge <= PHONE_SHELL_MAX_LONG_EDGE;
}

export function isPhoneViewportSize(): boolean {
  if (typeof window === "undefined") return false;
  return isPhoneViewportDimensions(window.innerWidth, window.innerHeight);
}

export function shouldUseIOSAppShell(): boolean {
  if (isIOSSafeMode()) return true;
  if (typeof window === "undefined") return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("iosShell") === "1" || params.get("mobileShell") === "1") return true;
    if (localStorage.getItem("planr-force-ios-shell") === "true") return true;
  } catch {
    /* best effort */
  }

  return isPhoneViewportSize();
}
