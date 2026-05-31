"use client";

import { motion } from "framer-motion";
import { IconChevronLeft, IconPencil, IconUser } from "@tabler/icons-react";
import { useAuth } from "@/contexts/AuthProvider";

interface ActionItem {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  onClick: () => void;
  destructive?: boolean;
  label?: string;
}

interface AppHeaderProps {
  back?: {
    label: string;
    onBack: () => void;
  };
  actions?: ActionItem[];
  onOpenSettings?: () => void;
  onNotes?: () => void;
}

export default function AppHeader({ back, actions, onOpenSettings, onNotes }: AppHeaderProps) {
  const { user } = useAuth();
  const isDetail = !!back;

  if (isDetail) {
    return (
      <header className="sticky top-0 z-40 flex flex-col border-b border-neutral-200/60 bg-white/80 backdrop-blur-md dark:border-white/[0.07] dark:bg-neutral-950/82">
        {/* Top accent line */}
        <div className="h-[1.5px] bg-gradient-to-r from-neutral-900/10 via-neutral-900/5 to-transparent dark:from-white/30 dark:via-white/10" />

        {/* Main row */}
        <div className="flex items-center gap-1 px-4 pt-4 pb-4">
          {/* Back button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.86 }}
            onClick={back.onBack}
            aria-label={`Back to ${back.label}`}
            className="shrink-0 flex h-9 w-9 items-center justify-center text-neutral-500 transition-colors hover:text-neutral-700 active:text-neutral-800 dark:text-white/60 dark:hover:text-white"
          >
            <IconChevronLeft size={24} strokeWidth={1.5} />
          </motion.button>

          {/* Back label */}
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-bold text-neutral-950 dark:text-white/80">
              {back.label}
            </p>
          </div>

          {/* Action buttons */}
          {actions && actions.length > 0 && (
            <div className="shrink-0 flex items-center gap-1.5">
              {actions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <motion.button
                    key={i}
                    type="button"
                    whileTap={{ scale: 0.86 }}
                    onClick={action.onClick}
                    aria-label={action.label}
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                      action.destructive
                        ? "bg-rose-50 text-rose-600 hover:bg-rose-100 active:bg-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
                        : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-white/[0.07] dark:text-white/70 dark:hover:bg-white/[0.14]"
                    }`}
                  >
                    <Icon size={20} strokeWidth={2} />
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom border */}
        <div className="h-px bg-neutral-200/70 dark:bg-white/[0.08]" />
      </header>
    );
  }

  // ── Root mode — glassmorphism header ─────────────────────────────────────────
  return (
    <header
      className="
        sticky top-0 z-40 flex items-center justify-between px-4 py-3
        border-b border-neutral-200/60 bg-white/80 backdrop-blur-md
        dark:border-white/[0.07] dark:bg-neutral-950/82
      "
    >
      {/* Logo */}
      <div className="flex items-center">
        <img src="/logo.svg" alt="PlanR" className="h-[22px] w-auto dark:hidden" />
        <img src="/logo-dark.svg" alt="PlanR" className="hidden h-[22px] w-auto dark:block" />
      </div>

      {/* Right side: Notes pill + avatar */}
      <div className="flex items-center gap-2.5">
        {/* Notes placeholder pill */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onNotes}
          aria-label="Notes"
          className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-[0_2px_8px_rgba(16,185,129,0.35)] transition-opacity hover:opacity-90 active:opacity-80"
        >
          <IconPencil size={13} strokeWidth={2.5} />
          Notes
        </motion.button>

        {/* User avatar */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.90 }}
          onClick={onOpenSettings}
          aria-label="Account"
          className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-neutral-200 bg-neutral-100 dark:border-white/[0.12] dark:bg-neutral-800"
        >
          {user?.photoURL ? (
            <img src={user.photoURL} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <IconUser size={18} strokeWidth={1.8} className="text-neutral-400 dark:text-neutral-500" />
            </div>
          )}
        </motion.button>
      </div>
    </header>
  );
}
