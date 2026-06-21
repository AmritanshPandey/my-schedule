"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import {
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconLoader2,
  IconRefresh,
  IconServer,
  IconShield,
  IconSparkles,
  IconWifiOff,
  IconX,
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import {
  checkOllamaConnection,
  checkModelStatus,
  OLLAMA_URL_KEY,
  OLLAMA_MODEL_KEY,
  DEFAULT_OLLAMA_URL,
  DEFAULT_OLLAMA_MODEL,
} from "@/lib/ai";
import { useAIRuntime } from "@/lib/ai/useAIRuntime";
import type { AIPerformanceMode } from "@/lib/ai/runtime";
import { MODEL_SIZES, MODELS, modelLabel, isModelDownloaded, resolveTransformersModel } from "@/lib/ai/runtime";
import { getDeviceCapabilities } from "@/lib/performance/detectLowEndDevice";

// ── Primitives ────────────────────────────────────────────────────────────────

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.06]" />;
}

// ── Mode definitions (no model names shown to users) ──────────────────────────

const MODES: Array<{
  id: AIPerformanceMode;
  label: string;
  description: string;
  badge?: string;
}> = [
  {
    id: "lightweight",
    label: "Lightweight",
    description: "Fastest response, minimal battery usage. Best for older or low-memory devices.",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Best for most people. Excellent AI quality with minimal device impact.",
    badge: "Default",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Higher quality reasoning. Recommended for high-end devices with ample RAM.",
  },
];

// ── Capability copy per tier (what the on-device model unlocks) ──────────────

const CAPABILITY_COPY: Record<"basic" | "standard", { label: string; unlocks: string }> = {
  basic: {
    label: "Basic",
    unlocks: "Break down tasks and generate quick task lists.",
  },
  standard: {
    label: "Standard",
    unlocks: "Create plans, bulk tasks, routines, and milestone roadmaps.",
  },
};

// ── Embedded AI section ───────────────────────────────────────────────────────

