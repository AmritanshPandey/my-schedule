"use client";

import { motion } from "framer-motion";
import { IconArrowLeft, IconSettings2 } from "@tabler/icons-react";

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
}

export default function AppHeader({ back, actions, onOpenSettings }: AppHeaderProps) {
  const isDetail = !!back;

  if (isDetail) {
    return (
      <header className="sticky top-0 z-10 flex flex-col bg-neutral-950/90 backdrop-blur-md">
        {/* Top accent line */}
        <div className="h-[1.5px] bg-gradient-to-r from-neutral-500/40 via-neutral-500/15 to-transparent" />

        {/* Main row */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-4">
          {/* Back button */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.86 }}
            onClick={back.onBack}
            aria-label={`Back to ${back.label}`}
            className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-white/60 active:text-white transition-colors"
          >
            <IconArrowLeft size={17} strokeWidth={2.2} />
          </motion.button>

          {/* Back label */}
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-bold text-white/30 mb-0.5">
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
                    className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] transition-colors ${
                      action.destructive
                        ? "text-white/40 active:bg-rose-500/15 active:text-rose-400"
                        : "text-white/50 active:text-white"
                    }`}
                  >
                    <Icon size={16} strokeWidth={2.2} />
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom border */}
        <div className="h-px bg-white/[0.06]" />
      </header>
    );
  }

  // ── Root mode — glassmorphism header ─────────────────────────────────────────
  return (
    <header
      className="
        sticky top-0 z-10 flex items-center justify-between px-4 py-3.5
        border-b border-neutral-200/60 bg-white/80 backdrop-blur-md
        shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_20px_rgba(0,0,0,0.04)]
        dark:border-white/[0.07] dark:bg-neutral-950/82
        dark:shadow-[0_1px_0_rgba(255,255,255,0.03),0_4px_20px_rgba(0,0,0,0.28)]
      "
    >
      {/* Logo */}
      <div className="flex items-center">
        <img src="/logo.svg" alt="PlanR" className="h-6 w-auto dark:hidden" />
        <img src="/logo-dark.svg" alt="PlanR" className="hidden h-6 w-auto dark:block" />
      </div>

    
    </header>
  );
}
