"use client";

/**
 * useAIRuntime — central hook for the embedded AI system.
 *
 * Manages:
 *  - enabled/disabled state (persisted to localStorage)
 *  - performance mode selection (lightweight / balanced / advanced)
 *  - worker lifecycle (single shared worker)
 *  - model download progress
 *  - inference methods
 *
 * Nothing here exposes model names or runtime jargon to the UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDeviceCapabilities } from "@/lib/performance/detectLowEndDevice";
import { safeGetItem, safeSetItem } from "@/lib/safeStorage";
import { AI_ENABLED } from "@/lib/featureFlags";
import {
  AI_ENABLED_KEY,
  AI_MODE_KEY,
  defaultPerformanceMode,
  resolveTransformersModel,
  modelCapability,
  isModelDownloaded,
  markModelDownloaded,
  MODEL_SIZES,
  type AIPerformanceMode,
  type CapabilityLevel,
} from "@/lib/ai/runtime";

export type EmbeddedAIStatus =
  | "disabled"       // user hasn't enabled yet
  | "enabling"       // user just tapped Enable, worker starting
  | "downloading"    // model download in progress
  | "ready"          // model loaded, inference available
  | "error";         // worker or model failed

export interface AIRuntimeState {
  enabled: boolean;
  status: EmbeddedAIStatus;
  downloadProgress: number;   // 0–100
  mode: AIPerformanceMode;
  modelSizeMB: number;        // approximate size for the current mode
  modelCached: boolean;       // current model already downloaded (loads instantly)
  capabilityLevel: CapabilityLevel; // what the on-device model is trusted to do
  enable: () => void;
  disable: () => void;
  setMode: (m: AIPerformanceMode) => void;
  generateSubtasks: (task: string, plan?: string) => Promise<string[]>;
  generateTasks: (plan: string, description?: string) => Promise<TransformersTask[]>;
  improveRoutine: (routine: string, context?: string) => Promise<string[]>;
}

export interface TransformersTask {
  title: string;
  day: string;
  startTime: string;
  endTime: string;
  icon: string;
  subtasks: string[];
}

// ── Module-level model load guard ────────────────────────────────────────────
// Prevents multiple component instances from each triggering a download.
// Only the first call per unique model string wins.
let lastRequestedModel: string | null = null;

// ── Shared worker singleton ───────────────────────────────────────────────────

type PendingCall = { resolve: (r: string[]) => void; reject: (e: Error) => void };

let sharedWorker: Worker | null = null;
const pendingCalls = new Map<string, PendingCall>();
let msgCounter = 0;

const statusListeners = new Set<(s: EmbeddedAIStatus, p: number) => void>();

function nextId() { return `ai-${++msgCounter}`; }

function getOrCreateWorker(): Worker | null {
  if (typeof window === "undefined") return null;
  // Hard stop while the AI feature is gated off: never spawn the worker, which
  // is what pulls in Transformers.js and triggers a multi-hundred-MB model
  // download. This keeps the dormant dependency out of runtime entirely.
  if (!AI_ENABLED) return null;
  if (sharedWorker) return sharedWorker;
  try {
    sharedWorker = new Worker(
      new URL("../../workers/aiWorker.ts", import.meta.url),
      { type: "module" },
    );
    sharedWorker.onmessage = (e: MessageEvent) => {
      const { id, type, result, error, progress } = e.data as {
        id: string; type: string; result?: string[]; error?: string; progress?: number;
      };
      if (type === "progress") {
        statusListeners.forEach((fn) => fn("downloading", progress ?? 0));
      } else if (type === "model-ready") {
        statusListeners.forEach((fn) => fn("ready", 100));
      } else if (type === "result") {
        pendingCalls.get(id)?.resolve(result ?? []);
        pendingCalls.delete(id);
      } else if (type === "error") {
        const err = new Error(error ?? "Worker error");
        if (pendingCalls.has(id)) {
          pendingCalls.get(id)?.reject(err);
          pendingCalls.delete(id);
        } else {
          statusListeners.forEach((fn) => fn("error", 0));
        }
      }
    };
    sharedWorker.onerror = () => {
      const err = new Error("AI worker crashed");
      pendingCalls.forEach(({ reject }) => reject(err));
      pendingCalls.clear();
      sharedWorker = null;
      statusListeners.forEach((fn) => fn("error", 0));
    };
    return sharedWorker;
  } catch {
    // Worker module failed to instantiate (e.g. chunk blocked/offline in the
    // iOS PWA). Surface a definite error state instead of leaving callers stuck
    // on "enabling" forever, so the UI can show an "AI unavailable" message.
    statusListeners.forEach((fn) => fn("error", 0));
    return null;
  }
}

function postToWorker(type: string, payload: Record<string, unknown>): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const worker = getOrCreateWorker();
    if (!worker) { reject(new Error("Web Workers not available")); return; }
    const id = nextId();
    pendingCalls.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
    setTimeout(() => {
      if (pendingCalls.has(id)) {
        pendingCalls.get(id)?.reject(new Error("AI inference timed out"));
        pendingCalls.delete(id);
      }
    }, 45_000);
  });
}

function preloadModel(model: string) {
  const worker = getOrCreateWorker();
  if (!worker) return;
  const id = nextId();
  worker.postMessage({ id, type: "preload", payload: { model } });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAIRuntime(): AIRuntimeState {
  const caps = getDeviceCapabilities();
  const { tier, isDesktop, isSaveData } = caps;

  // On-device AI is ON by default — it only stays off if the user explicitly
  // disabled it. Minimal / data-saver devices never auto-load (guarded below).
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return safeGetItem(AI_ENABLED_KEY) !== "false";
  });

  const [mode, setModeState] = useState<AIPerformanceMode>(() => {
    if (typeof window === "undefined") return defaultPerformanceMode(tier, isDesktop);
    const saved = safeGetItem(AI_MODE_KEY) as AIPerformanceMode | null;
    return saved ?? defaultPerformanceMode(tier, isDesktop);
  });

  const currentModel = resolveTransformersModel(mode, tier, isDesktop);
  const modelSizeMB = MODEL_SIZES[currentModel] ?? 300;
  const capabilityLevel = modelCapability(currentModel);

  // Bumped whenever a model finishes downloading so `modelCached` recomputes.
  const [cacheTick, setCacheTick] = useState(0);
  const modelCached = useMemo(
    () => typeof window !== "undefined" && isModelDownloaded(currentModel),
    [currentModel, cacheTick],
  );

  const [status, setStatus] = useState<EmbeddedAIStatus>(() => {
    if (typeof window === "undefined") return "disabled";
    if (safeGetItem(AI_ENABLED_KEY) === "false") return "disabled";
    // Already downloaded (cached on disk) or preloaded earlier this session →
    // start "ready": loading from cache is instant, so never flash a download bar.
    if (isModelDownloaded(currentModel) || lastRequestedModel) return "ready";
    return "enabling";
  });
  const [downloadProgress, setDownloadProgress] = useState(0);
  const mountedRef = useRef(true);

  // Keep the latest model/cache info available to the (stable) status handler.
  const currentModelRef = useRef(currentModel);
  currentModelRef.current = currentModel;
  const cachedRef = useRef(modelCached);
  cachedRef.current = modelCached;

  // Subscribe to worker status broadcasts
  useEffect(() => {
    const handler = (s: EmbeddedAIStatus, p: number) => {
      if (!mountedRef.current) return;
      // A cached model loads from disk: suppress the "downloading" flash and
      // keep it as a quick "ready" — there is no real network download.
      if (s === "downloading" && cachedRef.current) {
        setStatus("ready");
        return;
      }
      if (s === "ready") {
        // First successful load → remember it so future sessions skip the bar.
        markModelDownloaded(currentModelRef.current);
        if (!cachedRef.current) setCacheTick((n) => n + 1);
      }
      setStatus(s);
      setDownloadProgress(p);
    };
    statusListeners.add(handler);
    return () => { statusListeners.delete(handler); };
  }, []);

  // Eagerly preload the model once enabled — guarded at module level so it only
  // fires once per unique model across all hook instances and remounts. Runs on
  // idle so it never blocks app startup, and skips minimal / data-saver devices.
  useEffect(() => {
    mountedRef.current = true;
    const canAutoLoad = AI_ENABLED && tier !== "minimal" && !isSaveData;
    if (enabled && canAutoLoad && currentModel !== lastRequestedModel) {
      lastRequestedModel = currentModel;
      // Cached models load instantly — don't show the "starting" state for them.
      if (!isModelDownloaded(currentModel)) setStatus("enabling");
      const trigger = () => preloadModel(currentModel);
      if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(trigger, { timeout: 3000 });
      } else {
        setTimeout(trigger, 0);
      }
    }
    return () => { mountedRef.current = false; };
  }, [enabled, currentModel, tier, isSaveData]);

  const enable = useCallback(() => {
    safeSetItem(AI_ENABLED_KEY, "true");
    setEnabled(true);
    setStatus(isModelDownloaded(currentModel) ? "ready" : "enabling");
    preloadModel(currentModel);
  }, [currentModel]);

  const disable = useCallback(() => {
    safeSetItem(AI_ENABLED_KEY, "false");
    lastRequestedModel = null; // allow re-enable to re-trigger preload
    setEnabled(false);
    setStatus("disabled");
  }, []);

  const setMode = useCallback((m: AIPerformanceMode) => {
    safeSetItem(AI_MODE_KEY, m);
    setModeState(m);
  }, []);

  const generateSubtasks = useCallback(
    (task: string, plan?: string): Promise<string[]> =>
      postToWorker("generate-subtasks", { task, plan, model: currentModel }),
    [currentModel],
  );

  const generateTasks = useCallback(
    async (plan: string, description?: string): Promise<TransformersTask[]> => {
      const raw = await postToWorker("generate-tasks", { plan, description, model: currentModel });
      try {
        const parsed = JSON.parse(raw[0] ?? "[]");
        if (Array.isArray(parsed)) return parsed as TransformersTask[];
      } catch { /* fallthrough */ }
      return [];
    },
    [currentModel],
  );

  const improveRoutine = useCallback(
    (routine: string, context?: string): Promise<string[]> =>
      postToWorker("improve-routine", { routine, context, model: currentModel }),
    [currentModel],
  );

  return {
    enabled,
    status,
    downloadProgress,
    mode,
    modelSizeMB,
    modelCached,
    capabilityLevel,
    enable,
    disable,
    setMode,
    generateSubtasks,
    generateTasks,
    improveRoutine,
  };
}
