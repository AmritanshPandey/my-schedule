"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import {
  IconBrain,
  IconCheck,
  IconChevronRight,
  IconCloud,
  IconCopy,
  IconMoon,
  IconRefresh,
  IconServer,
  IconShield,
  IconSparkles,
  IconSun,
  IconTerminal2,
  IconTrash,
  IconWifiOff,
  IconX,
  IconChevronDown,
} from "@tabler/icons-react";
import { useAuth } from "@/contexts/AuthProvider";
import { deleteCloudData } from "@/lib/cloudSync";
import { useSyncStatus } from "@/lib/useSyncStatus";
import { haptic } from "@/lib/haptics";
import { hardRefreshApp } from "@/lib/chunkRecovery";
import { versionLabel } from "@/lib/buildInfo";
import { collectDiagnostics, formatDiagnostics, type DiagnosticsSnapshot } from "@/lib/diagnostics";
import { clearErrorLog } from "@/lib/errorLog";
import { isErrorTelemetryEnabled, setErrorTelemetryEnabled } from "@/lib/errorTelemetry";
import { clearBootLog } from "@/lib/iosSafeMode";
import {
  checkOllamaConnection, checkModelStatus,
  OLLAMA_URL_KEY, OLLAMA_MODEL_KEY,
  DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL,
} from "@/lib/ai";
import { useAIRuntime } from "@/lib/ai/useAIRuntime";
import { resolveTransformersModel, MODEL_SIZES, type AIPerformanceMode } from "@/lib/ai/runtime";
import { AI_ENABLED } from "@/lib/featureFlags";
import { getDeviceCapabilities } from "@/lib/performance/detectLowEndDevice";
import { formatDisplayTime, minutesToInputTime } from "@/lib/timeUtils";
import type { Schedule, SchedulePreferences } from "@/lib/useScheduleDB";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import BackupRows from "@/components/settings/BackupRows";
import RemindersRows from "@/components/settings/RemindersRows";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";
import { normalizeDayStartTime } from "@/lib/timeline/displayWindow";

// ── Primitives ────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.10em] text-neutral-400 dark:text-neutral-500">
      {children}
    </p>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 ${className}`}>
      {children}
    </div>
  );
}

function Row({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 ${className}`}>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.05]" />;
}

const DAY_START_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const value = minutesToInputTime(index * 30);
  return { value, label: formatDisplayTime(value) };
});

// ── Theme ─────────────────────────────────────────────────────────────────────

