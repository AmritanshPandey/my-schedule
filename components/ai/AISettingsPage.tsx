"use client";

/**
 * AISettingsPage — full-page AI settings view for the dedicated Intelligence
 * sub-page inside SettingsView. Same logic as AISettingsSheet but without the
 * BottomSheet wrapper; takes an `onBack` prop to slide back to main settings.
 *
 * Additions over AISettingsSheet:
 *  • Back-button header row
 *  • Browser compatibility chip (WebGPU vs WASM detection, download size note)
 */

import { useState } from "react";
import {
  IconCheck,
  IconChevronLeft,
  IconCpu,
  IconEye,
  IconEyeOff,
  IconShield,
  IconSparkles,
} from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";
import type { AIProviderType, ConnectionResult } from "@/lib/ai/providers/types";
import { mlxProvider } from "@/lib/ai/providers/mlx";
import { ollamaProvider } from "@/lib/ai/providers/ollama";
import { apiProvider } from "@/lib/ai/providers/openaiCompatible";
import { browserProvider, prewarmBrowserAI } from "@/lib/ai/providers/browser";
import { BrowserAIStatusBar } from "@/components/ai/BrowserAIStatusBar";
import {
  getActiveProviderType,
  setActiveProviderType,
  getMlxBaseUrl,
  setMlxBaseUrl,
  getMlxModel,
  setMlxModel,
  getOllamaBaseUrl,
  setOllamaBaseUrl,
  getOllamaModel,
  setOllamaModel,
  getApiBaseUrl,
  setApiBaseUrl,
  getApiModel,
  setApiModel,
  getApiKey,
  setApiKey,
  setAiConnectionStatus,
  getBrowserModel,
  setBrowserModel,
  DEFAULT_BROWSER_MODEL,
} from "@/lib/ai/providers/settings";

// ── Local primitives ──────────────────────────────────────────────────────────

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

function Field({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
      />
    </label>
  );
}

// ── Provider picker ───────────────────────────────────────────────────────────

const PROVIDER_OPTIONS: { value: AIProviderType; label: string; note: string }[] = [
  { value: "mlx",     label: "MLX",     note: "Local" },
  { value: "ollama",  label: "Ollama",  note: "Local" },
  { value: "api",     label: "API",     note: "Remote" },
  { value: "browser", label: "Browser", note: "On-device" },
];

