"use client";

import { motion } from "framer-motion";
import { IconChevronLeft } from "@tabler/icons-react";

export interface DetailHeaderAction {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  active?: boolean; // solid/filled state (e.g. a delete-confirm tap)
}

interface DetailHeaderProps {
  title: string;
  onBack: () => void;
  actions?: DetailHeaderAction[];
  rightSlot?: React.ReactNode; // e.g. a save-state badge, shown left of the actions
  className?: string;
}

/**
 * Standard glassy header bar for internal/sub pages (Notes, Plan detail, …).
 * A compact 56px bar: chevron back · title · round icon actions. Rendered as a
 * shrink-0 flex row so callers place it at the top of a full-height column.
 */
export default function DetailHeader({ title, onBack, actions, rightSlot, className = "" }: DetailHeaderProps) {
  return (
    <header
      className={`flex h-14 shrink-0 items-center gap-1 border-b border-black/[0.07] bg-white/85 px-2 backdrop-blur-xl dark:border-white/[0.08] dark:bg-neutral-950/85 ${className}`}
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.86 }}
        onClick={onBack}
        aria-label="Back"
        className="flex h-9 w-9 shrink-0 items-center justify-center text-neutral-500 dark:text-white/60"
      >
        <IconChevronLeft size={26} strokeWidth={1.5} />
      </motion.button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-bold text-neutral-950 dark:text-white/80">{title}</p>
      </div>

      {rightSlot}

      {actions && actions.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 pr-1">
          {actions.map((action, i) => {
            const Icon = action.icon;
            const tone = action.active
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : action.destructive
                ? "bg-neutral-100 text-neutral-500 hover:bg-rose-500/10 hover:text-rose-500 focus-visible:bg-rose-500/10 focus-visible:text-rose-500 dark:bg-white/[0.07] dark:text-neutral-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 dark:focus-visible:bg-rose-500/10 dark:focus-visible:text-rose-400"
                : "bg-neutral-100 text-neutral-700 dark:bg-white/[0.07] dark:text-white/70";
            return (
              <motion.button
                key={i}
                type="button"
                whileTap={{ scale: 0.86 }}
                onClick={action.onClick}
                aria-label={action.label}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${tone}`}
              >
                <Icon size={20} strokeWidth={2} />
              </motion.button>
            );
          })}
        </div>
      )}
    </header>
  );
}
