/**
 * Device capability detection — used to route AI backends and reduce motion/blur.
 * Results are cached after the first call.
 */

/**
 * Device tier drives AI backend selection:
 * - "high"    ≥8 cores, ≥8GB RAM, WebGPU available → full Transformers.js + WebGPU
 * - "mid"     ≥4 cores, ≥4GB RAM                   → Transformers.js CPU
 * - "low"     ≥2 cores, ≥2GB RAM                   → Transformers.js lightweight only
 * - "minimal" anything below                        → AI disabled
 */
export type DeviceTier = "high" | "mid" | "low" | "minimal";

export interface DeviceCapabilities {
  isLowEnd: boolean;
  prefersReducedMotion: boolean;
  hardwareConcurrency: number;
  deviceMemoryGB: number | null;
  isSaveData: boolean;
  hasWebGPU: boolean;
  isDesktop: boolean;
  tier: DeviceTier;
}

let cached: DeviceCapabilities | null = null;

export function getDeviceCapabilities(): DeviceCapabilities {
  if (cached) return cached;
  if (typeof window === "undefined") {
    return {
      isLowEnd: false,
      prefersReducedMotion: false,
      hardwareConcurrency: 4,
      deviceMemoryGB: null,
      isSaveData: false,
      hasWebGPU: false,
      isDesktop: true,
      tier: "mid",
    };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
    gpu?: unknown;
  };

  const hardwareConcurrency = nav.hardwareConcurrency ?? 4;
  const deviceMemoryGB = nav.deviceMemory ?? null;
  const isSaveData = nav.connection?.saveData ?? false;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasWebGPU = "gpu" in navigator && !!nav.gpu;

  const isLowEnd =
    hardwareConcurrency <= 2 ||
    (deviceMemoryGB !== null && deviceMemoryGB <= 2) ||
    isSaveData;

  // Desktop: no touch primary input AND screen wide enough
  const isDesktop =
    !window.matchMedia("(pointer: coarse)").matches &&
    window.innerWidth >= 1024;

  let tier: DeviceTier;
  if (isSaveData || hardwareConcurrency <= 1 || (deviceMemoryGB !== null && deviceMemoryGB < 2)) {
    tier = "minimal";
  } else if (hardwareConcurrency <= 2 || (deviceMemoryGB !== null && deviceMemoryGB <= 2)) {
    tier = "low";
  } else if (hardwareConcurrency >= 8 || (deviceMemoryGB !== null && deviceMemoryGB >= 8)) {
    tier = "high";
  } else {
    tier = "mid";
  }

  cached = { isLowEnd, prefersReducedMotion, hardwareConcurrency, deviceMemoryGB, isSaveData, hasWebGPU, isDesktop, tier };
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
