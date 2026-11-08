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
  /** Optional second action, beside the primary. */
  secondaryAction?: { label: string; onClick: () => void; icon?: IconCmp };
  /**
   * Vertically center within the available height (use inside flex-filled
   * detail panes). Defaults to sitting at the top of the page.
   */
  center?: boolean;
  className?: string;
}

/**
 * The one empty state, on every tab: a dashed card, a neutral icon tile (green
 * stays for progress), title, one line of copy, and buttons with icons.
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
  const SecondaryIcon = secondaryAction?.icon;
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${center ? "flex h-full flex-col justify-center" : ""} ${className}`}
    >
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-neutral-200 bg-white px-5 py-8 text-center dark:border-white/[0.10] dark:bg-neutral-900">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
          <Icon size={20} strokeWidth={1.8} className="text-neutral-600 dark:text-neutral-300" />
        </div>
        <p className="text-[16px] font-bold text-neutral-950 dark:text-white">{title}</p>
        <p className="mt-1 max-w-[280px] text-[13px] font-medium leading-snug text-neutral-500 dark:text-neutral-400">{description}</p>
        {(action || secondaryAction) && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {action && (
              <Button
                variant="primary"
                size="md"
                onClick={() => { haptic("medium"); action.onClick(); }}
                icon={ActionIcon && <ActionIcon size={16} strokeWidth={2.5} />}
              >
                {action.label}
              </Button>
            )}
            {secondaryAction && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => { haptic("light"); secondaryAction.onClick(); }}
                icon={SecondaryIcon && <SecondaryIcon size={16} strokeWidth={2.2} />}
              >
                {secondaryAction.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </m.div>
  );
}
