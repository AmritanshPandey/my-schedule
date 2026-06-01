"use client";

// Backward-compatible re-export — delegates to the new unified runtime hook.
export { useAIRuntime as useAIWorker } from "@/lib/ai/useAIRuntime";
export type { TransformersTask } from "@/lib/ai/useAIRuntime";
