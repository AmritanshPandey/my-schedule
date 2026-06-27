"use client";

import { m } from "framer-motion";
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
 * Standard compact header bar for internal/sub pages (Notes, Plan detail, ...).
 * Rendered as a shrink-0 flex row so callers place it at the top of a full-height
 * column.
 */
export default function DetailHeader({ title, onBack, actions, rightSlot, className = "" }: DetailHeaderProps) {
  return (
    <header
      className={`flex h-12 shrink-0 items-center gap-1 border-b border-neutral-200 bg-white px-2 dark:border-white/[0.08] dark:bg-neutral-950 ${className}`}
    >
      <m.button
        type="button"
        whileTap={{ scale: 0.86 }}
        onClick={onBack}
        aria-label="Back"
        className="tap-target flex h-9 w-9 shrink-0 items-center justify-center text-neutral-500 dark:text-white/70"
      >
        <IconChevronLeft size={26} strokeWidth={1.5} />
      </m.button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[16px] font-bold text-neutral-950 dark:text-white/80">{title}</h1>
      </div>

      {rightSlot}

      {actions && actions.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5 pr-1">
          {actions.map((action, i) => {
            const Icon = action.icon;
            const tone = action.active
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
              : action.destructive
                ? "border-neutral-200 text-neutral-500 hover:bg-rose-500/10 hover:text-rose-500 focus-visible:bg-rose-500/10 focus-visible:text-rose-500 dark:border-white/[0.10] dark:text-neutral-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 dark:focus-visible:bg-rose-500/10 dark:focus-visible:text-rose-400"
                : "border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-white/[0.10] dark:text-white/70 dark:hover:bg-white/[0.06]";
            return (
              <m.button
                key={i}
                type="button"
                whileTap={{ scale: 0.86 }}
                onClick={action.onClick}
                aria-label={action.label}
                className={`tap-target flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${tone}`}
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
