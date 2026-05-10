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
} from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import { useAuth } from "@/contexts/AuthProvider";
import { getSyncStatus, getLastSyncedAt, getLastSchedule, onSyncStatusChange, flushNow, deleteCloudData, type SyncStatus } from "@/lib/cloudSync";

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

function SyncRow() {
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
    const schedule = getLastSchedule();
    if (!schedule || syncing || status === "syncing") return;
    setSyncing(true);
    try {
      await flushNow(schedule);
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
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white py-2 text-[12px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-400 dark:hover:bg-white/[0.08]"
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

// ── Main sheet ────────────────────────────────────────────────────────────────

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  onClearData: () => Promise<void>;
}

export function SettingsSheet({ open, onClose, onClearData }: SettingsSheetProps) {
  const { user, isGuest, authLoading, login, logout } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    setBusy(true);
    try { await login(); } catch { /* user dismissed */ } finally { setBusy(false); }
  }

  async function handleLogout() {
    setBusy(true);
    try { await logout(); } finally { setBusy(false); }
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
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

        {/* ── Data ─────────────────────────────────────────────────────────── */}
        <SectionLabel>Data</SectionLabel>
        <SettingsCard>
          {!isGuest && (
            <>
              <SyncRow />
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
