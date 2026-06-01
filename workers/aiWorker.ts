/**
 * AI Worker — Transformers.js inference, runs off the main thread.
 *
 * Models are chat-instruction-tuned (SmolLM2, Qwen2.5).
 * Model is loaded once, cached in browser Cache Storage, reused across calls.
 *
 * Message in:
 *   { id, type: 'generate-subtasks', payload: { task, plan?, model } }
 *   { id, type: 'generate-tasks',    payload: { plan, description?, model } }
 *   { id, type: 'improve-routine',   payload: { routine, context?, model } }
 *   { id, type: 'status' }
 *   { id, type: 'preload', payload: { model } }
 *
 * Message out:
 *   { id, type: 'progress', progress: number, status: string }
 *   { id, type: 'model-ready', model: string }
 *   { id, type: 'result', result: string[] }
 *   { id, type: 'error', error: string }
 */

import { pipeline, env } from "@huggingface/transformers";

env.useBrowserCache = true;
env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPipeline = any;

let currentModel: string | null = null;
let pipe: AnyPipeline = null;
let loading = false;

const SYSTEM_PROMPT =
  "You are a concise task-planning assistant. Output only valid JSON. No explanation, no markdown fences, no preamble.";

async function loadModel(model: string, id: string): Promise<void> {
  if (pipe && currentModel === model) return;
  if (loading) return;

  loading = true;
  currentModel = model;
  pipe = null;

  try {
    pipe = await pipeline("text-generation", model, {
      dtype: "q4",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      progress_callback: (info: any) => {
        const pct: number | undefined = info?.progress;
        const status: string = info?.status ?? "loading";
        if (typeof pct === "number") {
          self.postMessage({ id, type: "progress", progress: Math.round(pct), status });
        }
      },
    });
    self.postMessage({ id, type: "model-ready", model });
  } catch (err) {
    pipe = null;
    currentModel = null;
    throw err;
  } finally {
    loading = false;
  }
}

function extractStringArray(raw: string): string[] {
  const bare = raw.match(/\[[\s\S]*?\]/)?.[0];
  if (!bare) return fallbackLines(raw);
  try {
    const parsed = JSON.parse(bare);
    if (Array.isArray(parsed)) {
      return parsed
        .map((s) => (typeof s === "string" ? s : (s as { title?: string }).title ?? ""))
        .filter((s) => s.trim().length > 2);
    }
  } catch { /* fallthrough */ }
  return fallbackLines(raw);
}

function fallbackLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^[-•*\d.]+\s*/, "").replace(/^["']|["']$/g, "").trim())
    .filter((l) => l.length > 3 && l.length < 150);
}

async function runChat(userMessage: string): Promise<string> {
  if (!pipe) throw new Error("Model not loaded");
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: userMessage },
  ];
  const output = await pipe(messages, {
    max_new_tokens: 300,
    do_sample: false,
    return_full_text: false,
  });
  const raw: string = output?.[0]?.generated_text ?? "";
  // Strip assistant role wrapper if present
  if (typeof raw === "string") return raw;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const last = (raw as any)?.[output?.length - 1]?.content ?? "";
  return String(last);
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, payload } = e.data as {
    id: string;
    type: "generate-subtasks" | "generate-tasks" | "improve-routine" | "preload" | "status";
    payload?: {
      task?: string; plan?: string; description?: string;
      routine?: string; context?: string; model: string;
    };
  };

  if (type === "status") {
    self.postMessage({ id, type: "status", loaded: !!pipe, model: currentModel });
    return;
  }

  const model = payload?.model;
  if (!model) {
    self.postMessage({ id, type: "error", error: "No model specified" });
    return;
  }

  try {
    await loadModel(model, id);
  } catch (err) {
    self.postMessage({ id, type: "error", error: String(err) });
    return;
  }

  if (type === "preload") {
    // If the model is already loaded, reply immediately so all listeners update.
    if (pipe && currentModel === model) {
      self.postMessage({ id, type: "model-ready", model });
    }
    return;
  }

  try {
    let prompt = "";

    if (type === "generate-subtasks") {
      const task = payload?.task ?? "";
      const plan = payload?.plan ? ` (part of the plan: "${payload.plan}")` : "";
      prompt = `Generate 3-5 concrete actionable steps for this task: "${task}"${plan}. Output a JSON array of strings only: ["Step 1", "Step 2", "Step 3"]`;
    } else if (type === "generate-tasks") {
      const plan = payload?.plan ?? "";
      const desc = payload?.description ? ` Goal: ${payload.description}.` : "";
      prompt = `Generate 4-6 weekly tasks for the plan: "${plan}".${desc} Spread across the week. Output a JSON array: [{"title":"Task name","day":"monday","startTime":"08:00","endTime":"09:00","icon":"star","subtasks":["step 1","step 2"]}]`;
    } else if (type === "improve-routine") {
      const routine = payload?.routine ?? "";
      const ctx = payload?.context ? ` Context: ${payload.context}.` : "";
      prompt = `Suggest 3 improvements for this routine: "${routine}".${ctx} Output a JSON array of strings: ["Improvement 1", "Improvement 2", "Improvement 3"]`;
    }

    const raw = await runChat(prompt);
    const result = extractStringArray(raw);
    self.postMessage({ id, type: "result", result });
  } catch (err) {
    self.postMessage({ id, type: "error", error: String(err) });
  }
};
