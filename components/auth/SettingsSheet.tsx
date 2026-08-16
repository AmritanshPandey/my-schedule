"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import {
  IconMoon,
  IconSun,
  IconCloud,
  IconTrash,
  IconCheck,
  IconX,
  IconAlertTriangle,
  IconSparkles,
  IconRefresh,
  IconChevronDown,
  IconClock,
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import BackupRows from "@/components/settings/BackupRows";
import RemindersRows from "@/components/settings/RemindersRows";
import { useAuth } from "@/contexts/AuthProvider";
import { useGoogleSignIn } from "@/components/auth/useGoogleSignIn";
import { AuthErrorNote } from "@/components/auth/AuthErrorNote";
import { getSyncStatus, getLastSyncedAt, getLastSchedule, onSyncStatusChange, flushNow, deleteCloudData, type SyncStatus } from "@/lib/cloudSync";
import { formatDisplayTime, minutesToInputTime } from "@/lib/timeUtils";
import { versionLabel, BUILD_ID } from "@/lib/buildInfo";
import type { Schedule, SchedulePreferences } from "@/lib/useScheduleDB";
import { AISettingsSheet } from "@/components/ai/AISettingsSheet";
import { AI_ENABLED } from "@/lib/featureFlags";
import { normalizeDayStartTime } from "@/lib/timeline/displayWindow";

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

const DAY_START_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const value = minutesToInputTime(index * 30);
  return { value, label: formatDisplayTime(value) };
});

const DAY_END_OPTIONS = Array.from({ length: 9 }, (_, i) => {
  // 24:00 (1440) .. 28:00 (1680) in 30-min steps -> 9 entries
  const minutes = 24 * 60 + i * 30;
  // label: show human time and mark next-day when >= 1440
  const baseLabel = formatDisplayTime(minutesToInputTime(minutes % 1440));
  const label = minutes >= 1440 ? `${baseLabel} (next day)` : baseLabel;
  return { value: String(minutes), label };
});

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

