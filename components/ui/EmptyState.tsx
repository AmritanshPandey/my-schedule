"use client";

import { m } from "framer-motion";
import { IconPlus } from "@tabler/icons-react";
import type { ComponentType } from "react";
import { haptic } from "@/lib/haptics";
import Button from "@/components/ui/Button";

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
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10">
        <Icon size={30} strokeWidth={1.5} className="text-[#00A63E] dark:text-[#2FD46E]" />
      </div>
      <div>
        <p className="text-[16px] font-semibold text-neutral-700 dark:text-neutral-200">{title}</p>
        <p className="mt-1.5 max-w-[260px] text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">{description}</p>
      </div>
      {action && (
        <Button
          variant="primary"
          size="md"
          onClick={() => { haptic("medium"); action.onClick(); }}
          icon={ActionIcon && <ActionIcon size={16} strokeWidth={2.5} />}
          className="mt-2"
        >
          {action.label}
        </Button>
      )}
      {secondaryAction && (
        <button
          type="button"
          onClick={() => { haptic("light"); secondaryAction.onClick(); }}
          className="text-[13px] font-semibold text-neutral-500 underline underline-offset-2 transition-colors hover:text-neutral-600 dark:text-neutral-400 dark:hover:text-neutral-300"
        >
          {secondaryAction.label}
        </button>
      )}
    </m.div>
  );
}
