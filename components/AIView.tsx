"use client";

/**
 * The dedicated AI page (Settings → AI, or the "AI" row in the mobile
 * settings sheet) — replaces the old AISettingsSheet.tsx bottom sheet as the
 * one place to: pick and configure a provider (local MLX/Ollama, or a remote
 * OpenAI-compatible API with your own key), test the connection, and
 * customize the per-category instructions every generator appends to its
 * built-in prompt (lib/ai/instructions.ts).
 *
 * Every field here writes straight to localStorage (lib/ai/config.ts,
 * lib/ai/instructions.ts) — no save-then-sync round trip, no account
 * needed. See those files' own comments for why this stays device-local
 * rather than syncing through Firestore.
 */

import { useEffect, useState } from "react";
import {
  IconAlertTriangle,
  IconChevronLeft,
  IconCircleCheck,
  IconCircleX,
  IconDeviceLaptop,
  IconLoader2,
  IconSparkles,
} from "@tabler/icons-react";
import {
  getAIProviderState,
  setActiveProvider,
  setProviderConfig,
  DEFAULT_MLX_CONFIG,
  DEFAULT_OLLAMA_CONFIG,
  DEFAULT_REMOTE_CONFIG,
  DEFAULT_BROWSER_CONFIG,
  REMOTE_PRESETS,
  type AIProviderState,
} from "@/lib/ai/config";
import { MLXProvider } from "@/lib/ai/providers/mlx";
import { OllamaProvider } from "@/lib/ai/providers/ollama";
import { OpenAICompatibleProvider } from "@/lib/ai/providers/openai-compatible";
import { BrowserProvider } from "@/lib/ai/providers/browser";
import { BrowserAIStatusBar } from "@/components/ai/BrowserAIStatusBar";
import { useAIEnabledSetting } from "@/lib/ai/useAIEnabled";
import Toggle from "@/components/ui/Toggle";
import type { AIConnectionTestResult, AIInstructions, AIProvider, AIProviderConfig, ProviderKind } from "@/lib/ai/types";
import { getAIInstructions, setAIInstructions } from "@/lib/ai/instructions";
import { haptic } from "@/lib/haptics";
import { CARD, SOFT_PANEL } from "@/components/ui/surfaces";
import { SETTINGS_CONTROL_CLASS } from "@/components/ui/Input";

function providerFor(kind: ProviderKind, config: AIProviderConfig): AIProvider {
  if (kind === "ollama") return new OllamaProvider(config);
  if (kind === "openai-compatible") return new OpenAICompatibleProvider(config);
  if (kind === "browser") return new BrowserProvider(config);
  return new MLXProvider(config);
}

/** Every kind's config lives under its own key in AIProviderState — this is
 *  the one place that maps between them, so ProviderForm doesn't repeat a
 *  four-way ternary at every call site. */
function configForKind(state: AIProviderState, kind: ProviderKind): AIProviderConfig {
  if (kind === "ollama") return state.ollama;
  if (kind === "openai-compatible") return state.remote;
  if (kind === "browser") return state.browser;
  return state.mlx;
}

function defaultsForKind(kind: ProviderKind): AIProviderConfig {
  if (kind === "ollama") return DEFAULT_OLLAMA_CONFIG;
  if (kind === "openai-compatible") return DEFAULT_REMOTE_CONFIG;
  if (kind === "browser") return DEFAULT_BROWSER_CONFIG;
  return DEFAULT_MLX_CONFIG;
}

const PROVIDER_LABEL: Record<ProviderKind, string> = {
  mlx: "MLX",
  ollama: "Ollama",
  "openai-compatible": "API Provider",
  browser: "Browser AI",
};

// ── Primitives (matching SettingsView.tsx's vocabulary) ────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.10em] text-neutral-400 dark:text-neutral-500">
      {children}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{label}</p>
      {children}
    </div>
  );
}

// ── Test-connection status pill ─────────────────────────────────────────────

