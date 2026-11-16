"use client";

/**
 * The phone shell's menu: everything that isn't one of the three daily
 * destinations (Overview, Today, Plans) — Routine, Tracking, Notes, the
 * lock-screen wallpaper, Settings and cloud sync — plus the light/dark switch.
 *
 * A glass panel that drops from the menu button, over a dimmed, blurred page,
 * the way iOS presents a pull-down menu. Tapping outside or pressing Escape
 * closes it; picking a row closes it and then acts.
 */
import { useEffect, useState } from "react";
import {
  IconChartLine,
  IconCloudCheck,
  IconCloudOff,
  IconCloudUpload,
  IconMoon,
  IconPencil,
  IconPhoto,
  IconRepeat,
  IconSettings,
  IconSun,
} from "@tabler/icons-react";
import { useAuth } from "@/contexts/AuthProvider";
import { useSyncStatus } from "@/lib/useSyncStatus";
import { haptic } from "@/lib/haptics";

type ThemeMode = "light" | "dark";

function readTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* storage blocked: fall back to the system preference */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(t: ThemeMode) {
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.style.colorScheme = t;
  try {
    localStorage.setItem("theme", t);
  } catch {
    /* the class still applies for this session */
  }
}

export type MenuDestination = "routine" | "tracking" | "notes" | "wallpaper" | "settings";

export default function IOSMenu({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (to: MenuDestination) => void;
}) {
  const { isGuest } = useAuth();
  const { tone, label, isBusy, syncNow } = useSyncStatus();
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    if (open) setTheme(readTheme());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const go = (to: MenuDestination) => {
    haptic("light");
    onClose();
    onNavigate(to);
  };

  const pickTheme = (t: ThemeMode) => {
    haptic("light");
    setTheme(t);
    applyTheme(t);
  };

  // Cloud Sync: a guest has nothing to sync yet, so the row leads to Settings
  // to sign in; a signed-in user syncs on tap, and the row's color is the
  // state (green synced, amber pending, rose failing).
  const syncTone =
    isGuest ? "text-neutral-900 dark:text-white"
    : tone === "error" ? "text-rose-600 dark:text-rose-400"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : "text-[#008236] dark:text-[#2FD46E]";
  const SyncIcon = isGuest ? IconCloudUpload : tone === "error" || tone === "warn" ? IconCloudOff : IconCloudCheck;

  const rows: Array<{ key: MenuDestination; label: string; Icon: typeof IconRepeat }> = [
    { key: "routine", label: "Routine", Icon: IconRepeat },
    { key: "tracking", label: "Tracking", Icon: IconChartLine },
    { key: "notes", label: "Notes", Icon: IconPencil },
    { key: "wallpaper", label: "Wallpaper", Icon: IconPhoto },
    { key: "settings", label: "Settings", Icon: IconSettings },
  ];

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-200 motion-reduce:transition-none ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className="absolute inset-0 bg-black/25 backdrop-blur-[6px] dark:bg-black/45"
      />
      <div
        role="menu"
        aria-label="More"
        data-glass
        className={`liquid-glass absolute right-4 flex w-[min(76vw,300px)] origin-top-right flex-col rounded-[30px] px-3 pb-3 pt-3 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? "scale-100" : "scale-95"}`}
        style={{ top: "calc(env(safe-area-inset-top) + 10px)" }}
      >
        {rows.map(({ key, label: rowLabel, Icon }) => (
          <button
            key={key}
            type="button"
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={() => go(key)}
            className="flex min-h-[52px] items-center gap-4 rounded-2xl px-3 text-left text-[18px] font-medium text-neutral-900 active:bg-black/[0.06] dark:text-white dark:active:bg-white/[0.08]"
          >
            <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
            {rowLabel}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          tabIndex={open ? 0 : -1}
          disabled={isBusy}
          onClick={() => {
            if (isGuest) return go("settings");
            haptic("light");
            void syncNow();
          }}
          className={`flex min-h-[52px] items-center gap-4 rounded-2xl px-3 text-left active:bg-black/[0.06] dark:active:bg-white/[0.08] ${syncTone}`}
        >
          <SyncIcon size={24} strokeWidth={1.8} aria-hidden="true" className={isBusy ? "animate-pulse" : undefined} />
          <span className="min-w-0">
            <span className="block text-[18px] font-medium">Cloud Sync</span>
            <span className="block truncate text-[12px] font-medium opacity-75">{isGuest ? "Sign in to back up" : label}</span>
          </span>
        </button>

        <div role="radiogroup" aria-label="Theme" className="mt-6 grid grid-cols-2 rounded-full bg-black/[0.06] p-1 dark:bg-white/[0.08]">
          {(["light", "dark"] as const).map((t) => {
            const active = theme === t;
            const Icon = t === "light" ? IconSun : IconMoon;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={open ? 0 : -1}
                onClick={() => pickTheme(t)}
                className={`flex min-h-[44px] items-center justify-center gap-2 rounded-full text-[15px] font-semibold transition-colors ${
                  active ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-white" : "text-neutral-500 dark:text-neutral-400"
                }`}
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                {t === "light" ? "Light" : "Dark"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
