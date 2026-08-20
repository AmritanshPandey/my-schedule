"use client";

import { useState } from "react";
import { IconCheck, IconEye, IconEyeOff, IconShield, IconSparkles, IconX } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { haptic } from "@/lib/haptics";
import type { AIProviderType, ConnectionResult } from "@/lib/ai/providers/types";
import { mlxProvider } from "@/lib/ai/providers/mlx";
import { ollamaProvider } from "@/lib/ai/providers/ollama";
import { apiProvider } from "@/lib/ai/providers/openaiCompatible";
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
} from "@/lib/ai/providers/settings";

function Card({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">{children}</div>;
}

function Divider() { return <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.06]" />; }

const PROVIDER_OPTIONS: { value: AIProviderType; label: string; note: string }[] = [
  { value: "mlx", label: "MLX", note: "Local default" },
  { value: "ollama", label: "Ollama", note: "Local" },
  { value: "api", label: "API", note: "OpenAI-compatible" },
];

function ProviderPicker({ value, onChange }: { value: AIProviderType; onChange: (value: AIProviderType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 px-1">
      {PROVIDER_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => { haptic("light"); onChange(option.value); }}
          className={`rounded-xl border px-2 py-2 text-center transition-colors ${value === option.value ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-900" : "border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:text-neutral-400"}`}
        >
          <span className="block text-[12px] font-bold">{option.label}</span>
          <span className={`mt-0.5 block text-[10px] ${value === option.value ? "text-white/65 dark:text-neutral-600" : "text-neutral-400"}`}>{option.note}</span>
        </button>
      ))}
    </div>
  );
}

function Field({ label, value, placeholder, type = "text", onChange }: { label: string; value: string; placeholder: string; type?: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
      />
    </label>
  );
}

function ProviderCard({ provider }: { provider: AIProviderType }) {
  const [status, setStatus] = useState<"idle" | "testing" | ConnectionResult>("idle");
  const [showKey, setShowKey] = useState(false);
  const providerObject = provider === "mlx" ? mlxProvider : provider === "ollama" ? ollamaProvider : apiProvider;
  const [mlxUrl, setMlxUrl] = useState(getMlxBaseUrl);
  const [mlxModel, setMlxModelState] = useState(getMlxModel);
  const [ollamaUrl, setOllamaUrl] = useState(getOllamaBaseUrl);
  const [ollamaModel, setOllamaModelState] = useState(getOllamaModel);
  const [apiUrl, setApiUrl] = useState(getApiBaseUrl);
  const [apiModel, setApiModelState] = useState(getApiModel);
  const [apiKey, setApiKeyState] = useState(getApiKey);

  function save(setter: (value: string) => void, persist: (value: string) => void, value: string) {
    const trimmed = value.trim();
    setter(trimmed);
    persist(trimmed);
    setStatus("idle");
    setAiConnectionStatus(provider, false);
  }

  async function testConnection() {
    haptic("light");
    setStatus("testing");
    const result = await providerObject.testConnection();
    setStatus(result);
    setAiConnectionStatus(provider, result.ok);
  }

  const title = provider === "mlx" ? "MLX" : provider === "ollama" ? "Ollama" : "OpenAI-compatible API";
  const description = provider === "mlx" ? "Runs locally through mlx_lm.server." : provider === "ollama" ? "Runs locally through the Ollama app." : "Connect any provider that supports /v1/chat/completions.";
  const statusLabel = status === "idle" ? "Not tested yet" : status === "testing" ? "Testing…" : status.ok ? `Connected${status.latencyMs ? ` · ${status.latencyMs}ms` : ""}` : status.message;

  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-900 dark:bg-white"><IconSparkles size={16} className="text-white dark:text-neutral-900" /></div>
        <div className="min-w-0 flex-1"><p className="text-[13px] font-bold text-neutral-900 dark:text-white">{title}</p><p className={`truncate text-[11px] font-medium ${status === "idle" || status === "testing" ? "text-neutral-400" : status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>{statusLabel}</p></div>
        {status !== "idle" && status !== "testing" && status.ok && <IconCheck size={15} className="text-emerald-500" />}
      </div>
      <Divider />
      <div className="space-y-3 px-4 py-3.5">
        {provider === "mlx" && <><Field label="Server URL" value={mlxUrl} placeholder="http://localhost:8080" onChange={(value) => save(setMlxUrl, setMlxBaseUrl, value)} /><Field label="Model" value={mlxModel} placeholder="mlx-community/Qwen3-4B-4bit" onChange={(value) => save(setMlxModelState, setMlxModel, value)} /></>}
        {provider === "ollama" && <><Field label="Server URL" value={ollamaUrl} placeholder="http://localhost:11434" onChange={(value) => save(setOllamaUrl, setOllamaBaseUrl, value)} /><Field label="Model" value={ollamaModel} placeholder="llama3.2" onChange={(value) => save(setOllamaModelState, setOllamaModel, value)} /></>}
        {provider === "api" && <><Field label="API base URL" value={apiUrl} placeholder="https://api.openai.com/v1" onChange={(value) => save(setApiUrl, setApiBaseUrl, value)} /><Field label="Model" value={apiModel} placeholder="gpt-4o-mini" onChange={(value) => save(setApiModelState, setApiModel, value)} /><label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">API key (optional)</span><div className="relative"><input type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => { setApiKeyState(event.target.value); setApiKey(event.target.value); setStatus("idle"); setAiConnectionStatus(provider, false); }} placeholder="Stored on this device" className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-10 text-[13px] font-medium text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white" /><button type="button" aria-label={showKey ? "Hide API key" : "Show API key"} onClick={() => setShowKey((visible) => !visible)} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-neutral-400">{showKey ? <IconEyeOff size={15} /> : <IconEye size={15} />}</button></div></label></>}
        <button type="button" onClick={() => void testConnection()} disabled={status === "testing"} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-60 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04]">{status === "testing" ? "Testing…" : "Test connection"}</button>
      </div>
      <Divider />
      <div className="flex items-start gap-2.5 px-4 py-3.5"><IconShield size={13} className="mt-0.5 shrink-0 text-emerald-500" /><p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">{description} {provider === "api" ? "Your key is stored locally in this browser and sent only to the endpoint you enter." : "No PlanR account or external AI key is required."}</p></div>
    </Card>
  );
}

export function AISettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [provider, setProvider] = useState<AIProviderType>(() => getActiveProviderType());
  function changeProvider(next: AIProviderType) { setActiveProviderType(next); setProvider(next); }
  return <BottomSheet open={open} onClose={onClose} desktopWidth="max-w-[560px]"><div className="px-5 pt-4" style={{ paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 24px))" }}><div className="mb-5 flex items-center justify-between"><div><p className="text-[17px] font-bold text-neutral-900 dark:text-white">AI Settings</p><p className="text-[12px] text-neutral-400 dark:text-neutral-500">Choose where PlanR sends AI requests</p></div><button type="button" onClick={onClose} aria-label="Close AI settings" className="flex h-8 w-8 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06]"><IconX size={16} /></button></div><div className="mb-4"><ProviderPicker value={provider} onChange={changeProvider} /></div><ProviderCard key={provider} provider={provider} /></div></BottomSheet>;
}