function ProviderPicker({
  value,
  onChange,
}: {
  value: AIProviderType;
  onChange: (v: AIProviderType) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {PROVIDER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => { haptic("light"); onChange(opt.value); }}
          className={`rounded-xl border px-2 py-2.5 text-center transition-colors ${
            value === opt.value
              ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900"
              : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-400"
          }`}
        >
          <span className="block text-[11px] font-bold">{opt.label}</span>
          <span className={`mt-0.5 block text-[9px] ${value === opt.value ? "text-white/60 dark:text-neutral-600" : "text-neutral-400"}`}>
            {opt.note}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Browser compatibility chip ────────────────────────────────────────────────

function BrowserCompatChip() {
  const hasWebGPU =
    typeof navigator !== "undefined" && "gpu" in navigator;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        hasWebGPU
          ? "border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-500/20 dark:bg-emerald-500/5"
          : "border-amber-200/70 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            hasWebGPU ? "bg-emerald-500" : "bg-amber-400"
          }`}
        />
        <span className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-200">
          {hasWebGPU ? "GPU accelerated (WebGPU)" : "CPU mode — slower (no WebGPU)"}
        </span>
      </div>
      {!hasWebGPU && (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">
          Responses may take 30–90 s. Chrome or Edge gives you GPU speed.
        </p>
      )}
      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
        First use downloads ~130 MB, then cached permanently in your browser.
      </p>
    </div>
  );
}

// ── Provider config card ──────────────────────────────────────────────────────

function ProviderCard({ provider }: { provider: AIProviderType }) {
  const [status, setStatus] = useState<"idle" | "testing" | ConnectionResult>("idle");
  const [showKey, setShowKey] = useState(false);

  const providerObject =
    provider === "mlx"     ? mlxProvider
    : provider === "ollama"  ? ollamaProvider
    : provider === "browser" ? browserProvider
    : apiProvider;

  const [mlxUrl,      setMlxUrl]          = useState(getMlxBaseUrl);
  const [mlxModel,    setMlxModelState]   = useState(getMlxModel);
  const [ollamaUrl,   setOllamaUrl]       = useState(getOllamaBaseUrl);
  const [ollamaModel, setOllamaModelState]= useState(getOllamaModel);
  const [apiUrl,      setApiUrl]          = useState(getApiBaseUrl);
  const [apiModel,    setApiModelState]   = useState(getApiModel);
  const [apiKey,      setApiKeyState]     = useState(getApiKey);
  const [browserMdl,  setBrowserMdlState] = useState(getBrowserModel);

  function save(setter: (v: string) => void, persist: (v: string) => void, value: string) {
    const trimmed = value.trim();
    setter(trimmed);
    persist(trimmed);
    setStatus("idle");
    if (provider !== "browser") setAiConnectionStatus(provider, false);
  }

  async function handleTest() {
    haptic("light");
    setStatus("testing");
    if (provider === "browser") prewarmBrowserAI();
    const result = await providerObject.testConnection();
    setStatus(result);
    if (provider !== "browser") setAiConnectionStatus(provider, result.ok);
  }

  const title =
    provider === "mlx"     ? "MLX"
    : provider === "ollama"  ? "Ollama"
    : provider === "browser" ? "On-device (browser)"
    : "OpenAI-compatible API";

  const description =
    provider === "mlx"
      ? "Runs locally through mlx_lm.server."
      : provider === "ollama"
      ? "Runs locally through the Ollama app."
      : provider === "browser"
      ? "Runs a small model in your browser — no server or API key needed."
      : "Connect any provider that supports /v1/chat/completions.";

  const statusLabel =
    status === "idle"    ? (provider === "browser" ? "Not loaded yet" : "Not tested yet")
    : status === "testing" ? (provider === "browser" ? "Loading model…" : "Testing…")
    : status.ok
      ? `${provider === "browser" ? "Ready" : "Connected"}${status.latencyMs ? ` · ${status.latencyMs}ms` : ""}`
      : (status as ConnectionResult).message;

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 dark:bg-white">
          {provider === "browser"
            ? <IconCpu size={16} className="text-white dark:text-neutral-900" />
            : <IconSparkles size={16} className="text-white dark:text-neutral-900" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-neutral-900 dark:text-white">{title}</p>
          <p
            className={`truncate text-[11px] font-medium ${
              status === "idle" || status === "testing"
                ? "text-neutral-400"
                : (status as ConnectionResult).ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-500"
            }`}
          >
            {statusLabel}
          </p>
        </div>
        {status !== "idle" && status !== "testing" && (status as ConnectionResult).ok && (
          <IconCheck size={15} className="text-emerald-500" />
        )}
      </div>

      <Divider />

      {/* Config fields */}
      <div className="space-y-3 px-4 py-3.5">
        {provider === "mlx" && (
          <>
            <Field label="Server URL"  value={mlxUrl}   placeholder="http://localhost:8080"          onChange={(v) => save(setMlxUrl,        setMlxBaseUrl, v)} />
            <Field label="Model"       value={mlxModel}  placeholder="mlx-community/Qwen3-4B-4bit"   onChange={(v) => save(setMlxModelState,  setMlxModel,   v)} />
          </>
        )}
        {provider === "ollama" && (
          <>
            <Field label="Server URL"  value={ollamaUrl}   placeholder="http://localhost:11434"      onChange={(v) => save(setOllamaUrl,        setOllamaBaseUrl, v)} />
            <Field label="Model"       value={ollamaModel}  placeholder="llama3.2"                   onChange={(v) => save(setOllamaModelState,  setOllamaModel,   v)} />
          </>
        )}
        {provider === "api" && (
          <>
            <Field label="API base URL" value={apiUrl}   placeholder="https://api.openai.com/v1"     onChange={(v) => save(setApiUrl,        setApiBaseUrl, v)} />
            <Field label="Model"        value={apiModel}  placeholder="gpt-4o-mini"                  onChange={(v) => save(setApiModelState,  setApiModel,   v)} />
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                API key (optional)
              </span>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKeyState(e.target.value);
                    setApiKey(e.target.value);
                    setStatus("idle");
                    setAiConnectionStatus(provider, false);
                  }}
                  placeholder="Stored on this device"
                  className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-10 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
                />
                <button
                  type="button"
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-neutral-400"
                >
                  {showKey ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                </button>
              </div>
            </label>
          </>
        )}
        {provider === "browser" && (
          <>
            <Field
              label="Model (HuggingFace ONNX)"
              value={browserMdl}
              placeholder={DEFAULT_BROWSER_MODEL}
              onChange={(v) => save(setBrowserMdlState, setBrowserModel, v)}
            />
            <BrowserAIStatusBar variant="bar" />
          </>
        )}

        <button
          type="button"
          onClick={() => void handleTest()}
          disabled={status === "testing"}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-60 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04]"
        >
          {status === "testing"
            ? (provider === "browser" ? "Loading model…" : "Testing…")
            : (provider === "browser" ? "Load model" : "Test connection")}
        </button>
      </div>

      <Divider />

      {/* Privacy note */}
      <div className="flex items-start gap-2.5 px-4 py-3.5">
        <IconShield size={13} className="mt-0.5 shrink-0 text-emerald-500" />
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {description}{" "}
          {provider === "api"
            ? "Your key is stored locally in this browser and sent only to the endpoint you enter."
            : "No PlanR account or external AI key is required."}
        </p>
      </div>
    </Card>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function AISettingsPage({ onBack }: { onBack: () => void }) {
  const [provider, setProvider] = useState<AIProviderType>(() => getActiveProviderType());

  function changeProvider(next: AIProviderType) {
    setActiveProviderType(next);
    setProvider(next);
    if (next === "browser") prewarmBrowserAI();
  }

  return (
    <div
      className="min-h-full bg-[#F5F5F5] dark:bg-[#111111]"
      style={{ paddingBottom: "max(48px, calc(env(safe-area-inset-bottom) + 32px))" }}
    >
      <div className="mx-auto max-w-2xl px-4 pt-4 lg:px-8 lg:pt-6">

        {/* Back header */}
        <div className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to Settings"
            className="-ml-1 flex items-center gap-0.5 rounded-xl px-2 py-1.5 text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
          >
            <IconChevronLeft size={18} strokeWidth={2.2} />
            <span className="text-[13px] font-semibold">Settings</span>
          </button>
        </div>

        <div className="mb-5">
          <h2 className="text-[22px] font-black tracking-[-0.4px] text-neutral-900 dark:text-white">
            Intelligence
          </h2>
          <p className="mt-0.5 text-[13px] text-neutral-400 dark:text-neutral-500">
            Choose where PlanR runs AI — all providers are local or private
          </p>
        </div>

        <div className="space-y-4">
          {/* Browser compat chip — only when browser provider is selected */}
          {provider === "browser" && <BrowserCompatChip />}

          {/* Provider picker */}
          <ProviderPicker value={provider} onChange={changeProvider} />

          {/* Config card — key= remounts on provider change so state is fresh */}
          <ProviderCard key={provider} provider={provider} />
        </div>
      </div>
    </div>
  );
}