type ThemeMode = "light" | "dark";
function applyTheme(t: ThemeMode) {
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.style.colorScheme = t;
  localStorage.setItem("theme", t);
}
function readTheme(): ThemeMode {
  const s = localStorage.getItem("theme");
  return s === "light" || s === "dark" ? s : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// ── AI modes ──────────────────────────────────────────────────────────────────

const MODES: Array<{ id: AIPerformanceMode; label: string; desc: string; badge?: string }> = [
  { id: "lightweight", label: "Lightweight", desc: "Fastest. Minimal battery and memory use." },
  { id: "balanced",    label: "Balanced",    desc: "Best for most people. Great quality, low impact.", badge: "Default" },
  { id: "advanced",    label: "Advanced",    desc: "Higher quality reasoning. Needs more RAM." },
];

function AISection() {
  const runtime = useAIRuntime();
  const { tier, isDesktop } = getDeviceCapabilities();
  const model = resolveTransformersModel(runtime.mode, tier, isDesktop);
  const sizeMB = MODEL_SIZES[model] ?? 300;
  const sizeLabel = sizeMB < 1000 ? `${sizeMB} MB` : `${(sizeMB / 1000).toFixed(1)} GB`;

  return (
    <div className="space-y-3">
      {/* Status hero */}
      <Card>
        <Row>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#AD46FF]">
            <IconBrain size={18} strokeWidth={1.8} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-neutral-900 dark:text-white">
              {runtime.status === "ready" ? "Embedded Intelligence" : "Local Intelligence"}
            </p>
            <p className={`text-[12px] font-medium ${
              runtime.status === "ready" ? "text-emerald-600 dark:text-emerald-400" :
              runtime.status === "error"  ? "text-rose-500 dark:text-rose-400" :
              runtime.status === "disabled" ? "text-neutral-400 dark:text-neutral-500" :
              "text-amber-500 dark:text-amber-400"
            }`}>
              {runtime.status === "ready"       ? "Ready · Works Offline" :
               runtime.status === "downloading" ? `Downloading… ${runtime.downloadProgress}%` :
               runtime.status === "enabling"    ? "Starting up…" :
               runtime.status === "error"       ? "Setup failed" :
               "Not enabled"}
            </p>
          </div>
          {runtime.enabled ? (
            <button
              type="button"
              onClick={runtime.disable}
              className="rounded-xl border border-neutral-200 px-3 py-1.5 text-[12px] font-semibold text-neutral-500 hover:border-neutral-300 dark:border-white/[0.08] dark:text-neutral-400"
            >
              Disable
            </button>
          ) : (
            <m.button
              type="button"
              onClick={runtime.enable}
              whileTap={{ scale: 0.95 }}
              className="rounded-xl bg-neutral-900 px-3 py-1.5 text-[12px] font-bold text-white dark:bg-white dark:text-neutral-900"
            >
              Enable
            </m.button>
          )}
        </Row>

        {/* Download progress */}
        {(runtime.status === "downloading" || runtime.status === "enabling") && (
          <div className="mx-4 mb-3.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
              <m.div
                className="h-full rounded-full bg-emerald-500"
                animate={{ width: `${Math.max(runtime.downloadProgress, 3)}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-neutral-400 dark:text-neutral-500">
              Downloading offline AI model ({sizeLabel})… You can keep using the app.
            </p>
          </div>
        )}

        {runtime.status === "ready" && (
          <>
            <Divider />
            <Row>
              <IconShield size={14} strokeWidth={2} className="shrink-0 text-emerald-500" />
              <p className="text-[12px] text-neutral-500 dark:text-neutral-400">
                Runs entirely on this device. No data sent to any AI cloud service.
              </p>
            </Row>
          </>
        )}
      </Card>

      {/* Performance mode */}
      <Card>
        <div className="px-4 py-3.5">
          <p className="mb-3 text-[12px] font-bold text-neutral-900 dark:text-white">Performance mode</p>
          <div className="space-y-2">
            {MODES.map((m) => {
              const active = runtime.mode === m.id;
              const mModel = resolveTransformersModel(m.id, tier, isDesktop);
              const mSize = MODEL_SIZES[mModel] ?? 300;
              const mSizeLabel = mSize < 1000 ? `~${mSize} MB` : `~${(mSize / 1000).toFixed(1)} GB`;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => runtime.setMode(m.id)}
                  className={`flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3 text-left transition-all ${
                    active
                      ? "border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white"
                      : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 dark:border-white/[0.07] dark:bg-white/[0.02] dark:hover:border-white/[0.12]"
                  }`}
                >
                  {/* Radio */}
                  <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    active ? "border-white bg-white dark:border-neutral-900 dark:bg-neutral-900" : "border-neutral-300 dark:border-neutral-600"
                  }`}>
                    {active && <div className="h-1.5 w-1.5 rounded-full bg-neutral-900 dark:bg-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-[13px] font-bold ${active ? "text-white dark:text-neutral-900" : "text-neutral-900 dark:text-white"}`}>
                        {m.label}
                      </p>
                      {m.badge && (
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                          active ? "bg-white/20 text-white dark:bg-neutral-900/20 dark:text-neutral-900"
                                 : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                        }`}>
                          {m.badge}
                        </span>
                      )}
                      <span className={`ml-auto text-[10px] font-medium ${active ? "text-white/60 dark:text-neutral-900/60" : "text-neutral-400"}`}>
                        {mSizeLabel}
                      </span>
                    </div>
                    <p className={`mt-0.5 text-[11px] leading-snug ${active ? "text-white/70 dark:text-neutral-900/70" : "text-neutral-500 dark:text-neutral-400"}`}>
                      {m.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-[10px] text-neutral-400 dark:text-neutral-500">
            Changing modes downloads a new model once, then caches it permanently.
          </p>
        </div>
      </Card>

      {/* Ollama (desktop strategic AI) */}
      <OllamaCard />
    </div>
  );
}

// ── Ollama card ───────────────────────────────────────────────────────────────

const OLLAMA_STEPS = [
  { cmd: "brew install ollama",             desc: "Install Ollama" },
  { cmd: 'ollama serve --cors "<origin>"',  desc: "Start with browser CORS" },
  { cmd: `ollama pull ${DEFAULT_OLLAMA_MODEL}`, desc: "Download the default model" },
];

function OllamaCard() {
  const [url, setUrl]       = useState(() => typeof window !== "undefined" ? (localStorage.getItem(OLLAMA_URL_KEY) ?? DEFAULT_OLLAMA_URL) : DEFAULT_OLLAMA_URL);
  const [model, setModel]   = useState(() => typeof window !== "undefined" ? (localStorage.getItem(OLLAMA_MODEL_KEY) ?? DEFAULT_OLLAMA_MODEL) : DEFAULT_OLLAMA_MODEL);
  const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [testing, setTesting]   = useState(false);
  const [connOk, setConnOk]     = useState<null | boolean>(null);
  const [errMsg, setErrMsg]     = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied]     = useState<string | null>(null);
  const [origin, setOrigin]     = useState("https://your-app.web.app");

  useEffect(() => { if (typeof window !== "undefined") setOrigin(window.location.origin); }, []);

  function saveUrl(v: string)   { const val = v.trim() || DEFAULT_OLLAMA_URL;   localStorage.setItem(OLLAMA_URL_KEY, val);   setUrl(val); }
  function saveModel(v: string) { const val = v.trim() || DEFAULT_OLLAMA_MODEL; localStorage.setItem(OLLAMA_MODEL_KEY, val); setModel(val); }

  const serveCmd = `ollama serve --cors "${origin}"`;

  async function cp(text: string, key: string) {
    try { await navigator.clipboard.writeText(text); } catch { return; }
    setCopied(key); setTimeout(() => setCopied((c) => c === key ? null : c), 1800);
  }

  async function fetchModels(u = url) {
    setFetching(true); setErrMsg(null);
    try {
      const ms = await checkOllamaConnection(u);
      setModels(ms);
      if (ms.length > 0 && !ms.includes(model)) saveModel(ms[0]);
    } catch (e) { setModels([]); setErrMsg(e instanceof Error ? e.message : String(e)); }
    finally { setFetching(false); }
  }

  async function test() {
    setTesting(true); setErrMsg(null);
    try {
      const s = await checkModelStatus(url, model);
      setConnOk(s === "connected");
      if (s !== "connected") setErrMsg(s === "no-model" ? "Ollama reachable but model not installed." : "Ollama not reachable.");
    } catch (e) { setConnOk(false); setErrMsg(e instanceof Error ? e.message : String(e)); }
    finally { setTesting(false); }
  }

  useEffect(() => { void fetchModels(); }, []); // eslint-disable-line

  const dot = connOk === true ? "bg-emerald-500" : connOk === false ? "bg-rose-500" : models.length > 0 ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600";

  return (
    <Card>
      <Row>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
          <IconServer size={16} strokeWidth={1.8} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-neutral-900 dark:text-white">Strategic AI</p>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500">Ollama · Desktop · Deep planning</p>
        </div>
        <span className={`h-2 w-2 rounded-full ${dot}`} />
      </Row>

      <Divider />

      <div className="space-y-3 px-4 py-3.5">
        {/* URL */}
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Server URL</p>
          <input type="text" value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={(e) => { saveUrl(e.target.value); void fetchModels(e.target.value.trim() || DEFAULT_OLLAMA_URL); }}
            placeholder={DEFAULT_OLLAMA_URL}
            className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
          />
        </div>

        {/* Model */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Model</p>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => void fetchModels()} disabled={fetching}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-[10px] font-semibold text-neutral-500 hover:bg-white disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                <IconRefresh size={10} strokeWidth={2} className={fetching ? "animate-spin" : ""} />
              </button>
              <button type="button" onClick={test} disabled={testing}
                className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[10px] font-semibold text-neutral-500 hover:bg-white disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                {testing ? "…" : "Test"}
              </button>
            </div>
          </div>
          {models.length > 0 ? (
            <div className="relative">
              <select value={model} onChange={(e) => saveModel(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-8 text-[13px] text-neutral-900 outline-none dark:border-white/[0.08] dark:bg-neutral-900 dark:text-white">
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <IconChevronDown size={12} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            </div>
          ) : (
            <input type="text" value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={(e) => saveModel(e.target.value)}
              placeholder={DEFAULT_OLLAMA_MODEL}
              className="h-10 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[13px] text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white"
            />
          )}
          <AnimatePresence>
            {errMsg && (
              <m.p key="err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="mt-1.5 flex items-start gap-1.5 overflow-hidden text-[11px] text-rose-500 dark:text-rose-400">
                <IconWifiOff size={11} strokeWidth={2} className="mt-px shrink-0" />{errMsg}
              </m.p>
            )}
            {!errMsg && connOk && (
              <m.p key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                <IconCheck size={11} strokeWidth={2.5} />Connected · {models.length} model{models.length !== 1 ? "s" : ""} available
              </m.p>
            )}
          </AnimatePresence>
        </div>

        {/* CORS command */}
        <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
          <div className="mb-1 flex justify-between">
            <p className="text-[10px] font-semibold text-neutral-500">Recommended start command</p>
            <button type="button" onClick={() => void cp(serveCmd, "serve")} className="flex items-center gap-1 text-[10px] font-semibold text-neutral-400 hover:text-neutral-700">
              <IconCopy size={10} strokeWidth={2} />{copied === "serve" ? "Copied!" : "Copy"}
            </button>
          </div>
          <code className="block overflow-x-auto whitespace-nowrap text-[11px] font-mono text-neutral-700 dark:text-neutral-300">{serveCmd}</code>
        </div>
      </div>

      <Divider />
      <button type="button" onClick={() => setShowSetup((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <IconTerminal2 size={13} strokeWidth={2} className="text-neutral-400" />
        <span className="flex-1 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">Setup instructions</span>
        <m.span animate={{ rotate: showSetup ? 90 : 0 }} transition={{ duration: 0.16 }}>
          <IconChevronRight size={13} strokeWidth={2} className="text-neutral-400" />
        </m.span>
      </button>
      <AnimatePresence initial={false}>
        {showSetup && (
          <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="space-y-2 border-t border-neutral-100 px-4 pb-4 pt-3 dark:border-white/[0.06]">
              {OLLAMA_STEPS.map(({ cmd, desc }, i) => {
                const resolved = cmd.includes("<origin>") ? serveCmd : cmd;
                const key = `s${i}`;
                return (
                  <div key={key} className="rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                    <div className="mb-1.5 flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-bold text-neutral-900 dark:text-white">Step {i + 1}</p>
                        <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{desc}</p>
                      </div>
                      <button type="button" onClick={() => void cp(resolved, key)}
                        className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-500 dark:border-white/[0.08] dark:bg-white/[0.04]">
                        <IconCopy size={10} strokeWidth={2} />{copied === key ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <code className="block overflow-x-auto rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[10px] font-mono text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300">{resolved}</code>
                  </div>
                );
              })}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ── Sync row ──────────────────────────────────────────────────────────────────

function SyncRow({ schedule: _schedule }: { schedule: Schedule }) {
  // useSyncStatus flushes the engine's latest tracked snapshot via getLastSchedule,
  // which is kept fresh on every edit — so we no longer need the schedule prop here.
  const { tone, label, isBusy, lastResult, syncNow } = useSyncStatus();
  const color = tone === "warn" ? "text-amber-500" : tone === "error" ? "text-rose-500" : "text-emerald-500 dark:text-emerald-400";

  return (
    <Row>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04]">
        <IconCloud size={14} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Cloud sync</p>
        <p className={`text-[11px] font-medium ${color}`}>{lastResult || label}</p>
      </div>
      <m.button type="button" onClick={syncNow} disabled={isBusy} whileTap={{ scale: 0.93 }}
        className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-white disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300">
        <m.span animate={isBusy ? { rotate: 360 } : {}} transition={isBusy ? { repeat: Infinity, duration: 0.9, ease: "linear" } : {}}>
          <IconCloud size={11} strokeWidth={2} />
        </m.span>
        {isBusy ? "Syncing…" : "Sync now"}
      </m.button>
    </Row>
  );
}

function ErrorTelemetryRow() {
  const { isGuest } = useAuth();
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(isErrorTelemetryEnabled()); }, []);
  if (isGuest) return null;
  const toggle = () => {
    const next = !on;
    setOn(next);
    setErrorTelemetryEnabled(next);
    haptic("light");
  };
  return (
    <>
      <Divider />
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-300">
          <IconShield size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Share error reports</p>
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            Sends crash details to your own cloud space to help fix bugs · no schedule content
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Share error reports"
          onClick={toggle}
          className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 ${
            on ? "bg-[#00A63E]" : "bg-neutral-200 dark:bg-white/[0.12]"
          }`}
        >
          <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-[left] duration-200 ${on ? "left-[21px]" : "left-[3px]"}`} />
        </button>
      </div>
    </>
  );
}

function DiagnosticsCard() {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const refresh = useCallback(() => {
    void collectDiagnostics().then(setSnapshot);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function copyDiagnostics() {
    if (!snapshot) return;
    const text = formatDiagnostics(snapshot);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    } finally {
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  const latestError = snapshot?.errors.at(-1);
  const latestBoot = snapshot?.bootLog.at(-1);
  const platformMode = snapshot?.platform.iosSafeMode
    ? "iOS safe mode"
    : snapshot?.platform.iosAppShell
      ? "Phone shell"
      : "Standard mode";

  return (
    <Card>
      <Row className="items-start">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04]">
          <IconTerminal2 size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Diagnostics</p>
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            {snapshot
              ? `${platformMode} · Sync ${snapshot.sync.status} · ${snapshot.errors.length} errors`
              : "Collecting app diagnostics…"}
          </p>
          {latestBoot && (
            <p className="mt-2 truncate font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
              Last boot: {latestBoot.event}
            </p>
          )}
          {latestError && (
            <p className="mt-1 truncate font-mono text-[10px] text-rose-500 dark:text-rose-400">
              Last error: {latestError.source}: {latestError.message}
            </p>
          )}
        </div>
      </Row>
      <Divider />
      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        <button
          type="button"
          onClick={copyDiagnostics}
          disabled={!snapshot}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] font-semibold text-neutral-700 disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-200"
        >
          {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
        </button>
        <button
          type="button"
          onClick={refresh}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] font-semibold text-neutral-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-200"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => {
            clearBootLog();
            clearErrorLog();
            refresh();
          }}
          className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] font-semibold text-neutral-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300"
        >
          Clear logs
        </button>
      </div>
      <ErrorTelemetryRow />
    </Card>
  );
}

// ── Google logo ───────────────────────────────────────────────────────────────

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

interface SettingsViewProps {
  schedule: Schedule;
  onClearData: () => Promise<void>;
  onClearProgress?: () => Promise<void>;
  onRestoreData?: (raw: unknown) => boolean;
  onUpdatePreferences?: (patch: Partial<SchedulePreferences>) => void;
  onClose?: () => void;
}

export function SettingsView({
  schedule,
  onClearData,
  onClearProgress,
  onRestoreData,
  onUpdatePreferences,
  onClose,
}: SettingsViewProps) {
  const { user, isGuest, authLoading, login, logout } = useAuth();
  const [busy, setBusy]   = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = useState(false);
  const [clearPhase, setClearPhase] = useState<"idle" | "clearing">("idle");
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [progressPhase, setProgressPhase] = useState<"idle" | "confirm" | "clearing">("idle");
  const [refreshing, setRefreshing] = useState(false);
  const clearCopy = buildDeleteConfirmationCopy("everything", {
    title: "Delete everything?",
    description: "This permanently deletes all local and cloud data. Cannot be undone.",
    confirmLabel: "Delete everything",
  });

  useEffect(() => { setTheme(readTheme()); setThemeReady(true); }, []);

  function setAppTheme(t: ThemeMode) { setTheme(t); applyTheme(t); }

  async function handleLogin() {
    setBusy(true); try { await login(); } catch { } finally { setBusy(false); }
  }
  async function handleLogout() {
    setBusy(true); try { await logout(); } finally { setBusy(false); }
  }
  const handleClear = useCallback(async () => {
    setClearPhase("clearing");
    try { await onClearData(); await deleteCloudData(); } finally { setClearPhase("idle"); onClose?.(); }
  }, [onClearData, onClose]);
  const handleClearProgress = useCallback(async () => {
    if (!onClearProgress) return;
    setProgressPhase("clearing");
    try { await onClearProgress(); } finally { setProgressPhase("idle"); }
  }, [onClearProgress]);
  const handleHardRefresh = useCallback(async () => {
    haptic("light");
    setRefreshing(true);
    try {
      await hardRefreshApp();
      setRefreshing(false);
    } catch {
      setRefreshing(false);
    }
  }, []);
  const dayStartTime = schedule.preferences?.dayStartTime ?? "";
  const handleDayStartChange = useCallback((value: string) => {
    onUpdatePreferences?.({ dayStartTime: normalizeDayStartTime(value) });
  }, [onUpdatePreferences]);

  return (
    <div className="min-h-full bg-[#F5F5F5] dark:bg-[#111111]">
      <div
        className="mx-auto max-w-2xl px-4 pt-6 lg:px-8 lg:pt-8"
        style={{ paddingBottom: "max(48px, calc(env(safe-area-inset-bottom) + 32px))" }}
      >
        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-[26px] font-black tracking-[-0.5px] text-neutral-900 dark:text-white">
            Settings
          </h1>
          <p className="mt-0.5 text-[13px] text-neutral-400 dark:text-neutral-500">
            Account, AI, appearance, and data
          </p>
        </div>

        <div className="space-y-6">
          {/* ── Account ─────────────────────────────────────────────────────── */}
          {!authLoading && (
            <div>
              <SectionLabel>Account</SectionLabel>
              {isGuest ? (
                <Card>
                  <div className="px-4 py-4">
                    <p className="mb-0.5 text-[14px] font-bold text-neutral-900 dark:text-white">Sign in to sync</p>
                    <p className="mb-3.5 text-[12px] text-neutral-400 dark:text-neutral-500">
                      Back up your data and access it across all your devices.
                    </p>
                    <m.button type="button" onClick={handleLogin} disabled={busy} whileTap={{ scale: 0.97 }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[13px] font-semibold text-neutral-700 hover:bg-white disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white">
                      {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" /> : <GoogleLogo />}
                      {busy ? "Signing in…" : "Continue with Google"}
                    </m.button>
                  </div>
                </Card>
              ) : (
                <Card>
                  <Row>
                    {user?.photoURL ? (
                      <Image src={user.photoURL} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full border border-neutral-100 dark:border-white/10" />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-neutral-900 dark:text-white">{user?.displayName ?? "User"}</p>
                      <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">{user?.email}</p>
                    </div>
                    <m.button type="button" onClick={handleLogout} disabled={busy} whileTap={{ scale: 0.94 }}
                      className="rounded-xl border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-500 hover:border-neutral-300 dark:border-white/[0.08] dark:text-neutral-400 disabled:opacity-50">
                      {busy ? "…" : "Sign out"}
                    </m.button>
                  </Row>
                </Card>
              )}
            </div>
          )}

          {/* ── Intelligence (hidden while AI is disabled) ───────────────────── */}
          {AI_ENABLED && (
            <div>
              <SectionLabel>Intelligence</SectionLabel>
              <AISection />
            </div>
          )}

          {/* ── Appearance ──────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Appearance</SectionLabel>
            <Card>
              <Row>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 dark:border-white/[0.06] dark:bg-white/[0.04]">
                  {themeReady && (theme === "dark" ? <IconMoon size={14} strokeWidth={2} className="text-neutral-500" /> : <IconSun size={14} strokeWidth={2} className="text-neutral-500" />)}
                </div>
                <span className="flex-1 text-[13px] font-semibold text-neutral-800 dark:text-white">Appearance</span>
                {themeReady && (
                  <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
                    {(["light", "dark"] as ThemeMode[]).map((t) => (
                      <button key={t} type="button" onClick={() => setAppTheme(t)}
                        className={`flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                          theme === t
                            ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                            : "text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
                        }`}>
                        {t === "light" ? <IconSun size={11} strokeWidth={2} /> : <IconMoon size={11} strokeWidth={2} />}
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </Row>
            </Card>
          </div>

          <div>
            <SectionLabel>Reminders</SectionLabel>
            <Card>
              <RemindersRows />
            </Card>
          </div>

          <div>
            <SectionLabel>Timeline</SectionLabel>
            <Card>
              <Row className="items-start max-sm:flex-col sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Start of day</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
                    Auto follows the first timed task. A fixed time starts the timeline one hour earlier.
                  </p>
                </div>
                <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
                  <select
                    aria-label="Start of day"
                    value={dayStartTime}
                    onChange={(e) => handleDayStartChange(e.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-9 text-[12px] font-semibold text-neutral-700 outline-none transition-colors focus:border-neutral-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white sm:w-44 sm:flex-none"
                  >
                    <option value="">Auto from tasks</option>
                    {DAY_START_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label="Clear start of day"
                    title="Clear start of day"
                    onClick={() => handleDayStartChange("")}
                    disabled={!dayStartTime}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 disabled:cursor-default disabled:opacity-35 dark:border-white/[0.08] dark:text-neutral-400"
                  >
                    <IconX size={15} strokeWidth={2.2} />
                  </button>
                </div>
              </Row>
            </Card>
          </div>

          {/* ── App ─────────────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>App</SectionLabel>
            <Card>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300">
                  <IconRefresh size={14} strokeWidth={2} className={refreshing ? "animate-spin" : ""} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Check for updates</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
                    Clears the app cache; reopen to fetch the latest version · keeps your data
                  </p>
                </div>
                <button type="button" onClick={handleHardRefresh} disabled={refreshing}
                  className="shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-200">
                  {refreshing ? "Updating…" : "Update"}
                </button>
              </div>
              <Divider />
              <div className="px-4 py-2.5">
                <p className="text-[10px] text-neutral-300 dark:text-neutral-600">{versionLabel()}</p>
              </div>
            </Card>
          </div>

          <div>
            <SectionLabel>Debug</SectionLabel>
            <DiagnosticsCard />
          </div>

          {/* ── Data ────────────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Data</SectionLabel>
            <Card>
              {!isGuest && (
                <>
                  <SyncRow schedule={schedule} />
                  <Divider />
                </>
              )}
              <BackupRows schedule={schedule} onRestoreData={onRestoreData} />
              <Divider />
              {/* Clear progress — keeps plans/tasks/trackers, wipes completions & logs */}
              {onClearProgress && (
                <>
                  <div className="px-4 py-3.5">
                    <AnimatePresence mode="wait" initial={false}>
                      {progressPhase === "idle" && (
                        <m.div key="p-idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                            <IconRefresh size={14} strokeWidth={2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Clear progress</p>
                            <p className="text-[11px] text-neutral-400 dark:text-neutral-500">Resets completions & logged values · keeps your plans and tasks</p>
                          </div>
                          <button type="button" onClick={() => setProgressPhase("confirm")}
                            className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                            Reset
                          </button>
                        </m.div>
                      )}
                      {progressPhase === "confirm" && (
                        <m.div key="p-confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <p className="mb-3 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                            Clears all task completions, completion history, routine check-ins, logged metrics, and milestone progress. Your plans, tasks, trackers, milestones, and routines stay. Cannot be undone.
                          </p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => setProgressPhase("idle")}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-2 text-[12px] font-semibold text-neutral-600 hover:bg-neutral-50 dark:border-white/[0.08] dark:bg-white/[0.04]">
                              <IconX size={12} strokeWidth={2.5} />Cancel
                            </button>
                            <button type="button" onClick={handleClearProgress}
                              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2 text-[12px] font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                              <IconRefresh size={12} strokeWidth={2} />Clear progress
                            </button>
                          </div>
                        </m.div>
                      )}
                      {progressPhase === "clearing" && (
                        <m.div key="p-clearing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
                          <span className="text-[13px] font-medium text-neutral-500">Clearing progress…</span>
                        </m.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <Divider />
                </>
              )}

              {/* Clear data */}
              <div className="px-4 py-3.5">
                <AnimatePresence mode="wait" initial={false}>
                  {clearPhase === "idle" && (
                    <m.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-500 dark:border-rose-500/20 dark:bg-rose-500/10">
                        <IconTrash size={14} strokeWidth={2} />
                      </div>
                      <span className="flex-1 text-[13px] font-semibold text-neutral-800 dark:text-white">Clear all data</span>
                      <button type="button" onClick={() => { haptic("light"); setClearConfirmOpen(true); }}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
                        Clear
                      </button>
                    </m.div>
                  )}
                  {clearPhase === "clearing" && (
                    <m.div key="clearing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-3">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600" />
                      <span className="text-[13px] font-medium text-neutral-500">Clearing…</span>
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </Card>
          </div>

          <p className="text-center text-[10px] text-neutral-300 dark:text-neutral-700">PlanR · Personal Execution OS</p>
        </div>
      </div>

      <ConfirmSheet
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={() => {
          setClearConfirmOpen(false);
          void handleClear();
        }}
        title={clearCopy.title}
        description={clearCopy.description}
        confirmLabel={clearCopy.confirmLabel}
      />
    </div>
  );
}
