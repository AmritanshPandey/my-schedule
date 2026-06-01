"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconMoon,
  IconSun,
  IconCloud,
  IconTrash,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconSparkles,
  IconWifi,
  IconWifiOff,
  IconRefresh,
  IconChevronDown,
  IconTerminal2,
  IconCopy,
  IconInfoCircle,
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { useAuth } from "@/contexts/AuthProvider";
import { getSyncStatus, getLastSyncedAt, getLastSchedule, onSyncStatusChange, flushNow, deleteCloudData, type SyncStatus } from "@/lib/cloudSync";
import type { Schedule } from "@/lib/useScheduleDB";
import { OLLAMA_URL_KEY, OLLAMA_MODEL_KEY, DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL, checkOllamaConnection, checkModelStatus } from "@/lib/ai";
import { AISettingsSheet } from "@/components/ai/AISettingsSheet";
import { AI_ENABLED } from "@/lib/featureFlags";

// ── Theme helpers ─────────────────────────────────────────────────────────────

type ThemeMode = "light" | "dark";

function applyTheme(t: ThemeMode) {
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.style.colorScheme = t;
  localStorage.setItem("theme", t);
}

function readTheme(): ThemeMode {
  const s = localStorage.getItem("theme");
  if (s === "light" || s === "dark") return s;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// ── Sync label helpers ────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  if (ts === 0) return "Never";
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 10) return "Just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function syncLabel(status: SyncStatus, lastSyncedAt: number): string {
  if (status === "syncing") return "Syncing…";
  if (status === "offline") return "Offline";
  if (status === "error") return "Sync failed";
  return lastSyncedAt === 0 ? "Not synced yet" : `Last synced ${relativeTime(lastSyncedAt)}`;
}

function syncColor(status: SyncStatus): string {
  if (status === "syncing") return "text-neutral-400 dark:text-neutral-500";
  if (status === "offline") return "text-amber-500 dark:text-amber-400";
  if (status === "error") return "text-rose-500 dark:text-rose-400";
  return "text-emerald-500 dark:text-emerald-400";
}

// ── Row primitives ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 dark:text-neutral-500">
      {children}
    </p>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="mx-4 border-t border-neutral-100 dark:border-white/[0.06]" />;
}

// ── Appearance toggle ─────────────────────────────────────────────────────────

function AppearanceRow() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTheme(readTheme());
    setReady(true);
  }, []);

  function set(t: ThemeMode) {
    setTheme(t);
    applyTheme(t);
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-400">
          {ready && (theme === "dark" ? <IconMoon size={15} strokeWidth={2} /> : <IconSun size={15} strokeWidth={2} />)}
        </div>
        <span className="text-[13px] font-semibold text-neutral-800 dark:text-white">
          Appearance
        </span>
      </div>

      {ready && (
        <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.04]">
          {(["light", "dark"] as ThemeMode[]).map((t) => {
            const active = theme === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => set(t)}
                className={`flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                  active
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
                }`}
              >
                {t === "light" ? <IconSun size={11} strokeWidth={2} /> : <IconMoon size={11} strokeWidth={2} />}
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Sync row with manual trigger ──────────────────────────────────────────────

function SyncRow({ schedule }: { schedule: Schedule }) {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus());
  const [lastSyncedAt, setLastSyncedAt] = useState(getLastSyncedAt());
  const [syncing, setSyncing] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    return onSyncStatusChange((s) => {
      setStatus(s);
      if (s === "idle") setLastSyncedAt(getLastSyncedAt());
    });
  }, []);

  // Refresh "X ago" label every 30 s while idle
  useEffect(() => {
    if (status !== "idle") return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [status]);

  async function handleSyncNow() {
    if (syncing || status === "syncing") return;
    // Prefer the live schedule from props; fall back to whatever queueSync last saw.
    const snap = schedule ?? getLastSchedule();
    if (!snap) return;
    setSyncing(true);
    try {
      await flushNow(snap);
      setLastSyncedAt(getLastSyncedAt());
    } finally {
      setSyncing(false);
    }
  }

  const isBusy = syncing || status === "syncing";

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-400">
        <IconCloud size={15} strokeWidth={2} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">
          Cloud sync
        </p>
        <p className={`text-[11px] font-medium ${syncColor(status)}`}>
          {syncLabel(status, lastSyncedAt)}
        </p>
      </div>

      <motion.button
        type="button"
        onClick={handleSyncNow}
        disabled={isBusy}
        whileTap={!isBusy ? { scale: 0.93 } : undefined}
        className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.08]"
      >
        <motion.span
          animate={isBusy ? { rotate: 360 } : { rotate: 0 }}
          transition={isBusy ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0 }}
          className="inline-flex"
        >
          <IconCloud size={11} strokeWidth={2} />
        </motion.span>
        {isBusy ? "Syncing…" : "Sync now"}
      </motion.button>
    </div>
  );
}