function StartOfDayRow({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (patch: Partial<SchedulePreferences>) => void;
}) {
  const dayStartTime = value ?? "";

  return (
    <div className="flex items-start gap-3 px-4 py-3.5 max-sm:flex-col sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Start of day</p>
        <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
          Auto follows the first timed task. A fixed time starts the timeline one hour earlier.
        </p>
      </div>
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
        <div className="relative">
          <select
            aria-label="Start of day"
            value={dayStartTime}
            onChange={(e) => onChange?.({ dayStartTime: normalizeDayStartTime(e.target.value) })}
            className="h-10 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-9 text-[12px] font-semibold text-neutral-700 outline-none transition-colors focus:border-neutral-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white sm:w-44 sm:flex-none appearance-none"
          >
            <option value="">Auto from tasks</option>
            {DAY_START_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <IconClock size={14} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        </div>
        <button
          type="button"
          aria-label="Clear start of day"
          title="Clear start of day"
          onClick={() => onChange?.({ dayStartTime: undefined })}
          disabled={!dayStartTime}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 disabled:cursor-default disabled:opacity-35 dark:border-white/[0.08] dark:text-neutral-400"
        >
          <IconX size={15} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function EndOfDayRow({
  value,
  auto,
  onChange,
}: {
  value?: number;
  auto?: boolean;
  onChange?: (patch: Partial<SchedulePreferences>) => void;
}) {
  const current = auto ? "auto" : value !== undefined ? String(value) : "";

  return (
    <div className="flex items-start gap-3 px-4 py-3.5 max-sm:flex-col sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">End of day</p>
        <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
          The timeline's end. Values after midnight appear as "(next day)".
        </p>
      </div>
      <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
        <div className="relative">
          <select
            aria-label="End of day"
            value={current}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "auto") {
                onChange?.({ dayEndAuto: true, dayEndMinutes: undefined });
              } else if (v === "") {
                onChange?.({ dayEndAuto: undefined, dayEndMinutes: undefined });
              } else {
                onChange?.({ dayEndAuto: undefined, dayEndMinutes: Number(v) });
              }
            }}
            className="h-10 min-w-0 flex-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 pr-9 text-[12px] font-semibold text-neutral-700 outline-none transition-colors focus:border-neutral-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white sm:w-44 sm:flex-none appearance-none"
          >
            <option value="">Default (28:00 / 4:00 AM)</option>
            <option value="auto">Auto from tasks (use last timed task)</option>
            {DAY_END_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <IconClock size={14} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        </div>
        <button
          type="button"
          aria-label="Clear end of day"
          title="Clear end of day"
          onClick={() => onChange?.({ dayEndMinutes: undefined, dayEndAuto: undefined })}
          disabled={current === ""}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:border-neutral-300 disabled:cursor-default disabled:opacity-35 dark:border-white/[0.08] dark:text-neutral-400"
        >
          <IconX size={15} strokeWidth={2.2} />
        </button>
      </div>
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

      <m.button
        type="button"
        onClick={handleSyncNow}
        disabled={isBusy}
        whileTap={!isBusy ? { scale: 0.93 } : undefined}
        className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-white disabled:opacity-40 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.08]"
      >
        <m.span
          animate={isBusy ? { rotate: 360 } : { rotate: 0 }}
          transition={isBusy ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0 }}
          className="inline-flex"
        >
          <IconCloud size={11} strokeWidth={2} />
        </m.span>
        {isBusy ? "Syncing…" : "Sync now"}
      </m.button>
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
          <m.div
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
          </m.div>
        )}

        {phase === "confirm" && (
          <m.div
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
                <IconX size={14} strokeWidth={2.5} />
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2 text-[12px] font-semibold text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
              >
                <IconTrash size={14} strokeWidth={2} />
                Delete everything
              </button>
            </div>
          </m.div>
        )}

        {phase === "clearing" && (
          <m.div
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
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Clear progress row (keeps plans/tasks, wipes completions & logs) ──────────

function ClearProgressRow({ onClearProgress }: { onClearProgress: () => Promise<void> }) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "clearing">("idle");

  const handleClear = useCallback(async () => {
    setPhase("clearing");
    try { await onClearProgress(); } finally { setPhase("idle"); }
  }, [onClearProgress]);

  return (
    <div className="px-4 py-3.5">
      <AnimatePresence mode="wait" initial={false}>
        {phase === "idle" && (
          <m.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
              <IconRefresh size={15} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Clear progress</p>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">Resets completions & logs · keeps plans and tasks</p>
            </div>
            <button type="button" onClick={() => setPhase("confirm")}
              className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
              Reset
            </button>
          </m.div>
        )}
        {phase === "confirm" && (
          <m.div key="confirm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <div className="mb-3 flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <IconAlertTriangle size={14} strokeWidth={2} />
              <p className="text-[12px] font-semibold">Clears all completions, history, check-ins, logged metrics & milestone progress. Plans, tasks and milestones stay.</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPhase("idle")}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-2 text-[12px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400">
                <IconX size={14} strokeWidth={2.5} />Cancel
              </button>
              <button type="button" onClick={handleClear}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 py-2 text-[12px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400">
                <IconRefresh size={14} strokeWidth={2} />Clear progress
              </button>
            </div>
          </m.div>
        )}
        {phase === "clearing" && (
          <m.div key="clearing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex items-center gap-3">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-200 border-t-neutral-600 dark:border-neutral-700 dark:border-t-neutral-300" />
            <span className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Clearing progress…</span>
          </m.div>
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

// ── Main sheet ────────────────────────────────────────────────────────────────

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  onClearData: () => Promise<void>;
  onClearProgress?: () => Promise<void>;
  onRestoreData?: (raw: unknown) => boolean;
  schedule: Schedule;
  onUpdatePreferences?: (patch: Partial<SchedulePreferences>) => void;
}

export function SettingsSheet({
  open,
  onClose,
  onClearData,
  onClearProgress,
  onRestoreData,
  schedule,
  onUpdatePreferences,
}: SettingsSheetProps) {
  const { user, isGuest, authLoading, logout } = useAuth();
  const { signingIn, error: signInError, isAuthAvailable, signIn } = useGoogleSignIn();
  const [busy, setBusy] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);

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
                  <m.button
                    type="button"
                    onClick={signIn}
                    disabled={signingIn || !isAuthAvailable}
                    aria-describedby={
                      !isAuthAvailable || signInError ? "settings-sheet-auth-note" : undefined
                    }
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[13px] font-semibold text-neutral-700 transition-colors hover:bg-white hover:border-neutral-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08] disabled:opacity-50"
                  >
                    {signingIn ? (
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
                    ) : (
                      <GoogleLogo />
                    )}
                    {signingIn ? "Signing in…" : "Continue with Google"}
                  </m.button>

                  <AuthErrorNote
                    id="settings-sheet-auth-note"
                    message={signInError}
                    unavailable={!isAuthAvailable}
                    className="text-[11px]"
                  />
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
                    <p className="truncate text-[12px] text-neutral-400 dark:text-neutral-500">
                      {user?.email}
                    </p>
                  </div>
                </div>

                <Divider />

                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400">
                    <IconCheck size={14} strokeWidth={2.5} />
                    <span className="text-[11px] font-semibold">Account connected</span>
                  </div>
                  <m.button
                    type="button"
                    onClick={handleLogout}
                    disabled={busy}
                    whileTap={{ scale: 0.94 }}
                    className="rounded-xl border border-neutral-200 px-3 py-1.5 text-[11px] font-semibold text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-800 dark:border-white/[0.08] dark:text-neutral-400 dark:hover:text-white disabled:opacity-50"
                  >
                    {busy ? "…" : "Sign out"}
                  </m.button>
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

        <SectionLabel>Reminders</SectionLabel>
        <SettingsCard>
          <RemindersRows />
        </SettingsCard>

        <SectionLabel>Timeline</SectionLabel>
        <SettingsCard>
          <StartOfDayRow
            value={schedule.preferences?.dayStartTime}
            onChange={onUpdatePreferences}
          />
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
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#AD46FF]">
                  <IconSparkles size={14} strokeWidth={2} className="text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">AI Configuration</p>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500">MLX · Local · Free</p>
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
          <BackupRows schedule={schedule} onRestoreData={onRestoreData} />
          <Divider />
          {onClearProgress && (
            <>
              <ClearProgressRow onClearProgress={onClearProgress} />
              <Divider />
            </>
          )}
          <ClearDataRow onClearData={onClearData} onDone={onClose} />
        </SettingsCard>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <p className="mt-2 text-center text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
          {versionLabel()}
        </p>
        <p className="mt-0.5 text-center text-[10px] text-neutral-300 dark:text-neutral-700">
          PlanR · Goal-oriented planning · <span className="font-mono">{BUILD_ID}</span>
        </p>
      </div>
    </BottomSheet>
  );
}
