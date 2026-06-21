"use client";

import { m } from "framer-motion";
import { IconPlus } from "@tabler/icons-react";
import type { ComponentType } from "react";
import { haptic } from "@/lib/haptics";

type IconCmp = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

interface EmptyAction {
  label: string;
  onClick: () => void;
  /** Defaults to a plus icon. Pass `null` to render no leading icon. */
  icon?: IconCmp | null;
}

interface EmptyStateProps {
  icon: IconCmp;
  title: string;
  description: string;
  /** Primary call-to-action — rendered as a solid pill button. */
  action?: EmptyAction;
  /** Optional secondary link below the primary action. */
  secondaryAction?: { label: string; onClick: () => void };
  /**
   * Vertically center within the available height (use inside flex-filled
   * detail panes). Defaults to top-anchored with `pt-16`, matching the page
   * empty states across the app.
   */
  center?: boolean;
  className?: string;
}

/**
 * The shared empty-state layout — a soft icon tile, title, supporting copy and
 * an optional CTA. Modeled on the Routine page so every page reads the same.
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  center = false,
  className = "",
}: EmptyStateProps) {
  const ActionIcon = action ? (action.icon === undefined ? IconPlus : action.icon) : null;
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center gap-4 text-center ${center ? "h-full justify-center" : "pt-16"} ${className}`}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#00A63E]/[0.08] dark:bg-[#2FD46E]/[0.10]">
        <Icon size={36} strokeWidth={1.4} className="text-[#00A63E] dark:text-[#2FD46E]" />
      </div>
      <div>
        <p className="text-[16px] font-semibold text-neutral-700 dark:text-neutral-200">{title}</p>
        <p className="mt-1.5 max-w-[260px] text-[14px] leading-relaxed text-neutral-400">{description}</p>
      </div>
      {action && (
        <m.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={() => { haptic("medium"); action.onClick(); }}
          className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#00A63E] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#008236] dark:bg-[#2FD46E] dark:text-neutral-950 dark:hover:bg-[#2FD46E]/90"
        >
          {ActionIcon && <ActionIcon size={16} strokeWidth={2.5} />}
          {action.label}
        </m.button>
      )}
      {secondaryAction && (
        <button
          type="button"
          onClick={() => { haptic("light"); secondaryAction.onClick(); }}
          className="text-[13px] font-semibold text-neutral-400 underline underline-offset-2 transition-colors hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {secondaryAction.label}
        </button>
      )}
    </m.div>
  );
}