// ── Clear data row ────────────────────────────────────────────────────────────

interface ClearDataRowProps {
  onClearData: () => Promise<void>;
  onDone: () => void;
}

function ClearDataRow({ onClearData, onDone }: ClearDataRowProps) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "clearing">("idle");

  const handleClear = useCallback(async () => {
    setPhase("clearing");
    try {
      await onClearData();
      await deleteCloudData();
    } finally {
      setPhase("idle");
      onDone();
    }
  }, [onClearData, onDone]);

  return (
    <div className="px-4 py-3.5">
      <AnimatePresence mode="wait" initial={false}>
        {phase === "idle" && (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50 text-rose-500 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400">
              <IconTrash size={15} strokeWidth={2} />
            </div>
            <span className="flex-1 text-[13px] font-semibold text-neutral-800 dark:text-white">
              Clear all data
            </span>
            <button
              type="button"
              onClick={() => setPhase("confirm")}
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
            >
              Clear
            </button>
          </motion.div>
        )}

        {phase === "confirm" && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="mb-3 flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <IconAlertTriangle size={14} strokeWidth={2} />
              <p className="text-[12px] font-semibold">
                This will permanently delete all local and cloud data.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPhase("idle")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-2 text-[12px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:bg-white/[0.08]"
              >
                <IconX size={12} strokeWidth={2.5} />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2 text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
              >
                <IconTrash size={12} strokeWidth={2} />
                Delete everything
              </button>
            </div>
          </motion.div>
        )}

        {phase === "clearing" && (
          <motion.div
            key="clearing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-3"
          >
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600 dark:border-neutral-700 dark:border-t-neutral-300" />
            <span className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
              Clearing…
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Profile section ───────────────────────────────────────────────────────────

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

// ── Ollama AI settings ────────────────────────────────────────────────────────

const SETUP_STEPS = [
  { cmd: "brew install ollama", desc: "Install Ollama" },
  { cmd: "ollama serve --cors \"<your-origin>\"", desc: "Start the server and allow browser access" },
  { cmd: `ollama pull ${DEFAULT_OLLAMA_MODEL}`, desc: "Download the default model, or use any model you prefer based on your configuration" },
  { cmd: "ollama list", desc: "Verify installed models" },
];

function OllamaRow() {
  const [url, setUrl] = useState(() => localStorage.getItem(OLLAMA_URL_KEY) ?? DEFAULT_OLLAMA_URL);
  const [model, setModel] = useState(() => localStorage.getItem(OLLAMA_MODEL_KEY) ?? DEFAULT_OLLAMA_MODEL);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [serverStatus, setServerStatus] = useState<"idle" | "checking" | "online" | "offline">("idle");
  const [modelStatus, setModelStatus] = useState<"unchecked" | "connected" | "no-model" | "offline">("unchecked");
  const [testing, setTesting] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [currentOrigin, setCurrentOrigin] = useState("https://your-firebase-app.web.app");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentOrigin(window.location.origin);
    }
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

  function getOllamaServeCommand() {
    return `ollama serve --cors "${currentOrigin}"`;
  }

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1800);
    } catch {
      // ignore clipboard failures
    }
  }

  async function fetchModels(targetUrl = url) {
    setFetching(true);
    setFetchError(false);
    setConnectionError(null);
    try {
      const models = await checkOllamaConnection(targetUrl);
      setAvailableModels(models);
      if (!manualMode && models.length > 0 && !models.includes(model)) {
        saveModel(models[0]);
      }
    } catch (err) {
      setFetchError(true);
      setAvailableModels([]);
      setConnectionError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetching(false);
    }
  }

  async function testConnection(targetUrl = url, targetModel = model) {
    setTesting(true);
    setServerStatus("checking");
    setModelStatus("unchecked");
    setFetchError(false);
    setConnectionError(null);
    try {
      const status = await checkModelStatus(targetUrl, targetModel);
      setServerStatus(status === "offline" ? "offline" : "online");
      setModelStatus(status);
      if (status === "offline") {
        setFetchError(true);
        setConnectionError("Ollama is not reachable from this browser. Check the server URL and CORS settings.");
      }
    } catch (err) {
      setServerStatus("offline");
      setModelStatus("offline");
      setFetchError(true);
      setConnectionError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => { void fetchModels(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="hidden sm:block px-4 py-3.5">
      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-100 bg-neutral-50 text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.04] dark:text-neutral-400">
          <IconSparkles size={15} strokeWidth={2} />
        </div>
        <span className="flex-1 text-[13px] font-semibold text-neutral-800 dark:text-white">
          AI Assistant (Ollama)
        </span>
        {fetching && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-500 dark:border-neutral-700 dark:border-t-neutral-400" />
        )}
        {!fetching && (
          <span className={`h-2 w-2 rounded-full ${availableModels.length > 0 ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-600"}`} />
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {/* Server URL */}
        <div>
          <p className="mb-1 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">Server URL</p>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={(e) => { saveUrl(e.target.value); void fetchModels(e.target.value.trim() || DEFAULT_OLLAMA_URL); }}
            placeholder={DEFAULT_OLLAMA_URL}
            className="h-9 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[12px] font-medium text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
          />
        </div>

        {/* Model — dropdown if models fetched, text input fallback */}
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-neutral-400 dark:text-neutral-500">Model</p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                {manualMode ? "Enter the model name manually." : "Choose a detected model or switch to manual entry."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void fetchModels()}
                disabled={fetching}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:border-white/20 dark:hover:bg-white/[0.08] disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void testConnection()}
                disabled={testing}
                className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:border-white/20 dark:hover:bg-white/[0.08] disabled:opacity-50"
              >
                {testing ? "Checking…" : "Test"}
              </button>
              {availableModels.length > 0 && (
                <button
                  type="button"
                  onClick={() => setManualMode((v) => !v)}
                  className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
                >
                  {manualMode ? "Use detected" : "Manual"}
                </button>
              )}
            </div>
          </div>

          {manualMode || availableModels.length === 0 ? (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={(e) => saveModel(e.target.value)}
              placeholder={DEFAULT_OLLAMA_MODEL}
              className="h-9 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-[12px] font-medium text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:focus:border-white/20 dark:focus:bg-white/[0.07]"
            />
          ) : (
            <div className="relative">
              <select
                value={model}
                onChange={(e) => saveModel(e.target.value)}
                className="h-9 w-full appearance-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-8 text-[12px] font-medium text-neutral-900 outline-none transition-colors focus:border-neutral-300 focus:bg-white dark:border-white/[0.08] dark:bg-neutral-900 dark:text-white dark:focus:border-white/20"
              >
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <IconChevronDown size={12} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            </div>
          )}

          {serverStatus !== "idle" && (
            <p className={`mt-1 flex items-center gap-1 text-[10px] ${serverStatus === "offline" ? "text-rose-500 dark:text-rose-400" : "text-emerald-500 dark:text-emerald-400"}`}>
              {serverStatus === "checking" ? (
                <IconRefresh size={10} strokeWidth={2} className="animate-spin" />
              ) : serverStatus === "offline" ? (
                <IconWifiOff size={10} strokeWidth={2} />
              ) : (
                <IconCheck size={10} strokeWidth={2} />
              )}
              {serverStatus === "checking"
                ? "Checking Ollama connection..."
                : modelStatus === "connected"
                ? "Ollama reachable and model connected."
                : modelStatus === "no-model"
                ? "Ollama reachable, but model is not installed."
                : "Ollama is offline; check the server URL and run ollama serve."}
            </p>
          )}

          {connectionError && (
            <p className="mt-1 text-[10px] text-rose-500 dark:text-rose-400">
              <span className="mr-1 inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
              {connectionError}
            </p>
          )}
          {fetchError && !connectionError && (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-rose-500 dark:text-rose-400">
              <IconWifiOff size={10} strokeWidth={2} />
              Can&apos;t reach Ollama — is it running? You can still save a model name manually.
            </p>
          )}
          {!fetchError && availableModels.length === 0 && serverStatus === "idle" && (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-yellow-500 dark:text-yellow-400">
              <IconInfoCircle size={10} strokeWidth={2} />
              Server is reachable, but no models were returned. Use manual model entry if needed.
            </p>
          )}
          {availableModels.length > 0 && (
            <p className="mt-1 text-[10px] text-emerald-500 dark:text-emerald-400">
              {availableModels.length} model{availableModels.length !== 1 ? "s" : ""} available
            </p>
          )}

          <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-[11px] text-neutral-700 dark:border-white/[0.08] dark:bg-neutral-950 dark:text-neutral-300">
            <p className="font-semibold text-neutral-900 dark:text-white">Your deployed origin</p>
            <p className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
              Use this origin for Ollama CORS so the Firebase-hosted app can reach the local server.
            </p>
            <p className="mt-2 font-mono break-all text-[10px] text-neutral-800 dark:text-neutral-200">{currentOrigin}</p>
            <p className="mt-3 text-[10px] text-neutral-500 dark:text-neutral-400">Recommended Ollama command:</p>
            <code className="mt-1 block w-full overflow-x-auto rounded-xl bg-neutral-100 px-3 py-2 font-mono text-[10px] text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300">
              {getOllamaServeCommand()}
            </code>
          </div>
        </div>

        {/* Setup instructions */}
        <div className="rounded-xl border border-neutral-200 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
          >
            <IconTerminal2 size={12} strokeWidth={2} className="shrink-0 text-neutral-400" />
            <span className="flex-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
              Setup instructions
            </span>
            <motion.span animate={{ rotate: showSetup ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <IconChevronDown size={11} strokeWidth={2} className="text-neutral-400" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {showSetup && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="border-t border-neutral-100 px-3 pb-3 pt-2.5 dark:border-white/[0.06]">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
                        Run these commands in Terminal
                      </p>
                      <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                        Local Ollama must allow requests from this app origin.
                      </p>
                      <p className="mt-1 text-[10px] text-neutral-600 dark:text-neutral-300">
                        Origin: <span className="font-mono">{currentOrigin}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(
                        [
                          "brew install ollama",
                          getOllamaServeCommand(),
                          `ollama pull ${DEFAULT_OLLAMA_MODEL}`,
                          "ollama list",
                        ].join("\n"),
                        "all",
                      )}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[10px] font-semibold uppercase text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
                    >
                      <IconCopy size={12} strokeWidth={2} />
                      {copiedKey === "all" ? "Copied!" : "Copy all"}
                    </button>
                  </div>
                  <div className="grid gap-3">
                    {SETUP_STEPS.map(({ cmd, desc }, index) => {
                      const resolvedCmd = cmd.includes("<your-origin>") ? getOllamaServeCommand() : cmd;
                      const stepNumber = index + 1;
                      const key = `step-${index}`;
                      return (
                        <div key={key} className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3 dark:border-white/[0.08] dark:bg-neutral-950">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold text-neutral-900 dark:text-white">Step {stepNumber}</p>
                              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{desc}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void copyToClipboard(resolvedCmd, key)}
                              className="inline-flex items-center gap-1 rounded-xl border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
                            >
                              <IconCopy size={12} strokeWidth={2} />
                              {copiedKey === key ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <code className="block w-full overflow-x-auto rounded-xl bg-neutral-100 px-3 py-2 font-mono text-[11px] text-neutral-700 dark:bg-white/[0.06] dark:text-neutral-300">
                            {resolvedCmd}
                          </code>
                        </div>
                      );
                    })}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                      <p className="font-semibold">Need remote hosting support?</p>
                      <p className="mt-1">If your app is deployed from Firebase or any HTTPS origin, use the exact origin shown in the second command so Ollama allows browser requests.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Main sheet ────────────────────────────────────────────────────────────────

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  onClearData: () => Promise<void>;
  schedule: Schedule;
}

export function SettingsSheet({ open, onClose, onClearData, schedule }: SettingsSheetProps) {
  const { user, isGuest, authLoading, login, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

  async function handleLogin() {
    setBusy(true);
    try { await login(); } catch { /* user dismissed */ } finally { setBusy(false); }
  }

  async function handleLogout() {
    setBusy(true);
    try { await logout(); } finally { setBusy(false); }
  }

  return (
    <BottomSheet open={open} onClose={onClose} desktopWidth="max-w-[560px]">
      <div
        className="px-5 pt-3"
        style={{ paddingBottom: "max(40px, calc(env(safe-area-inset-bottom) + 24px))" }}
      >
        {/* ── Account card ─────────────────────────────────────────────────── */}
        {!authLoading && (
          <div className="mb-5">
            {isGuest ? (
              /* Guest — sign in prompt */
              <SettingsCard>
                <div className="p-4">
                  <p className="mb-0.5 text-[13px] font-semibold text-neutral-900 dark:text-white">
                    Sign in to sync
                  </p>
                  <p className="mb-3.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
                    Back up your data and access it across all your devices.
                  </p>
                  <motion.button
                    type="button"
                    onClick={handleLogin}
                    disabled={busy}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-white hover:border-neutral-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08] disabled:opacity-50"
                  >
                    {busy ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
                    ) : (
                      <GoogleLogo />
                    )}
                    {busy ? "Signing in…" : "Continue with Google"}
                  </motion.button>
                </div>
              </SettingsCard>
            ) : (
              /* Signed in — profile */
              <SettingsCard>
                <div className="flex items-center gap-3 p-4">
                  {user?.photoURL ? (
                    <Image
                      src={user.photoURL}
                      alt={user.displayName ?? ""}
                      width={44}
                      height={44}
                      className="rounded-full shrink-0 border border-neutral-100 dark:border-white/10"
                    />
                  ) : (
                    <div className="h-11 w-11 shrink-0 rounded-full border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-neutral-800" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-neutral-900 dark:text-white">
                      {user?.displayName ?? "User"}
                    </p>
                    <p className="truncate text-[11px] text-neutral-400 dark:text-neutral-500">
                      {user?.email}
                    </p>
                  </div>
                </div>

                <Divider />

                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400">
                    <IconCheck size={12} strokeWidth={2.5} />
                    <span className="text-[11px] font-semibold">Account connected</span>
                  </div>
                  <motion.button
                    type="button"
                    onClick={handleLogout}
                    disabled={busy}
                    whileTap={{ scale: 0.94 }}
                    className="rounded-xl border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-800 dark:border-white/[0.08] dark:text-neutral-400 dark:hover:text-white disabled:opacity-50"
                  >
                    {busy ? "…" : "Sign out"}
                  </motion.button>
                </div>
              </SettingsCard>
            )}
          </div>
        )}

        {/* ── Preferences ──────────────────────────────────────────────────── */}
        <SectionLabel>Preferences</SectionLabel>
        <SettingsCard>
          <AppearanceRow />
        </SettingsCard>

        {/* ── AI (hidden while AI is disabled) ─────────────────────────────── */}
        {AI_ENABLED && (
          <>
            <SectionLabel>AI</SectionLabel>
            <SettingsCard>
              <button
                type="button"
                onClick={() => setAiSettingsOpen(true)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500">
                  <IconSparkles size={14} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">AI Configuration</p>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500">Ollama, embedded models, routing</p>
                </div>
                <IconChevronDown size={14} strokeWidth={2} className="-rotate-90 text-neutral-400" />
              </button>
            </SettingsCard>

            <AISettingsSheet open={aiSettingsOpen} onClose={() => setAiSettingsOpen(false)} />
          </>
        )}

        {/* ── Data ─────────────────────────────────────────────────────────── */}
        <SectionLabel>Data</SectionLabel>
        <SettingsCard>
          {!isGuest && (
            <>
              <SyncRow schedule={schedule} />
              <Divider />
            </>
          )}
          <ClearDataRow onClearData={onClearData} onDone={onClose} />
        </SettingsCard>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <p className="mt-2 text-center text-[10px] text-neutral-300 dark:text-neutral-700">
          PlanR · Goal-oriented planning
        </p>
      </div>
    </BottomSheet>
  );
}
