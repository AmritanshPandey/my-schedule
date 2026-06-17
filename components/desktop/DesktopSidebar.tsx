"use client";

import { useEffect, useState } from "react";
import {
  IconCalendarEvent,
  IconClipboardData,
  IconFileImport,
  IconLayoutDashboard,
  IconLayoutSidebar,
  IconMoon,
  IconPencil,
  IconPlus,
  IconRepeat,
  IconSettings,
  IconSun,
} from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";
import { checkModelStatus } from "@/lib/ai";
import { useAIRuntime } from "@/lib/ai/useAIRuntime";
import { AI_ENABLED } from "@/lib/featureFlags";

interface DesktopSidebarProps {
  activeTab: number;
  collapsed: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  onTabChange: (tab: number) => void;
  onToggleCollapse: () => void;
  onCreateTask: () => void;
  onCreatePlan: () => void;
  onCreateRitual: () => void;
  onBulkImport?: () => void;
  onOpenSettings: () => void;
  onOpenSettingsTab?: () => void;
  onOpenNotes?: () => void;
}

const NAV_ITEMS = [
  { tab: 4, label: "Overview", Icon: IconLayoutDashboard },
  { tab: 0, label: "Today",    Icon: IconCalendarEvent },
  { tab: 1, label: "Plans",    Icon: IconClipboardData },
  { tab: 2, label: "Routine",  Icon: IconRepeat },
] as const;

type ConnectionStatus = "checking" | "connected" | "no-model" | "offline";
type ThemeMode = "light" | "dark";

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function detectInitialTheme(): ThemeMode {
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function StatusDot({ status }: { status: ConnectionStatus }) {
  if (status === "checking") {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-neutral-400" />
      </span>
    );
  }
  if (status === "connected") {
    return (
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" style={{ animationDuration: "2.5s" }} />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
    );
  }
  if (status === "no-model") {
    return <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 dark:bg-amber-500" />;
  }
  return <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-300 dark:bg-neutral-600" />;
}