function StatusPill({ phase, result }: { phase: "idle" | "testing" | "done"; result: AIConnectionTestResult | null }) {
  if (phase === "testing") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">
        <IconLoader2 size={13} strokeWidth={2.5} className="animate-spin" />
        Connecting…
      </span>
    );
  }
  if (result?.ok) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <IconCircleCheck size={14} strokeWidth={2} />
        Connected
      </span>
    );
  }
  if (result && !result.ok) {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
        <IconCircleX size={14} strokeWidth={2} />
        Unavailable
      </span>
    );
  }
  return null;
}

// ── One provider's config form ──────────────────────────────────────────────

function ProviderForm({
  kind,
  isActive,
  onActivate,
}: {
  kind: ProviderKind;
  isActive: boolean;
  onActivate: () => void;
}) {
  const defaults = defaultsForKind(kind);
  const [config, setConfig] = useState<AIProviderConfig>(() => configForKind(getAIProviderState(), kind));
  const [phase, setPhase] = useState<"idle" | "testing" | "done">("idle");
  const [result, setResult] = useState<AIConnectionTestResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<string[] | null>(null);
  const [preset, setPreset] = useState(REMOTE_PRESETS[REMOTE_PRESETS.length - 1].label);

  const saved = configForKind(getAIProviderState(), kind);
  const dirty = config.baseUrl !== saved.baseUrl || config.model !== saved.model || (config.apiKey ?? "") !== (saved.apiKey ?? "");

  async function runTest(cfg: AIProviderConfig) {
    haptic("light");
    setPhase("testing");
    setResult(null);
    const outcome = await providerFor(kind, cfg).testConnection();
    setResult(outcome);
    setPhase("done");
  }

  function handleSave() {
    const next = setProviderConfig(kind, config);
    setConfig(configForKind(next, kind));
    void runTest(config);
  }

  function handleActivateAndTest() {
    onActivate();
    if (result === null) void runTest(config);
  }

  async function handleDetectModels() {
    setDetecting(true);
    setDetected(null);
    try {
      const provider = providerFor(kind, config);
      const models = await provider.listModels?.();
      setDetected(models ?? []);
    } catch {
      setDetected([]);
    } finally {
      setDetecting(false);
    }
  }

  const isRemote = kind === "openai-compatible";
  const isBrowser = kind === "browser";

  return (
    <div className={`overflow-hidden ${CARD} ${isActive ? "ring-1 ring-emerald-500/40" : ""}`}>
      <button
        type="button"
        onClick={handleActivateAndTest}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isActive ? "bg-neutral-900 dark:bg-white" : "bg-neutral-100 dark:bg-white/[0.06]"}`}>
          <IconDeviceLaptop size={16} strokeWidth={2} className={isActive ? "text-white dark:text-neutral-900" : "text-neutral-400 dark:text-neutral-500"} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-neutral-900 dark:text-white">{PROVIDER_LABEL[kind]}</p>
          <p className="truncate text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
            {isRemote ? "Bring your own API key" : "Runs on your device"}
          </p>
        </div>
        {isActive ? (
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
            Active
          </span>
        ) : (
          <span className="rounded-full border border-neutral-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400 dark:border-white/[0.08] dark:text-neutral-500">
            Use this
          </span>
        )}
      </button>

      {isActive && (
        <>
          <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.06]" />
          <div className="flex items-center justify-between px-4 py-2.5">
            <StatusPill phase={phase} result={result} />
            {result?.ok && (
              <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                {result.tokensPerSecond ? `${result.tokensPerSecond} tok/s` : "Responding normally"}
              </p>
            )}
          </div>
          {result && !result.ok && (
            <div className="flex items-start gap-2 px-4 pb-2.5">
              <IconAlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-rose-500" />
              <p className="text-[11px] leading-relaxed text-rose-600 dark:text-rose-400">{result.error}</p>
            </div>
          )}

          <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.06]" />

          <div className="space-y-3 px-4 py-3.5">
            {isRemote && (
              <Field label="Preset">
                <div className="flex gap-1.5">
                  {REMOTE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setPreset(p.label);
                        setConfig((c) => ({ ...c, baseUrl: p.baseUrl || c.baseUrl }));
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                        preset === p.label
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "border border-neutral-200 text-neutral-500 hover:border-neutral-300 dark:border-white/[0.08] dark:text-neutral-400"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            {!isBrowser && (
              <Field label={isRemote ? "Base URL" : "Server"}>
                <input
                  type="text"
                  value={config.baseUrl}
                  onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))}
                  placeholder={defaults.baseUrl || "https://example.com/v1"}
                  spellCheck={false}
                  className={`w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]`}
                />
              </Field>
            )}
            {isBrowser && <BrowserAIStatusBar variant="bar" />}
            {isRemote && (
              <Field label="API Key">
                <input
                  type="password"
                  value={config.apiKey ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                  placeholder="sk-…"
                  spellCheck={false}
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
                />
              </Field>
            )}
            <Field label="Model">
              <input
                type="text"
                value={config.model}
                onChange={(e) => setConfig((c) => ({ ...c, model: e.target.value }))}
                placeholder={defaults.model || "model-name"}
                spellCheck={false}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
              />
            </Field>

            {(kind === "ollama" || isRemote) && (
              <div>
                <button
                  type="button"
                  onClick={() => void handleDetectModels()}
                  disabled={detecting}
                  className="text-[11px] font-semibold text-neutral-500 underline decoration-neutral-300 underline-offset-2 hover:text-neutral-700 disabled:opacity-50 dark:text-neutral-400 dark:decoration-neutral-600 dark:hover:text-neutral-200"
                >
                  {detecting ? "Detecting models…" : "Detect models"}
                </button>
                {detected && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {detected.length === 0 ? (
                      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">No models found — check the server is running.</p>
                    ) : (
                      detected.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setConfig((c) => ({ ...c, model: m }))}
                          className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${SOFT_PANEL} ${config.model === m ? "ring-1 ring-emerald-500/50" : ""}`}
                        >
                          {m}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={dirty ? handleSave : () => void runTest(config)}
                disabled={phase === "testing"}
                className="flex-1 rounded-xl bg-neutral-900 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
              >
                {isBrowser
                  ? (dirty ? "Save & load model" : "Load model")
                  : (dirty ? "Save & test connection" : "Test connection")}
              </button>
            </div>
          </div>

          <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.06]" />
          <div className="px-4 py-3.5">
            <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {kind === "mlx" && (
                <>Start it with <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-white/[0.08]">mlx_lm.server --model {config.model || defaults.model} --port 8080</code></>
              )}
              {kind === "ollama" && (
                <>Start it with <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-white/[0.08]">ollama serve</code>, then pull a model with <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:bg-white/[0.08]">ollama pull {config.model || defaults.model}</code></>
              )}
              {isBrowser && (
                <>Downloads once (~460 MB on WebGPU, ~750 MB on CPU) and runs entirely in this browser tab — no server, no account, nothing leaves your device.</>
              )}
              {isRemote && (
                <>Your key is stored on this device only, sent directly to the provider — never through PlanR&apos;s servers (there are none). Some providers block direct browser requests (CORS); OpenRouter explicitly allows it.</>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Instructions section ────────────────────────────────────────────────────

const INSTRUCTION_FIELDS: { key: "plan" | "task" | "subtask" | "milestone"; label: string; placeholder: string }[] = [
  { key: "plan", label: "Plan", placeholder: "e.g. Prefer morning sessions. Keep plans under 12 weeks unless I say otherwise." },
  { key: "task", label: "Tasks", placeholder: "e.g. Titles under 5 words. Always include a warm-up subtask for workouts." },
  { key: "subtask", label: "Subtasks", placeholder: "e.g. 3 steps max. Phrase each as an imperative verb." },
  { key: "milestone", label: "Milestones", placeholder: "e.g. Space milestones every 2 weeks, not evenly by default." },
];

function InstructionsSection() {
  const [values, setValues] = useState<AIInstructions>(() => getAIInstructions());
  const [saved, setSaved] = useState(false);

  function handleSave() {
    haptic("light");
    setAIInstructions(values);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const dirty = JSON.stringify(values) !== JSON.stringify(getAIInstructions());

  return (
    <div className={`overflow-hidden ${CARD}`}>
      <div className="px-4 py-3.5">
        <p className="text-[13px] font-bold text-neutral-900 dark:text-white">Instructions</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500">
          Added to the built-in prompt for each category — leave blank to use the default behavior as-is.
        </p>
      </div>
      <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.06]" />
      <div className="space-y-4 px-4 py-3.5">
        {INSTRUCTION_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            <textarea
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v: AIInstructions) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              rows={2}
              className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:placeholder:text-neutral-600 dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
            />
          </Field>
        ))}
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty && !saved}
          className="w-full rounded-xl bg-neutral-900 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {saved ? "Saved" : "Save instructions"}
        </button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

