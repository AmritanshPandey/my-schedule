"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun, IconUser } from "@tabler/icons-react";
import { useAuth } from "@/contexts/AuthProvider";
import { haptic } from "@/lib/haptics";

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

function initialsFrom(name?: string | null, email?: string | null): string {
  const src = (name ?? "").trim() || (email ?? "").trim();
  if (!src) return "";
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/**
 * Desktop floating top-bar pill — segmented theme toggle + avatar.
 * Mirrors the design handoff (rounded pill, sliding knob, gradient avatar).
 */
export default function DesktopTopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const initial = detectInitialTheme();
    setTheme(initial);
    applyTheme(initial);
  }, []);

  function setMode(next: ThemeMode) {
    if (next === theme) return;
    haptic("light");
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem("theme", next);
  }

  const initials = initialsFrom(user?.displayName, user?.email);

  return (
    <div className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white py-[7px] pl-2 pr-[7px] shadow-[0_1px_2px_rgba(10,10,10,0.04),0_8px_24px_rgba(10,10,10,0.05)] dark:border-white/[0.08] dark:bg-[#161618] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_10px_30px_rgba(0,0,0,0.45)]">
      {/* Segmented theme toggle */}
      <div className="relative flex items-center gap-0.5 rounded-full bg-neutral-100 p-1 dark:bg-white/[0.06]">
        <span
          aria-hidden
          className="absolute left-1 top-1 h-[34px] w-[34px] rounded-full border border-neutral-200 bg-white shadow-[0_1px_2px_rgba(10,10,10,0.06)] transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)] dark:border-white/[0.08] dark:bg-[#0a0a0a]"
          style={{ transform: theme === "dark" ? "translateX(36px)" : "translateX(0)" }}
        />
        <button
          type="button"
          onClick={() => setMode("light")}
          aria-label="Light mode"
          aria-pressed={theme === "light"}
          className={`relative z-10 grid h-[34px] w-[34px] place-items-center rounded-full transition-colors ${
            theme === "light" ? "text-neutral-900" : "text-neutral-400 dark:text-neutral-500"
          }`}
        >
          <IconSun size={17} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setMode("dark")}
          aria-label="Dark mode"
          aria-pressed={theme === "dark"}
          className={`relative z-10 grid h-[34px] w-[34px] place-items-center rounded-full transition-colors ${
            theme === "dark" ? "text-white" : "text-neutral-400 dark:text-neutral-500"
          }`}
        >
          <IconMoon size={17} strokeWidth={2} />
        </button>
      </div>

      {/* Avatar */}
      <button
        type="button"
        onClick={() => { haptic("light"); onOpenSettings(); }}
        aria-label="Account & settings"
        title="Account & settings"
        className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-[12px] font-bold text-white ring-[1.5px] ring-white dark:ring-[#161618]"
        style={{ boxShadow: "0 0 0 1px var(--color-neutral-200)", background: "linear-gradient(135deg, #00a63e 0%, #14b8a6 55%, #3b82f6 100%)" }}
      >
        {user?.photoURL ? (
          <img src={user.photoURL} alt="Avatar" className="h-full w-full object-cover" />
        ) : initials ? (
          <span>{initials}</span>
        ) : (
          <IconUser size={17} strokeWidth={1.9} className="text-white" />
        )}
      </button>
    </div>
  );
}