function EmbeddedSection() {
  const runtime = useAIRuntime();
  const caps = getDeviceCapabilities();
  const { tier, isDesktop } = caps;

  const currentModel = resolveTransformersModel(runtime.mode, tier, isDesktop);
  const sizeMB = MODEL_SIZES[currentModel] ?? 300;
  const capability = CAPABILITY_COPY[runtime.capabilityLevel === "standard" ? "standard" : "basic"];
  const sizeLabel = sizeMB < 1000 ? `~${sizeMB} MB` : `~${(sizeMB / 1000).toFixed(1)} GB`;

  const statusLabel =
    runtime.status === "ready"       ? "Ready · Works offline" :
    runtime.status === "downloading" ? `Downloading… ${runtime.downloadProgress}%` :
    runtime.status === "enabling"    ? (runtime.modelCached ? "Loading from cache…" : "Starting up…") :
    runtime.status === "error"       ? "Setup failed — tap to retry" :
    "Not enabled";

  const statusColor =
    runtime.status === "ready"   ? "text-emerald-600 dark:text-emerald-400" :
    runtime.status === "error"   ? "text-rose-500 dark:text-rose-400" :
    runtime.status === "disabled" ? "text-neutral-400 dark:text-neutral-500" :
    "text-amber-500 dark:text-amber-400";

  return (
    <Card>
      {/* Status row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#AD46FF]">
          <IconSparkles size={16} strokeWidth={2} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-neutral-900 dark:text-white">
            Embedded Intelligence
          </p>
          <p className={`text-[11px] font-medium ${statusColor}`}>{statusLabel}</p>
        </div>
        {runtime.enabled ? (
          <button
            type="button"
            onClick={runtime.disable}
            className="rounded-xl border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-500 hover:border-neutral-300 dark:border-white/[0.08] dark:text-neutral-400"
          >
            Disable
          </button>
        ) : (
          <m.button
            type="button"
            onClick={runtime.enable}
            whileTap={{ scale: 0.96 }}
            className="rounded-xl bg-neutral-900 px-3 py-1.5 text-[11px] font-bold text-white dark:bg-white dark:text-neutral-900"
          >
            Enable
          </m.button>
        )}
      </div>

      {/* Download progress bar — only for a real download, not a cache load */}
      {!runtime.modelCached && (runtime.status === "downloading" || runtime.status === "enabling") && (
        <div className="mx-4 mb-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
            <m.div
              className="h-full rounded-full bg-emerald-500"
              animate={{ width: `${Math.max(runtime.downloadProgress, 3)}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}

      {/* Current capability tier */}
      {runtime.enabled && (
        <>
          <Divider />
          <div className="px-4 py-3">
            <p className="text-[12px] font-bold text-neutral-900 dark:text-white">
              {capability.label} on-device AI
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
              {capability.unlocks} Coaching needs Ollama on desktop.
            </p>
          </div>
        </>
      )}

      <Divider />

      {/* Performance modes */}
      <div className="px-4 py-3.5">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
          Performance mode
        </p>
        <div className="space-y-2">
          {MODES.map((m) => {
            const active = runtime.mode === m.id;
            const modeModel = resolveTransformersModel(m.id, tier, isDesktop);
            const modeSizeMB = MODEL_SIZES[modeModel] ?? 300;
            const modeSizeLabel = modeSizeMB < 1000 ? `~${modeSizeMB} MB` : `~${(modeSizeMB / 1000).toFixed(1)} GB`;
            const modeName = modelLabel(modeModel);

            // A model already in the browser cache loads instantly — show it as
            // downloaded, never as "Download". Live download UI only applies to
            // the active model that's actively fetching.
            const modeCached = runtime.enabled && isModelDownloaded(modeModel);
            const isDownloading =
              active && !modeCached && (runtime.status === "downloading" || runtime.status === "enabling");
            const isReady = active && runtime.status === "ready";

            return (
              <div
                key={m.id}
                className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                  active
                    ? "border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white"
                    : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-white/[0.08] dark:bg-neutral-900/50 dark:hover:border-white/[0.15]"
                }`}
              >
                {/* Selectable area */}
                <button
                  type="button"
                  onClick={() => runtime.setMode(m.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <div className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                    active
                      ? "border-white bg-white dark:border-neutral-900 dark:bg-neutral-900"
                      : "border-neutral-300 dark:border-neutral-600"
                  }`}>
                    {active && (
                      <div className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-white" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-[13px] font-bold ${active ? "text-white dark:text-neutral-900" : "text-neutral-900 dark:text-white"}`}>
                        {m.label}
                      </p>
                      {m.badge && (
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          active
                            ? "bg-white/20 text-white dark:bg-neutral-900/20 dark:text-neutral-900"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        }`}>
                          {m.badge}
                        </span>
                      )}
                    </div>
                    {/* Model name + size */}
                    <div className={`mt-0.5 flex items-center gap-1.5 text-[10px] font-medium ${active ? "text-white/55 dark:text-neutral-900/55" : "text-neutral-400 dark:text-neutral-500"}`}>
                      <span className="font-mono">{modeName}</span>
                      <span aria-hidden>·</span>
                      <span>{modeSizeLabel}</span>
                    </div>
                    <p className={`mt-0.5 text-[11px] leading-snug ${active ? "text-white/70 dark:text-neutral-900/70" : "text-neutral-500 dark:text-neutral-400"}`}>
                      {m.description}
                    </p>
                  </div>
                </button>

                {/* Download / status control */}
                <div className="mt-0.5 shrink-0">
                  {isReady ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 dark:text-emerald-600">
                      <IconCheck size={13} strokeWidth={2.5} />
                      Ready
                    </span>
                  ) : isDownloading ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-white/80 dark:text-neutral-900/80">
                      <IconLoader2 size={13} strokeWidth={2.5} className="animate-spin" />
                      {runtime.downloadProgress}%
                    </span>
                  ) : modeCached ? (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">
                      <IconCheck size={12} strokeWidth={2.5} />
                      Downloaded
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => runtime.setMode(m.id)}
                      title={`Download ${modeName}`}
                      className={`flex h-7 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold transition-colors ${
                        active
                          ? "bg-white/15 text-white hover:bg-white/25 dark:bg-neutral-900/15 dark:text-neutral-900 dark:hover:bg-neutral-900/25"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
                      }`}
                    >
                      <IconDownload size={12} strokeWidth={2.5} />
                      Download
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2.5 text-[10px] text-neutral-400 dark:text-neutral-500">
          Models are downloaded once from Hugging Face and cached on your device permanently.
        </p>
      </div>

      <Divider />

      {/* Privacy note */}
      <div className="flex items-start gap-2.5 px-4 py-3.5">
        <IconShield size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-emerald-500" />
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          Runs entirely on your device. No data is ever sent to a cloud AI service.
          Works fully offline after the initial download.
        </p>
      </div>
    </Card>
  );
}

// ── Ollama section ────────────────────────────────────────────────────────────

const SETUP_STEPS = [
  { cmd: "brew install ollama", desc: "Install Ollama" },
  { cmd: 'ollama serve --cors "<your-origin>"', desc: "Start with browser CORS" },
  { cmd: `ollama pull ${DEFAULT_OLLAMA_MODEL}`, desc: "Download the default model" },
];

function OllamaSection() {
  const [url, setUrl] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(OLLAMA_URL_KEY) ?? DEFAULT_OLLAMA_URL) : DEFAULT_OLLAMA_URL
  );
  const [model, setModel] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(OLLAMA_MODEL_KEY) ?? DEFAULT_OLLAMA_MODEL) : DEFAULT_OLLAMA_MODEL
  );
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionState, setConnectionState] = useState<"idle" | "ok" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [origin, setOrigin] = useState("https://your-app.web.app");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  function saveUrl(v: string) {
    const val = v.trim() || DEFAULT_OLLAMA_URL;
    localStorage.setItem(OLLAMA_URL_KEY, val);
    setUrl(val);
  }

  function saveModel(v: string) {
    const val = v.trim() || DEFAULT_OLLAMA_MODEL;
    localStorage.setItem(OLLAMA_MODEL_KEY, val);
    setModel(val);
  }

  const serveCmd = `ollama serve --cors "${origin}"`;

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1800);
  }

  async function fetchModels(targetUrl = url) {
    setFetching(true); setErrorMsg(null);
    try {
      const models = await checkOllamaConnection(targetUrl);
      setAvailableModels(models);
      if (models.length > 0 && !models.includes(model)) saveModel(models[0]);
    } catch (err) {
      setAvailableModels([]);
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally { setFetching(false); }
  }

  async function testConnection() {
    setTesting(true); setErrorMsg(null);
    try {
      const status = await checkModelStatus(url, model);
      setConnectionState(status === "connected" ? "ok" : "error");
      if (status !== "connected") setErrorMsg("Ollama is reachable but the model is not installed.");
    } catch (err) {
      setConnectionState("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally { setTesting(false); }
  }

  useEffect(() => { void fetchModels(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
          <IconServer size={16} strokeWidth={1.8} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-neutral-900 dark:text-white">Strategic AI</p>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
            Ollama · Desktop · Deep planning and roadmaps
          </p>
        </div>
        <div className={`h-2 w-2 rounded-full ${
          connectionState === "ok" ? "bg-emerald-500" :
          connectionState === "error" ? "bg-rose-500" :
          availableModels.length > 0 ? "bg-emerald-500" :
          "bg-neutral-300 dark:bg-neutral-600"
        }`} />
      </div>

      <Divider />

      {/* ── Step-by-step setup (run in Terminal, top to bottom) ──────────────── */}
      <div className="px-4 py-3.5">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
          Run these in Terminal
        </p>
        <div className="space-y-0">
          {SETUP_STEPS.map(({ cmd, desc }, i) => {
            const resolved = cmd.includes("<your-origin>") ? serveCmd : cmd;
            const key = `step-${i}`;
            const isLast = i === SETUP_STEPS.length - 1;
            return (
              <div key={key} className="flex gap-3">
                {/* Number + connector */}
                <div className="flex flex-col items-center">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-bold text-white dark:bg-white dark:text-neutral-900">
                    {i + 1}
                  </span>
                  {!isLast && <span className="my-1 w-px flex-1 bg-neutral-200 dark:bg-white/[0.1]" />}
                </div>
                <div className="min-w-0 flex-1 pb-3">
                  <p className="mb-1 text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">{desc}</p>
                  <button type="button" onClick={() => void copy(resolved, key)}
                    title="Copy command"
                    className="group/cmd flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-left dark:border-white/[0.08] dark:bg-white/[0.03]">
                    <code className="truncate text-[11px] font-mono text-neutral-700 dark:text-neutral-300">{resolved}</code>
                    {copiedKey === key ? (
                      <IconCheck size={12} strokeWidth={2.5} className="shrink-0 text-emerald-500" />
                    ) : (
                      <IconCopy size={12} strokeWidth={2} className="shrink-0 text-neutral-400 group-hover/cmd:text-neutral-600" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-neutral-400 dark:text-neutral-500">
          Browse more models at ollama.com/library — swap the name in step&nbsp;3 to use a different one.
        </p>
      </div>

      <Divider />

      {/* ── Final step: point PlanR at your server ──────────────────────────── */}
      <div className="space-y-3 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[10px] font-bold text-white dark:bg-white dark:text-neutral-900">
            4
          </span>
          <p className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">
            Connect PlanR, then test
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Server URL</p>
          <input
            type="text" value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={(e) => { saveUrl(e.target.value); void fetchModels(e.target.value.trim() || DEFAULT_OLLAMA_URL); }}
            placeholder={DEFAULT_OLLAMA_URL}
            className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Model</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => void fetchModels()} disabled={fetching}
                title="Refresh model list"
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-[10px] font-semibold text-neutral-500 hover:bg-white disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400">
                <IconRefresh size={10} strokeWidth={2} className={fetching ? "animate-spin" : ""} />
              </button>
              <button type="button" onClick={() => void testConnection()} disabled={testing}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[10px] font-semibold text-neutral-500 hover:bg-white disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400">
                {testing ? "…" : "Test"}
              </button>
            </div>
          </div>

          {availableModels.length > 0 ? (
            <div className="relative">
              <select value={model} onChange={(e) => saveModel(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-8 text-[13px] font-medium text-neutral-900 outline-none dark:border-white/[0.08] dark:bg-neutral-900 dark:text-white">
                {availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <IconChevronDown size={12} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            </div>
          ) : (
            <input type="text" value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={(e) => saveModel(e.target.value)}
              placeholder={DEFAULT_OLLAMA_MODEL}
              className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" />
          )}

          <AnimatePresence>
            {errorMsg && (
              <m.p key="err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-1.5 flex items-start gap-1.5 overflow-hidden text-[11px] text-rose-500 dark:text-rose-400">
                <IconWifiOff size={11} strokeWidth={2} className="mt-px shrink-0" />
                {errorMsg}
              </m.p>
            )}
            {!errorMsg && connectionState === "ok" && (
              <m.p key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                <IconCheck size={11} strokeWidth={2.5} />
                Connected · {availableModels.length} model{availableModels.length !== 1 ? "s" : ""} available
              </m.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Card>
  );
}

// ── Main sheet ────────────────────────────────────────────────────────────────

interface AISettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AISettingsSheet({ open, onClose }: AISettingsSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} desktopWidth="max-w-[560px]">
      <div
        className="px-5 pt-4"
        style={{ paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 24px))" }}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-[17px] font-bold tracking-[-0.3px] text-neutral-900 dark:text-white">
              AI Settings
            </p>
            <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
              Local-first · Private · No cloud AI
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06]">
            <IconX size={16} strokeWidth={2} />
          </button>
        </div>

        <p className="mb-4 px-1 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          PlanR has two levels of AI. Level&nbsp;1 is built in and works automatically.
          Level&nbsp;2 is an optional desktop upgrade for deeper coaching.
        </p>

        <div className="space-y-5">
          {/* Level 1 — on-device, automatic */}
          <div>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white dark:bg-white dark:text-neutral-900">
                1
              </span>
              <p className="text-[12px] font-bold text-neutral-900 dark:text-white">
                On-device AI — ready automatically
              </p>
            </div>
            <p className="mb-2 pl-8 pr-1 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
              Private and built in. Pick a model below — it downloads once, then works offline.
            </p>
            <EmbeddedSection />
          </div>

          {/* Level 2 — Ollama, optional */}
          <div>
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-bold text-white dark:bg-white dark:text-neutral-900">
                2
              </span>
              <p className="text-[12px] font-bold text-neutral-900 dark:text-white">
                Strategic AI — optional, desktop only
              </p>
            </div>
            <p className="mb-2 pl-8 pr-1 text-[11px] leading-snug text-neutral-500 dark:text-neutral-400">
              Unlocks the conversational coach and deeper plans. Follow the 3 steps below to connect Ollama.
            </p>
            <OllamaSection />
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
