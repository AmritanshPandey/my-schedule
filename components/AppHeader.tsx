"use client";

import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import { IconChevronLeft, IconPencil, IconUser } from "@tabler/icons-react";
import { useAuth } from "@/contexts/AuthProvider";
import { useSyncStatus } from "@/lib/useSyncStatus";
import SyncDot from "@/components/sync/SyncDot";

interface ActionItem {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  label?: string;
}

interface AppHeaderProps {
  back?: { label: string; onBack: () => void };
  actions?: ActionItem[];
  onOpenSettings?: () => void;
  onNotes?: () => void;
}

// ── Logo mark ─────────────────────────────────────────────────────────────────

function LogoMark({ className }: { className?: string }) {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" fill="none" className={className}>
      <rect x="0" y="0"    width="16"  height="3.2" rx="1.6" fill="currentColor" />
      <rect x="0" y="6.0"  width="11"  height="3.2" rx="1.6" fill="currentColor" />
      <rect x="0" y="12.0" width="6.5" height="3.2" rx="1.6" fill="currentColor" />
    </svg>
  );
}

// ── Shared scroll + dark-mode state ──────────────────────────────────────────

function useHeaderState() {
  const [scrolled, setScrolled]   = useState(false);
  const [isDark,   setIsDark]     = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialise dark-mode from the document class (set by ThemeToggle)
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();

    // Watch for theme changes via a MutationObserver on <html>
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    function onScroll() {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setScrolled(window.scrollY > 8);
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { scrolled, isDark };
}

// ── Flat style helper ─────────────────────────────────────────────────────────

function headerStyle(_scrolled: boolean, isDark: boolean): React.CSSProperties {
  const border = isDark
    ? "rgba(255, 255, 255, 0.08)"
    : "rgba(0, 0, 0, 0.09)";

  return {
    backgroundColor: isDark ? "rgb(10 10 10)" : "rgb(245 245 245)",
    borderBottom: `0.5px solid ${border}`,
  };
}

// ── Root header ───────────────────────────────────────────────────────────────

function RootHeader({ onOpenSettings, onNotes }: Pick<AppHeaderProps, "onOpenSettings" | "onNotes">) {
  const { user } = useAuth();
  const { scrolled, isDark } = useHeaderState();
  const { tone, label } = useSyncStatus();

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 transition-all duration-300 lg:hidden"
      style={{
        // box-sizing is border-box (Tailwind preflight), so the safe-area inset
        // must be ADDED to the height — otherwise the notch eats into the 64px
        // bar and squashes the logo. Content area stays a clean 64px.
        height: "calc(64px + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
        ...headerStyle(scrolled, isDark),
      }}
    >
      {/* Left: logo mark + wordmark */}
      <div className="flex items-center gap-2.5">
        <LogoMark className="text-neutral-900 dark:text-white" />
        <span className="text-[20px] font-bold tracking-[-0.5px] text-neutral-900 dark:text-white leading-none">
          planr.
        </span>
      </div>

      {/* Right: Notes pill + avatar */}
      <div className="flex items-center gap-2.5">
        <m.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onNotes}
          aria-label="Notes"
          className="flex min-h-[44px] items-center gap-2 rounded-full bg-neutral-900 px-4 py-2.5 dark:bg-white"
        >
          <IconPencil size={15} strokeWidth={2.2} className="text-white dark:text-neutral-900" />
          <span className="text-[14px] font-semibold text-white dark:text-neutral-900 leading-none">
            Notes
          </span>
        </m.button>

        {/* Avatar opens Settings (full sync detail lives there); the corner dot
            gives at-a-glance sync state. Dot sits outside the overflow-hidden
            button so it isn't clipped. Signed-in only — guests don't sync. */}
        <div className="relative shrink-0">
          <m.button
            type="button"
            whileTap={{ scale: 0.90 }}
            onClick={onOpenSettings}
            aria-label="Account"
            className="h-11 w-11 overflow-hidden rounded-full border-[1.5px] border-neutral-200 bg-neutral-100 dark:border-white/[0.12] dark:bg-neutral-800"
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <IconUser size={17} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
              </div>
            )}
          </m.button>
          {user && (
            <span
              role="status"
              aria-label={`Cloud sync: ${label}`}
              className="pointer-events-none absolute -top-0.5 -right-0.5 rounded-full bg-neutral-50 p-[2px] dark:bg-neutral-950"
            >
              <SyncDot tone={tone} size="sm" />
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Detail header ─────────────────────────────────────────────────────────────

function DetailHeader({ back, actions }: Pick<AppHeaderProps, "back" | "actions">) {
  const { scrolled, isDark } = useHeaderState();

  return (
    <header
      className="fixed inset-x-0 top-0 z-40 flex items-center gap-1 px-2 transition-all duration-250 lg:hidden"
      style={{
        // Match the root header's 64px base so content (offset by pt-16 = 64px)
        // sits flush with no gap, and add the safe-area inset on top (border-box)
        // so the back/title row isn't clipped under the notch.
        height: "calc(64px + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
        ...headerStyle(scrolled, isDark),
        // Detail header always has some bg so back label is readable
        backgroundColor: isDark ? "rgb(10 10 10)" : "rgb(245 245 245)",
      }}
    >
      <m.button
        type="button"
        whileTap={{ scale: 0.86 }}
        onClick={back?.onBack}
        aria-label={`Back to ${back?.label}`}
        className="flex h-9 w-9 items-center justify-center text-neutral-500 dark:text-white/70"
      >
        <IconChevronLeft size={26} strokeWidth={1.5} />
      </m.button>

      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-bold text-neutral-950 dark:text-white/80">
          {back?.label}
        </p>
      </div>

      {actions && actions.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 pr-2">
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <m.button
                key={i}
                type="button"
                whileTap={{ scale: 0.86 }}
                onClick={action.onClick}
                aria-label={action.label}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                  action.destructive
                    ? "bg-neutral-100 text-neutral-500 hover:bg-rose-500/10 hover:text-rose-500 focus-visible:bg-rose-500/10 focus-visible:text-rose-500 dark:bg-white/[0.07] dark:text-neutral-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 dark:focus-visible:bg-rose-500/10 dark:focus-visible:text-rose-400"
                    : "bg-neutral-100 text-neutral-700 dark:bg-white/[0.07] dark:text-white/70"
                }`}
              >
                <Icon size={20} strokeWidth={2} />
              </m.button>
            );
          })}
        </div>
      )}
    </header>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────

export default function AppHeader({ back, actions, onOpenSettings, onNotes }: AppHeaderProps) {
  if (back) return <DetailHeader back={back} actions={actions} />;
  return <RootHeader onOpenSettings={onOpenSettings} onNotes={onNotes} />;
}
