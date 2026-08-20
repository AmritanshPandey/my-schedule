"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, m } from "framer-motion";
import {
  IconBrain,
  IconCheck,
  IconClock,
  IconCloud,
  IconCompass,
  IconCopy,
  IconMoon,
  IconRefresh,
  IconShield,
  IconSparkles,
  IconSun,
  IconTerminal2,
  IconTrash,
  IconX,
  IconChevronDown,
} from "@tabler/icons-react";
import { useAuth } from "@/contexts/AuthProvider";
import CategoryManager from "@/components/category/CategoryManager";
import { useGoogleSignIn } from "@/components/auth/useGoogleSignIn";
import { AuthErrorNote } from "@/components/auth/AuthErrorNote";
import { deleteCloudData } from "@/lib/cloudSync";
import { useSyncStatus } from "@/lib/useSyncStatus";
import { haptic } from "@/lib/haptics";
import { hardRefreshApp } from "@/lib/chunkRecovery";
import { versionLabel } from "@/lib/buildInfo";
import { collectDiagnostics, formatDiagnostics, type DiagnosticsSnapshot } from "@/lib/diagnostics";
import { clearErrorLog } from "@/lib/errorLog";
import { isErrorTelemetryEnabled, setErrorTelemetryEnabled } from "@/lib/errorTelemetry";
import { clearBootLog } from "@/lib/iosSafeMode";
import { AI_ENABLED } from "@/lib/featureFlags";
import { AISettingsSheet } from "@/components/ai/AISettingsSheet";
import { getActiveProviderType } from "@/lib/ai/providers/settings";
import { resetTour } from "@/lib/onboarding/useCoachTour";
import { TOUR_IDS } from "@/lib/onboarding/tours";
import { formatDisplayTime, minutesToInputTime } from "@/lib/timeUtils";
import type { Schedule, SchedulePreferences } from "@/lib/useScheduleDB";
import ConfirmSheet from "@/components/ui/ConfirmSheet";
import BackupRows from "@/components/settings/BackupRows";
import RemindersRows from "@/components/settings/RemindersRows";
import { CARD as CARD_SURFACE } from "@/components/ui/surfaces";
import { SETTINGS_CONTROL_CLASS, SETTINGS_ICON_BUTTON_CLASS } from "@/components/ui/Input";
import { buildDeleteConfirmationCopy } from "@/lib/deleteConfirm";
import { normalizeDayStartTime } from "@/lib/timeline/displayWindow";
import { localISODate } from "@/lib/dateUtils";

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
    <div className={`overflow-hidden ${CARD_SURFACE} ${className}`}>
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