interface AIViewProps {
  onClose: () => void;
}

export function AIView({ onClose }: AIViewProps) {
  const [active, setActive] = useState<ProviderKind>(() => getAIProviderState().active);
  const { enabled: aiEnabled, setEnabled: setAiEnabled } = useAIEnabledSetting();

  function activate(kind: ProviderKind) {
    haptic("light");
    setActiveProvider(kind);
    setActive(kind);
  }

  return (
    <div className="min-h-full bg-[#F5F5F5] dark:bg-[#111111]">
      <div
        className="mx-auto max-w-2xl px-4 pt-6 lg:px-8 lg:pt-8"
        style={{ paddingBottom: "max(48px, calc(env(safe-area-inset-bottom) + 32px))" }}
      >
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/[0.06] lg:hidden"
            aria-label="Back"
          >
            <IconChevronLeft size={18} strokeWidth={2} />
          </button>
          <div>
            <h1 className="text-[26px] font-black tracking-[-0.5px] text-neutral-900 dark:text-white">AI</h1>
            <p className="mt-0.5 text-[13px] text-neutral-400 dark:text-neutral-500">
              Provider, instructions, and how PlanR generates for you
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Master switch. Turning it off unmounts this whole screen (the tab
              is gated on the same value in ScheduleApp), which is why it sits
              above everything it controls rather than buried at the bottom. */}
          <div className={`flex items-center gap-3 px-4 py-3.5 ${CARD}`}>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${aiEnabled ? "bg-[#AD46FF]" : "bg-neutral-200 dark:bg-white/[0.08]"}`}>
              <IconSparkles size={18} strokeWidth={1.8} className={aiEnabled ? "text-white" : "text-neutral-400 dark:text-neutral-500"} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-neutral-900 dark:text-white">AI features</p>
              <p className="text-[12px] font-medium leading-snug text-neutral-400 dark:text-neutral-500">
                Off hides every AI button and screen. You can turn it back on here or in Settings.
              </p>
            </div>
            <Toggle on={aiEnabled} onChange={setAiEnabled} label="AI features" />
          </div>

          <div>
            <SectionLabel>Local AI</SectionLabel>
            <div className="space-y-3">
              <ProviderForm kind="mlx" isActive={active === "mlx"} onActivate={() => activate("mlx")} />
              <ProviderForm kind="ollama" isActive={active === "ollama"} onActivate={() => activate("ollama")} />
              <ProviderForm kind="browser" isActive={active === "browser"} onActivate={() => activate("browser")} />
            </div>
          </div>

          <div>
            <SectionLabel>API Provider</SectionLabel>
            <ProviderForm kind="openai-compatible" isActive={active === "openai-compatible"} onActivate={() => activate("openai-compatible")} />
          </div>

          <div>
            <SectionLabel>Instructions</SectionLabel>
            <InstructionsSection />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIView;
