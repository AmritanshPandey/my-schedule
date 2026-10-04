"use client";

/**
 * The progress note shown on the insights card.
 *
 * The template version (lib/intelligence/progressFacts.ts) renders instantly,
 * everywhere. Where an on-device model can run and is ready, the note can be
 * rewritten by it — automatically when the model is already warm (native iOS
 * host, or weights already loaded in this tab), on request otherwise, since
 * cold-loading ~850 MB to rephrase three sentences is not something to do
 * behind the user's back. Every model draft passes validateSummary first;
 * a draft that fails it is discarded and the template stays.
 *
 * A validated note is cached per device for the day and the facts it was
 * written from, so reopening the dashboard doesn't re-run inference.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Schedule } from "@/lib/useScheduleDB";
import { streamProgressSummary } from "@/lib/aiActions";
import { getAIProviderState } from "@/lib/ai/config";
import { useAIEnabled } from "@/lib/ai/useAIEnabled";
import { useAIReady } from "@/lib/ai/useAIReady";
import { isBrowserModelLoaded } from "@/lib/ai/providers/browser";
import { hasNativeAI } from "@/lib/ai/providers/native";
import { safeGetItem, safeSetItem } from "@/lib/safeStorage";
import { stableFieldHash } from "@/lib/hash";
import type { ExecutionReport } from "./patterns";
import { buildProgressFacts, templateSummary, validateSummary } from "./progressFacts";

const CACHE_KEY = "planr:intelligence:summary";

export interface ProgressSummary {
  text: string;
  source: "template" | "ai";
  /** A model that can run here is configured and ready. */
  canRefine: boolean;
  /** On-device AI is selected but its weights aren't downloaded yet. */
  needsDownload: boolean;
  /** Why on-device AI is off on this device (phone browser / PWA), if it is. */
  unsupportedMessage?: string;
  writing: boolean;
  /** Set when a model draft was discarded — said plainly, once. */
  note?: string;
  refine: () => void;
}

function readCache(key: string): string | null {
  try {
    const raw = safeGetItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { key?: unknown; text?: unknown };
    return parsed.key === key && typeof parsed.text === "string" ? parsed.text : null;
  } catch {
    return null;
  }
}

/** The model is already in memory, so a rewrite costs a second, not a download. */
function modelIsWarm(): boolean {
  const state = getAIProviderState();
  if (state.active !== "browser") return false;
  return hasNativeAI() || isBrowserModelLoaded(state.browser.model);
}

export function useProgressSummary(report: ExecutionReport, schedule: Schedule): ProgressSummary {
  const aiEnabled = useAIEnabled();
  const ready = useAIReady();

  const facts = useMemo(() => buildProgressFacts(report, schedule), [report, schedule]);
  const template = useMemo(() => templateSummary(facts, report), [facts, report]);
  const cacheKey = useMemo(
    () => `${facts.todayISO}:${stableFieldHash([...facts.lines, ...facts.nextSteps].join("\n"))}`,
    [facts],
  );

  const [aiText, setAiText] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const autoTriedRef = useRef<string | null>(null);

  // New facts → new note. Pick up a cached rewrite of exactly these facts.
  useEffect(() => {
    setAiText(readCache(cacheKey));
    setNote(undefined);
  }, [cacheKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const canRefine = aiEnabled && ready.state === "ready" && facts.hasSignal && facts.lines.length > 0;

  const refine = useCallback(() => {
    if (!canRefine) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setWriting(true);
    setNote(undefined);

    void (async () => {
      let raw = "";
      try {
        for await (const chunk of streamProgressSummary(facts, controller.signal)) raw += chunk;
        if (controller.signal.aborted) return;
        const check = validateSummary(raw, facts);
        if (check.ok) {
          setAiText(check.text);
          safeSetItem(CACHE_KEY, JSON.stringify({ key: cacheKey, text: check.text }));
        } else {
          setNote("Kept the plain version — the AI draft didn't stick to your numbers.");
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setNote(err instanceof Error ? err.message : "Couldn't write an AI version. The plain version is accurate.");
        }
      } finally {
        if (abortRef.current === controller) setWriting(false);
      }
    })();
  }, [canRefine, facts, cacheKey]);

  // Warm model, no cached note for these facts: write one, once per fact set.
  useEffect(() => {
    if (!canRefine || aiText || writing || autoTriedRef.current === cacheKey) return;
    if (!modelIsWarm()) return;
    autoTriedRef.current = cacheKey;
    refine();
  }, [canRefine, aiText, writing, cacheKey, refine]);

  return {
    text: aiText ?? template,
    source: aiText ? "ai" : "template",
    canRefine,
    needsDownload: aiEnabled && ready.state === "needs-download",
    unsupportedMessage: aiEnabled ? ready.unsupportedMessage : undefined,
    writing,
    note,
    refine,
  };
}
