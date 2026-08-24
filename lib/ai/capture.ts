"use client";

/**
 * On-device capture of Browser AI interactions, for building a fine-tuning
 * dataset out of real usage — see docs/fine-tuning.md for the full pipeline
 * this feeds into.
 *
 * Opt-in only (default off), unlike the AI feature gate itself: this is a
 * "read every prompt and response you generate" capability, not a UI
 * preference, so it needs an explicit yes rather than an absent-means-on
 * default. Everything stays on-device in localStorage until the user
 * chooses to export it (Settings → AI → Training data) — nothing here ever
 * calls out to a server, matching this app's local-first stance generally.
 *
 * Ring buffer + listener pattern mirrors lib/errorLog.ts; storage access
 * goes through lib/safeStorage.ts's swallow-on-failure wrappers instead of
 * errorLog.ts's own inline try/catch, matching the newer convention already
 * used by lib/ai/config.ts and lib/ai/instructions.ts.
 */

import { safeGetItem, safeSetItem, safeRemoveItem } from "@/lib/safeStorage";
import type { AIMessage } from "./types";

export interface CapturedInteraction {
  id: string;
  time: number; // epoch ms
  /** rewriteForBrowserModel's _actionType, or "unknown" for a request no
   *  detector matched (still worth capturing — it's exactly the case where
   *  the prompt fell through unrewritten and is most likely to need a
   *  training example of its own). */
  action: string;
  /** The resolved HuggingFace repo id this generation actually ran on —
   *  provenance for a dataset built from captures spanning a model swap. */
  model: string;
  systemPrompt: string;
  messages: AIMessage[];
  response: string;
}

const ENABLED_KEY = "planr:ai:capture-enabled";
const LOG_KEY = "planr:ai:capture-log";
const MAX = 200;

type Listener = (log: CapturedInteraction[]) => void;
const listeners = new Set<Listener>();

export function isCaptureEnabled(): boolean {
  return safeGetItem(ENABLED_KEY) === "1";
}

export function setCaptureEnabled(on: boolean): void {
  if (on) safeSetItem(ENABLED_KEY, "1");
  else safeRemoveItem(ENABLED_KEY);
}

function safeRead(): CapturedInteraction[] {
  const raw = safeGetItem(LOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CapturedInteraction[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(log: CapturedInteraction[]): void {
  safeSetItem(LOG_KEY, JSON.stringify(log));
}

export function getCapturedInteractions(): CapturedInteraction[] {
  return safeRead();
}

export function clearCapturedInteractions(): void {
  safeWrite([]);
  listeners.forEach((fn) => fn([]));
}

export function onCaptureLogChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Record one interaction. Best-effort and silent on failure — a capture
 *  that can't be written must never surface as a user-facing error, since
 *  it rides along on the actual AI generation the user is waiting on. */
export function captureInteraction(entry: Omit<CapturedInteraction, "id" | "time">): void {
  try {
    const record: CapturedInteraction = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      time: Date.now(),
      ...entry,
    };
    const next = [...safeRead(), record].slice(-MAX);
    safeWrite(next);
    listeners.forEach((fn) => fn(next));
  } catch {
    /* best effort — never let capture break a real generation */
  }
}

/** One JSON object per line, matching the FineTuneRecord shape
 *  scripts/build-finetune-dataset.mjs and scripts/eval-finetune.mjs read —
 *  `id`/`time`/`model` are provenance for on-device review, not part of
 *  that shared shape, so they're dropped here rather than carried through. */
export function exportCapturedJSONL(): string {
  return safeRead()
    .map((r) => JSON.stringify({ action: r.action, systemPrompt: r.systemPrompt, messages: r.messages, response: r.response }))
    .join("\n");
}
