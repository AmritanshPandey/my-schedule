/**
 * Heuristics for detecting low-end/constrained devices.
 * Used to disable blur, reduce animation density, etc.
 *
 * Results are cached after the first call — call once at app startup.
 */

export interface DeviceCapabilities {
  isLowEnd: boolean;
  prefersReducedMotion: boolean;
  hardwareConcurrency: number;
  deviceMemoryGB: number | null;
  isSaveData: boolean;
}

let cached: DeviceCapabilities | null = null;

export function getDeviceCapabilities(): DeviceCapabilities {
  if (cached) return cached;
  if (typeof window === "undefined") {
    return { isLowEnd: false, prefersReducedMotion: false, hardwareConcurrency: 4, deviceMemoryGB: null, isSaveData: false };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };

  const hardwareConcurrency = nav.hardwareConcurrency ?? 4;
  const deviceMemoryGB = nav.deviceMemory ?? null;
  const isSaveData = nav.connection?.saveData ?? false;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Low-end: ≤2 cores OR ≤2GB RAM OR save-data mode
  const isLowEnd =
    hardwareConcurrency <= 2 ||
    (deviceMemoryGB !== null && deviceMemoryGB <= 2) ||
    isSaveData;

  cached = { isLowEnd, prefersReducedMotion, hardwareConcurrency, deviceMemoryGB, isSaveData };
  return cached;
}

/** Convenience: should blur-heavy effects be suppressed? */
export function shouldReduceBlur(): boolean {
  const { isLowEnd, prefersReducedMotion } = getDeviceCapabilities();
  return isLowEnd || prefersReducedMotion;
}

/** Convenience: should complex animations be disabled/simplified? */
export function shouldReduceAnimations(): boolean {
  const { isLowEnd, prefersReducedMotion } = getDeviceCapabilities();
  return isLowEnd || prefersReducedMotion;
}