export default function DesktopSidebar({
  activeTab,
  collapsed,
  ollamaUrl,
  ollamaModel,
  onTabChange,
  onToggleCollapse,
  onCreateTask,
  onCreatePlan,
  onCreateRitual,
  onBulkImport,
  onOpenSettings,
  onOpenSettingsTab,
  onOpenNotes,
}: DesktopSidebarProps) {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [checkTick, setCheckTick] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [themeReady, setThemeReady] = useState(false);
  const runtime = useAIRuntime();

  useEffect(() => {
    const initial = detectInitialTheme();
    setTheme(initial);
    applyTheme(initial);
    setThemeReady(true);
  }, []);

  // Check connection on mount, when url/model changes, on manual refresh, and every 15s
  useEffect(() => {
    let cancelled = false;

    async function check() {
      setStatus("checking");
      const result = await checkModelStatus(ollamaUrl, ollamaModel);
      if (!cancelled) setStatus(result);
    }

    void check();
    const interval = setInterval(() => { void check(); }, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [ollamaUrl, ollamaModel, checkTick]);

  function handleCreate() {
    haptic("medium");
    if (activeTab === 0) onCreateTask();
    else if (activeTab === 1) onCreatePlan();
    else if (activeTab === 2) onCreateRitual();
    // tab 3 (Review) has no create action
  }

  function setMode(next: ThemeMode) {
    haptic("light");
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem("theme", next);
  }

  function toggleTheme() {
    setMode(theme === "dark" ? "light" : "dark");
  }

  // Short display name for the Ollama model — strip tag if generic
  const modelShort = ollamaModel.replace(/:latest$/, "");

  // When Ollama isn't connected, surface the on-device model that's actually
  // running instead of "Ollama offline". Capability tier stands in for the model
  // name (we never show raw model IDs to users).
  const capLabel = runtime.capabilityLevel === "standard" ? "Standard" : "Basic";
  // A cached model is effectively ready even while it loads from disk (instant),
  // so treat it as ready and never show a "preparing" state for it.
  const embeddedReady = runtime.enabled && (runtime.status === "ready" || runtime.modelCached);
  const embeddedLoading =
    runtime.enabled && !runtime.modelCached &&
    (runtime.status === "enabling" || runtime.status === "downloading");

  let displayStatus: ConnectionStatus;
  let statusLabel: string;

  if (status === "connected") {
    displayStatus = "connected";
    statusLabel = modelShort;
  } else if (status === "checking") {
    displayStatus = "checking";
    statusLabel = "Connecting…";
  } else if (embeddedReady) {
    displayStatus = "connected";
    statusLabel = `${capLabel} · On-device`;
  } else if (embeddedLoading) {
    displayStatus = "checking";
    statusLabel =
      runtime.status === "downloading"
        ? `Downloading AI… ${runtime.downloadProgress}%`
        : "Starting AI…";
  } else if (status === "no-model") {
    displayStatus = "no-model";
    statusLabel = "Model not found";
  } else {
    displayStatus = "offline";
    statusLabel = "AI offline";
  }

  const statusColor =
    displayStatus === "connected" ? "text-emerald-600 dark:text-emerald-400" :
    displayStatus === "no-model"  ? "text-amber-600 dark:text-amber-400" :
    "text-neutral-400 dark:text-neutral-500";

  return (
    <aside className={`hidden lg:flex h-full shrink-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(10,10,10,0.04),0_8px_24px_rgba(10,10,10,0.05)] transition-[width] duration-200 dark:border-white/[0.08] dark:bg-[#161618] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_10px_30px_rgba(0,0,0,0.45)] ${collapsed ? "w-[76px]" : "w-[236px]"}`}>

      {/* ── Header: brand + collapse toggle ──────────────────────────────────── */}
      <div className={`flex h-[68px] shrink-0 items-center border-b border-neutral-200/70 dark:border-white/[0.06] ${collapsed ? "justify-center px-0" : "justify-between px-[18px]"}`}>
        {!collapsed && (
          <>
            <img src="/logo.svg" alt="PlanR" className="h-[18px] w-auto dark:hidden" />
            <img src="/logo-dark.svg" alt="PlanR" className="hidden h-[18px] w-auto dark:block" />
          </>
        )}
        <button
          type="button"
          onClick={() => { haptic("light"); onToggleCollapse(); }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-[9px] text-neutral-600 transition-colors dark:text-neutral-300 ${
            collapsed
              ? "hover:bg-neutral-100 dark:hover:bg-white/[0.06]"
              : "bg-neutral-100 hover:bg-neutral-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
          }`}
        >
          <IconLayoutSidebar size={18} strokeWidth={2} />
        </button>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      {/* min-h-0 + overflow lets the nav scroll on very short screens so the
          create button and bottom actions below stay pinned and visible. */}
      <nav className={`min-h-0 flex-1 space-y-0.5 overflow-y-auto py-2 ${collapsed ? "px-2" : "px-2.5"}`}>
        {NAV_ITEMS.map(({ tab, label, Icon }) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => { haptic("light"); onTabChange(tab); }}
              title={collapsed ? label : undefined}
              className={`relative flex w-full items-center rounded-xl transition-all duration-150 ${
                collapsed ? "justify-center px-0 py-3" : "gap-3 px-3.5 py-2.5 text-left"
              } ${
                active
                  ? "bg-neutral-100 text-neutral-900 dark:bg-white/[0.09] dark:text-white dark:ring-1 dark:ring-white/[0.07]"
                  : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.05] dark:hover:text-neutral-300"
              }`}
            >
              <Icon size={17} strokeWidth={active ? 2.2 : 1.75} className="shrink-0" />
              {!collapsed && (
                <span className={`text-[13px] ${active ? "font-bold text-neutral-900 dark:text-white" : "font-medium"}`}>
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Create button (hidden where the current view owns creation) ───────── */}
      {activeTab !== 3 && activeTab !== 4 && activeTab !== 6 && (
        <div className={`shrink-0 pb-2 ${collapsed ? "px-2" : "px-2.5"}`}>
          <button
            type="button"
            onClick={handleCreate}
            title={collapsed ? (activeTab === 1 ? "New Plan" : activeTab === 2 ? "New Habit" : "New Task") : undefined}
            className={`flex w-full items-center rounded-xl bg-neutral-900 py-2.5 text-white transition-all hover:bg-neutral-800 active:scale-[0.98] dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-100 ${collapsed ? "justify-center px-0" : "gap-2 px-3.5"}`}
          >
            <IconPlus size={15} strokeWidth={2.5} />
            {!collapsed && (
              <span className="text-[13px] font-semibold">
                {activeTab === 1 ? "New Plan" : activeTab === 2 ? "New Habit" : "New Task"}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Bottom: AI status + settings + collapse ───────────────────────────── */}
      <div className={`shrink-0 border-t border-neutral-200/50 dark:border-white/[0.05] py-2 ${collapsed ? "px-2" : "px-2.5"}`}>

        {/* AI status row — click to re-check (hidden while AI is disabled) */}
        {AI_ENABLED && (
          <button
            type="button"
            onClick={() => { haptic("light"); setCheckTick((n) => n + 1); }}
            title={collapsed ? statusLabel : `AI: ${statusLabel} — click to refresh`}
            className={`flex w-full items-center rounded-xl py-2 transition-colors hover:bg-neutral-100 dark:hover:bg-white/[0.04] ${collapsed ? "justify-center px-0" : "gap-2.5 px-3.5"}`}
          >
            <StatusDot status={displayStatus} />
            {!collapsed && (
              <span className={`truncate text-[12px] font-semibold transition-colors ${statusColor}`}>
                {statusLabel}
              </span>
            )}
          </button>
        )}

        {/* Bulk import */}
        {onBulkImport && (
          <button
            type="button"
            onClick={() => { haptic("light"); onBulkImport(); }}
            title={collapsed ? "Paste Schedule" : undefined}
            className={`flex w-full items-center rounded-xl py-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.04] dark:hover:text-neutral-300 ${collapsed ? "justify-center px-0" : "gap-3 px-3.5"}`}
          >
            <IconFileImport size={16} strokeWidth={1.8} className="shrink-0" />
            {!collapsed && <span className="text-[13px] font-medium">Paste Schedule</span>}
          </button>
        )}

        {/* Notes */}
        {onOpenNotes && (
          <button
            type="button"
            onClick={() => { haptic("light"); onOpenNotes(); }}
            title={collapsed ? "Notes" : undefined}
            className={`flex w-full items-center rounded-xl py-2 transition-colors hover:bg-neutral-100 dark:hover:bg-white/[0.04] ${collapsed ? "justify-center px-0" : "gap-3 px-3.5"} ${activeTab === 6 ? "text-neutral-900 dark:text-white" : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"}`}
          >
            <IconPencil size={16} strokeWidth={1.8} className="shrink-0" />
            {!collapsed && <span className="text-[13px] font-medium">Notes</span>}
          </button>
        )}

        {/* Settings */}
        <button
          type="button"
          onClick={() => { haptic("light"); if (onOpenSettingsTab) onOpenSettingsTab(); else onOpenSettings(); }}
          title={collapsed ? "Settings" : undefined}
          className={`flex w-full items-center rounded-xl py-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.04] dark:hover:text-neutral-300 ${collapsed ? "justify-center px-0" : "gap-3 px-3.5"}`}
        >
          <IconSettings size={16} strokeWidth={1.8} className="shrink-0" />
          {!collapsed && <span className="text-[13px] font-medium">Settings</span>}
        </button>

        {/* Theme */}
        {collapsed ? (
          <button
            type="button"
            onClick={toggleTheme}
            title={themeReady ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Toggle theme"}
            aria-label={themeReady ? `Switch to ${theme === "dark" ? "light" : "dark"} mode` : "Toggle theme"}
            className="mt-1 flex w-full items-center justify-center rounded-xl py-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.04] dark:hover:text-neutral-300"
          >
            {theme === "dark" ? <IconSun size={16} strokeWidth={1.8} /> : <IconMoon size={16} strokeWidth={1.8} />}
          </button>
        ) : (
          <div className="mt-2 rounded-xl bg-neutral-100 p-1 dark:bg-white/[0.06]">
            <div className="grid grid-cols-2 gap-1">
              {(["light", "dark"] as const).map((mode) => {
                const active = theme === mode;
                const Icon = mode === "light" ? IconSun : IconMoon;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setMode(mode)}
                    aria-pressed={active}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-semibold transition-all ${
                      active
                        ? "bg-white text-neutral-900 shadow-[0_1px_2px_rgba(10,10,10,0.06)] dark:bg-[#0a0a0a] dark:text-white"
                        : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                    }`}
                  >
                    <Icon size={14} strokeWidth={2} />
                    <span>{mode === "light" ? "Light" : "Dark"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
