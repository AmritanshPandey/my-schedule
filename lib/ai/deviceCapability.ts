/**
 * Where an on-device language model may run — and, more importantly, where it
 * must not.
 *
 * The default AI provider loads a ~1B-parameter model (~850 MB of weights,
 * more once resident) into the page itself. On a desktop that is fine. In
 * iOS Safari and a home-screen PWA it is not: WebKit gives each tab one fixed
 * memory budget, and blowing it does not throw an error PlanR could catch — the
 * tab is killed and the app reloads, mid-whatever-the-user-was-doing. Phones
 * on other platforms share the same failure, just with more headroom.
 *
 * So the rule is: the in-page model runs on desktop, and in the native iOS app
 * through its own system model (lib/ai/providers/native.ts) — never in a
 * mobile browser or mobile PWA. Everything that does NOT need the model (the
 * pattern engine in lib/intelligence/, its template summaries, the builder
 * checks) keeps working everywhere; only the language layer steps aside.
 *
 * `assessOnDeviceLLM` is pure over injected signals so the policy is unit-
 * testable; `onDeviceLLMSupport` reads the real browser once and memoises.
 */

export type OnDeviceLLMBlockReason = "ios-web" | "mobile-web" | "low-memory" | "no-browser";

export interface OnDeviceLLMSupport {
  supported: boolean;
  reason?: OnDeviceLLMBlockReason;
  /** User-facing, sentence case, says what still works. Present when blocked. */
  message?: string;
}

export interface DeviceSignals {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `navigator.deviceMemory` in GB — Chromium only, and capped at 8 there. */
  deviceMemory?: number;
  /** Running as an installed PWA (display-mode standalone / navigator.standalone). */
  standalone: boolean;
  /** Primary pointer is coarse (a finger), per `(pointer: coarse)`. */
  coarsePointer: boolean;
  /** Shorter viewport edge in CSS px. */
  shortEdge: number;
}

/**
 * Below this much reported RAM the model plus the app itself do not fit
 * comfortably. Only Chromium reports it; elsewhere this check is skipped.
 */
export const MIN_DEVICE_MEMORY_GB = 4;

/** A coarse-pointer screen this narrow is a phone, whatever its UA claims. */
const PHONE_SHORT_EDGE_PX = 600;

const MESSAGES: Record<OnDeviceLLMBlockReason, string> = {
  "ios-web":
    "On-device AI runs in the PlanR desktop and iOS apps. iPhone and iPad browsers cap memory per tab, so loading the model here would crash PlanR. Insights and suggestions still work.",
  "mobile-web":
    "On-device AI is off on phones and tablets in the browser or as an installed web app — the model is too large to load safely. Insights and suggestions still work.",
  "low-memory":
    "This device doesn't have enough memory to run the on-device model safely. Insights and suggestions still work.",
  "no-browser": "On-device AI needs a browser.",
};

function blocked(reason: OnDeviceLLMBlockReason): OnDeviceLLMSupport {
  return { supported: false, reason, message: MESSAGES[reason] };
}

/** iPhone/iPod/iPad, including iPadOS 13+ which reports a desktop Mac UA. */
export function isIOSSignals(s: Pick<DeviceSignals, "userAgent" | "platform" | "maxTouchPoints">): boolean {
  return /iPad|iPhone|iPod/.test(s.userAgent) || (s.platform === "MacIntel" && s.maxTouchPoints > 1);
}

export function assessOnDeviceLLM(signals: DeviceSignals | null): OnDeviceLLMSupport {
  if (!signals) return blocked("no-browser");

  // Every iOS browser is WebKit underneath, tab or PWA alike.
  if (isIOSSignals(signals)) return blocked("ios-web");

  const mobileUA = /Android|Mobi|Mobile/i.test(signals.userAgent);
  const phoneSized = signals.coarsePointer && signals.shortEdge > 0 && signals.shortEdge < PHONE_SHORT_EDGE_PX;
  if (mobileUA || phoneSized || (signals.standalone && signals.coarsePointer)) return blocked("mobile-web");

  if (typeof signals.deviceMemory === "number" && signals.deviceMemory < MIN_DEVICE_MEMORY_GB) {
    return blocked("low-memory");
  }

  return { supported: true };
}

export function readDeviceSignals(): DeviceSignals | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  const media = (query: string) => {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia(query).matches;
    } catch {
      return false;
    }
  };
  const nav = navigator as Navigator & { deviceMemory?: number; standalone?: boolean };
  return {
    userAgent: nav.userAgent || "",
    platform: nav.platform || "",
    maxTouchPoints: nav.maxTouchPoints || 0,
    deviceMemory: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
    standalone: nav.standalone === true || media("(display-mode: standalone)"),
    coarsePointer: media("(pointer: coarse)"),
    shortEdge: Math.min(window.innerWidth || 0, window.innerHeight || 0),
  };
}

let cached: OnDeviceLLMSupport | null = null;

/** The verdict for this browser. Stable for the life of the page. */
export function onDeviceLLMSupport(): OnDeviceLLMSupport {
  if (typeof window === "undefined") return blocked("no-browser");
  if (!cached) cached = assessOnDeviceLLM(readDeviceSignals());
  return cached;
}

/** Thrown instead of loading the model where it would crash the page. */
export class OnDeviceModelUnavailableError extends Error {
  readonly reason: OnDeviceLLMBlockReason;
  constructor(support: OnDeviceLLMSupport) {
    super(support.message ?? MESSAGES["no-browser"]);
    this.name = "OnDeviceModelUnavailableError";
    this.reason = support.reason ?? "no-browser";
  }
}
