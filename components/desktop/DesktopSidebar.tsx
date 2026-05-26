"use client";

import { useEffect, useState } from "react";
import {
  IconCalendarEvent,
  IconChartBar,
  IconChevronLeft,
  IconChevronRight,
  IconClipboardData,
  IconPlus,
  IconRepeat,
  IconSettings,
} from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";
import { checkModelStatus } from "@/lib/ai";

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
  onOpenSettings: () => void;
}

const NAV_ITEMS = [
  { tab: 0, label: "Today",   Icon: IconCalendarEvent },
  { tab: 1, label: "Plans",   Icon: IconClipboardData },
  { tab: 2, label: "Routine", Icon: IconRepeat },
  { tab: 3, label: "Review",  Icon: IconChartBar },
] as const;

type ConnectionStatus = "checking" | "connected" | "no-model" | "offline";

/** Inline mark — the three descending bars from the logo SVG */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg width="16" height="21" viewBox="0 0 16 21" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="0" y="0"    width="16"  height="3.5" rx="1.75" />
      <rect x="0" y="6.75" width="11"  height="3.5" rx="1.75" />
      <rect x="0" y="13.5" width="6.5" height="3.5" rx="1.75" />
    </svg>
  );
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
  onOpenSettings,
}: DesktopSidebarProps) {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [checkTick, setCheckTick] = useState(0);

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

  // Short display name for the model — strip tag if generic
  const modelShort = ollamaModel.replace(/:latest$/, "");

  const statusLabel =
    status === "connected" ? modelShort :
    status === "checking"  ? "Connecting…" :
    status === "no-model"  ? "Model not found" :
    "Ollama offline";

  const statusColor =
    status === "connected" ? "text-emerald-600 dark:text-emerald-400" :
    status === "no-model"  ? "text-amber-600 dark:text-amber-400" :
    "text-neutral-400 dark:text-neutral-500";

  return (
    <aside className={`hidden lg:flex h-full shrink-0 flex-col bg-white transition-[width] duration-200 dark:bg-neutral-900 border-r border-neutral-100 dark:border-white/[0.05] ${collapsed ? "w-[56px]" : "w-[220px]"}`}>

      {/* ── Logo ─────────────────────────────────────────────────────────────── */}
      <div className={`flex h-[60px] shrink-0 items-center ${collapsed ? "justify-center px-0" : "px-5"}`}>
        {collapsed ? (
          <LogoMark className="fill-neutral-900 dark:fill-white" />
        ) : (
          <>
            <img src="/logo.svg" alt="PlanR" className="h-[18px] w-auto dark:hidden" />
            <img src="/logo-dark.svg" alt="PlanR" className="hidden h-[18px] w-auto dark:block" />
          </>
        )}
      </div>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className={`flex-1 space-y-0.5 py-2 ${collapsed ? "px-2" : "px-2"}`}>
        {NAV_ITEMS.map(({ tab, label, Icon }) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => { haptic("light"); onTabChange(tab); }}
              title={collapsed ? label : undefined}
              className={`relative flex w-full items-center rounded-lg transition-all ${
                collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2 text-left"
              } ${
                active
                  ? "bg-neutral-100 text-neutral-900 dark:bg-white/[0.08] dark:text-white"
                  : "text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.04] dark:hover:text-neutral-300"
              }`}
            >
              <Icon size={17} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
              {!collapsed && (
                <span className={`text-[13px] font-semibold ${active ? "text-neutral-900 dark:text-white" : ""}`}>
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Create button (hidden on Review tab) ─────────────────────────────── */}
      {activeTab !== 3 && (
        <div className={`pb-2 ${collapsed ? "px-2" : "px-2"}`}>
          <button
            type="button"
            onClick={handleCreate}
            title={collapsed ? (activeTab === 1 ? "New Plan" : activeTab === 2 ? "New Habit" : "New Task") : undefined}
            className={`flex w-full items-center rounded-lg bg-neutral-900 py-2 text-white transition-opacity hover:opacity-90 dark:bg-white dark:text-neutral-950 ${collapsed ? "justify-center px-0" : "gap-2 px-3"}`}
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
      <div className={`border-t border-neutral-100 dark:border-white/[0.05] py-2 ${collapsed ? "px-2" : "px-2"}`}>

        {/* AI status row — click to re-check */}
        <button
          type="button"
          onClick={() => { haptic("light"); setCheckTick((n) => n + 1); }}
          title={collapsed ? statusLabel : `AI: ${statusLabel} — click to refresh`}
          className={`flex w-full items-center rounded-lg py-2 transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04] ${collapsed ? "justify-center px-0" : "gap-2.5 px-3"}`}
        >
          <StatusDot status={status} />
          {!collapsed && (
            <span className={`truncate text-[12px] font-semibold transition-colors ${statusColor}`}>
              {statusLabel}
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={() => { haptic("light"); onOpenSettings(); }}
          title={collapsed ? "Settings" : undefined}
          className={`flex w-full items-center rounded-lg py-2 text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-white/[0.04] dark:hover:text-neutral-300 ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}
        >
          <IconSettings size={16} strokeWidth={1.8} className="shrink-0" />
          {!collapsed && <span className="text-[13px] font-semibold">Settings</span>}
        </button>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => { haptic("light"); onToggleCollapse(); }}
          title={collapsed ? "Expand" : "Collapse"}
          className={`mt-0.5 flex w-full items-center rounded-lg py-2 text-neutral-300 transition-colors hover:bg-neutral-50 hover:text-neutral-500 dark:text-neutral-700 dark:hover:bg-white/[0.04] dark:hover:text-neutral-400 ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}
        >
          {collapsed
            ? <IconChevronRight size={15} strokeWidth={2} />
            : <IconChevronLeft size={15} strokeWidth={2} />
          }
        </button>
      </div>
    </aside>
  );
}