const DAY_END_OPTIONS = Array.from({ length: 9 }, (_, i) => {
  const minutes = 24 * 60 + i * 30; // 1440..1680
  const baseLabel = formatDisplayTime(minutesToInputTime(minutes % 1440));
  const label = minutes >= 1440 ? `${baseLabel} (next day)` : baseLabel;
  return { value: String(minutes), label };
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

// ── AI section ────────────────────────────────────────────────────────────────
//
// A thin row that opens the shared AISettingsSheet — the same component the
// mobile "AI Configuration" row (components/auth/SettingsSheet.tsx) and the
// AI Assistant's gear icon open. Previously this rendered its own separate,
// Gemini-only-copy card that bypassed AISettingsSheet entirely; now there's
// one source of truth for AI settings (provider picker, Gemini status, MLX
// config) with two thin entry points instead of three divergent surfaces.

function AISection() {
  const { isGuest } = useAuth();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(() => getActiveProviderType());

  const statusLabel =
    provider === "mlx"
      ? "MLX (local) · No sign-in"
      : isGuest ? "Sign in to use it" : "Ready · Free, with a daily limit";

  return (
    <>
      <Card>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#AD46FF]">
            <IconBrain size={18} strokeWidth={1.8} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold text-neutral-900 dark:text-white">
              {provider === "mlx" ? "MLX AI" : "Gemini AI"}
            </p>
            <p className="text-[12px] font-medium text-neutral-400 dark:text-neutral-500">{statusLabel}</p>
          </div>
          <IconChevronDown size={14} strokeWidth={2} className="-rotate-90 shrink-0 text-neutral-400" />
        </button>
      </Card>

      <AISettingsSheet
        open={open}
        onClose={() => { setOpen(false); setProvider(getActiveProviderType()); }}
      />
    </>
  );
}

// ── Replay guided tours row ──────────────────────────────────────────────────
//
// Clears every per-page tour's "seen" flag so the short coach-mark intro
// shows again the next time each tab is visited — the tour engine itself
// only ever auto-starts once per device, so this is the one way back in
// (matches "make replayable" for guided tours).

function ReplayToursRow() {
  const [justReset, setJustReset] = useState(false);

  function handleReplay() {
    haptic("light");
    TOUR_IDS.forEach(resetTour);
    setJustReset(true);
    window.setTimeout(() => setJustReset(false), 2200);
  }

  return (
    <>
      <Divider />
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-neutral-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300">
          <IconCompass size={14} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Guided tours</p>
          <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
            {justReset ? "Reset — they'll show again as you visit each tab." : "Short intro to Today, Plans, and Routine"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReplay}
          disabled={justReset}
          className="shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-200"
        >
          {justReset ? "Done" : "Replay"}
        </button>
      </div>
    </>
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
  /** Needed by the category manager, which edits schedule.categories. */
  setSchedule: (updater: (prev: Schedule) => Schedule) => void;
  onClearData: () => Promise<void>;
  onClearProgress?: () => Promise<void>;
  onRestoreData?: (raw: unknown) => boolean;
  onUpdatePreferences?: (patch: Partial<SchedulePreferences>) => void;
  onClose?: () => void;
}

export function SettingsView({
  schedule,
  setSchedule,
  onClearData,
  onClearProgress,
  onRestoreData,
  onUpdatePreferences,
  onClose,
}: SettingsViewProps) {
  const { user, isGuest, authLoading, logout } = useAuth();
  const { signingIn, error: signInError, isAuthAvailable, signIn } = useGoogleSignIn();
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
  const trackingStart = schedule.preferences?.startDate ?? "";
  const handleTrackingStartChange = useCallback((value: string) => {
    onUpdatePreferences?.({ startDate: value || undefined });
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

        <div className="stagger-rise space-y-6">
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
                    <m.button type="button" onClick={signIn} disabled={signingIn || !isAuthAvailable} whileTap={{ scale: 0.97 }}
                      aria-describedby={!isAuthAvailable || signInError ? "settings-view-auth-note" : undefined}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[13px] font-semibold text-neutral-700 hover:bg-white disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white">
                      {signingIn ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" /> : <GoogleLogo />}
                      {signingIn ? "Signing in…" : "Continue with Google"}
                    </m.button>
                    <AuthErrorNote
                      id="settings-view-auth-note"
                      message={signInError}
                      unavailable={!isAuthAvailable}
                    />
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
                      <p className="truncate text-[12px] text-neutral-400 dark:text-neutral-500">{user?.email}</p>
                    </div>
                    <m.button type="button" onClick={handleLogout} disabled={busy} whileTap={{ scale: 0.94 }}
                      className="rounded-lg border border-neutral-200 px-3 py-2 text-[12px] font-semibold text-neutral-500 hover:border-neutral-300 dark:border-white/[0.08] dark:text-neutral-400 disabled:opacity-50">
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

          {/* ── Categories ──────────────────────────────────────────────────── */}
          <div>
            <SectionLabel>Categories</SectionLabel>
            <Card>
              <div className="px-4 py-3">
                <p className="mb-3 text-[12px] text-neutral-500 dark:text-neutral-400">
                  A task&apos;s category sets its icon and colour, and groups it in
                  &ldquo;Where the day goes&rdquo;.
                </p>
                <CategoryManager schedule={schedule} setSchedule={setSchedule} />
              </div>
            </Card>
          </div>

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
                    When your day begins on the timeline.
                  </p>
                </div>
                <div className="relative w-full sm:w-64 sm:shrink-0">
                  <select
                    aria-label="Start of day"
                    value={dayStartTime}
                    onChange={(e) => handleDayStartChange(e.target.value)}
                    className={`${SETTINGS_CONTROL_CLASS} w-full pr-9 appearance-none`}
                  >
                    <option value="">Auto (first task)</option>
                    {DAY_START_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <IconClock size={14} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                </div>
              </Row>

              <Divider />

              <Row className="items-start max-sm:flex-col sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">End of day</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
                    When the timeline ends. Times past midnight show as &quot;(next day)&quot;.
                  </p>
                </div>
                <div className="relative w-full sm:w-64 sm:shrink-0">
                  <select
                    aria-label="End of day"
                    value={
                      schedule.preferences?.dayEndAuto
                        ? "auto"
                        : typeof schedule.preferences?.dayEndMinutes === "number"
                        ? String(schedule.preferences?.dayEndMinutes)
                        : ""
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "auto") {
                        onUpdatePreferences?.({ dayEndAuto: true, dayEndMinutes: undefined });
                      } else if (v === "") {
                        onUpdatePreferences?.({ dayEndAuto: undefined, dayEndMinutes: undefined });
                      } else {
                        onUpdatePreferences?.({ dayEndAuto: undefined, dayEndMinutes: Number(v) });
                      }
                    }}
                    className={`${SETTINGS_CONTROL_CLASS} w-full pr-9 appearance-none`}
                  >
                    <option value="">Default (4:00 AM)</option>
                    <option value="auto">Follow last task</option>
                    {DAY_END_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <IconClock size={14} strokeWidth={2} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                </div>
              </Row>
            </Card>
          </div>

          <div>
            <SectionLabel>Tracking</SectionLabel>
            <Card>
              <Row className="items-start max-sm:flex-col sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-neutral-800 dark:text-white">Tracking starts</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-neutral-400 dark:text-neutral-500">
                    Streaks and trends ignore days before this. Off = count all history.
                  </p>
                </div>
                <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
                  <input
                    type="date"
                    aria-label="Tracking start date"
                    value={trackingStart}
                    max={localISODate(new Date())}
                    onChange={(e) => handleTrackingStartChange(e.target.value)}
                    className={`${SETTINGS_CONTROL_CLASS} flex-1 sm:w-44 sm:flex-none`}
                  />
                  <button
                    type="button"
                    aria-label="Use all history"
                    title="All history"
                    onClick={() => handleTrackingStartChange("")}
                    disabled={!trackingStart}
                    className={SETTINGS_ICON_BUTTON_CLASS}
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
                    Clears the app cache and reloads the latest version · keeps your data
                  </p>
                </div>
                <button type="button" onClick={handleHardRefresh} disabled={refreshing}
                  className="shrink-0 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-200">
                  {refreshing ? "Updating…" : "Update"}
                </button>
              </div>
              <ReplayToursRow />
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
