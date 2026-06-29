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
 * Standard header bar for internal/sub pages (Notes, subtasks, ...). Matches the
 * global IOSHeader's design (height, color, title weight, round ghost actions) so
 * every header in the app reads consistently. Rendered as a shrink-0 flex row so
 * callers place it at the top of a full-height column.
 */
export default function DetailHeader({ title, onBack, actions, rightSlot, className = "" }: DetailHeaderProps) {
  return (
    <header
      className={`flex h-12 shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 dark:border-white/[0.08] dark:bg-neutral-950 ${className}`}
    >
      <m.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={onBack}
        aria-label="Back"
        className="-ml-1.5 flex min-w-0 items-center gap-1 text-left"
      >
        <IconChevronLeft size={26} strokeWidth={2.4} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
        <h1 className="truncate text-[22px] font-black leading-none text-neutral-950 dark:text-white">{title}</h1>
      </m.button>

      <div className="flex shrink-0 items-center gap-1">
        {rightSlot}
        {actions?.map((action, i) => {
          const Icon = action.icon;
          const tone = action.active
            ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
            : action.destructive
              ? "text-neutral-500 hover:bg-rose-500/10 hover:text-rose-500 dark:text-neutral-400 dark:hover:text-rose-400"
              : "text-neutral-500 hover:bg-neutral-200/70 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-white/[0.07] dark:hover:text-white";
          return (
            <m.button
              key={i}
              type="button"
              whileTap={{ scale: 0.86 }}
              onClick={action.onClick}
              aria-label={action.label}
              className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${tone}`}
            >
              <Icon size={21} strokeWidth={2} />
            </m.button>
          );
        })}
      </div>
    </header>
  );
}
