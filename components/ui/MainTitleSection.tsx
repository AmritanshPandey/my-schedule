"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconClipboardList } from "@tabler/icons-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProgressMeta =
  | { done: number; total: number }
  | "done";

interface MainTitleSectionProps {
  /** Small uppercase eyebrow label, e.g. "MY SCHEDULE" */
  label?: string;
  /** Primary section heading */
  title: string;
  /** Use 20px title instead of 24px (for secondary surfaces) */
  smallTitle?: boolean;
  /** Inline progress counter or "done" for completed state */
  progressMeta?: ProgressMeta;
  /** Animated progress bar. Pass pct = 0–100. */
  progressBar?: { pct: number };
  /** Right-aligned action area */
  actions?: React.ReactNode;
  className?: string;
}

// ── Exported action atoms ─────────────────────────────────────────────────────

/** Toggle between two labelled views (e.g. Timeline / List). Shows the view you'll switch TO. */
interface ViewToggleButtonProps {
  options: [
    { label: string; icon: React.ReactNode; value: string },
    { label: string; icon: React.ReactNode; value: string },
  ];
  value: string;
  onChange: (v: string) => void;
}

export function ViewToggleButton({ options, value, onChange }: ViewToggleButtonProps) {
  const other = options.find((o) => o.value !== value) ?? options[1];
  return (
    <button
      type="button"
      onClick={() => onChange(other.value)}
      className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-neutral-200 bg-white px-3.5 min-h-[44px] py-[9px] text-[13px] font-semibold tracking-[-0.15px] text-neutral-700 transition-colors hover:bg-neutral-100 active:scale-[0.97] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
    >
      <span>{other.label}</span>
      {other.icon}
    </button>
  );
}

/** Animated edit / save square icon button (40×40). Filled black in save mode. */
interface IconActionButtonProps {
  icon: React.ReactNode;
  saveIcon?: React.ReactNode;
  saving?: boolean;
  onClick: () => void;
  show?: boolean;
}

export function IconActionButton({
  icon,
  saveIcon,
  saving = false,
  onClick,
  show = true,
}: IconActionButtonProps) {
  if (!show) return null;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] border-[1.5px] transition-colors ${
        saving
          ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
          : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-100 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={saving ? "save" : "edit"}
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.75 }}
          transition={{ duration: 0.14 }}
        >
          {saving && saveIcon ? saveIcon : icon}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

/** CTA pill button with leading icon, e.g. "+ Add New Plan". */
interface CtaActionButtonProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export function CtaActionButton({ label, icon, onClick }: CtaActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-neutral-200 bg-white px-4 min-h-[44px] py-[10px] text-[13px] font-bold tracking-[-0.15px] text-neutral-700 transition-colors hover:bg-neutral-100 active:scale-[0.97] dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.07]"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function MainTitleSectionInner({
  label,
  title,
  smallTitle = false,
  progressMeta,
  progressBar,
  actions,
  className = "",
}: MainTitleSectionProps) {
  const isDone = progressMeta === "done";
  const hasMeta = progressMeta !== undefined;
  const counter = !isDone && hasMeta
    ? (progressMeta as { done: number; total: number })
    : null;

  return (
    <div className={className}>
      {/* Title row + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {label && (
            <p className="mb-2 text-[10.5px] font-bold uppercase leading-none tracking-[1.2px] text-neutral-400 dark:text-neutral-500">
              {label}
            </p>
          )}
          <div className="flex items-baseline gap-[9px]">
            <h1
              className={`leading-tight text-neutral-950 dark:text-white ${
                smallTitle
                  ? "text-[20px] font-extrabold tracking-[-0.5px]"
                  : "text-[24px] font-extrabold tracking-[-0.7px]"
              }`}
            >
              {title}
            </h1>

            {isDone && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold leading-none tracking-[-0.1px] text-green-500 dark:text-green-400">
                <IconCheck size={13} strokeWidth={2.5} />
                Done
              </span>
            )}

            {counter && (
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-[13px] font-bold leading-none tracking-[-0.1px] text-neutral-400 dark:text-neutral-500">
                <IconClipboardList size={12} strokeWidth={1.8} />
                {counter.done}/{counter.total}
              </span>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Full-width progress bar */}
      {progressBar !== undefined && (
        <div className="mt-[10px] h-[4px] w-full overflow-hidden rounded-[2px] bg-neutral-100 dark:bg-white/[0.08]">
          <motion.div
            className="h-full rounded-[2px] bg-green-500"
            initial={false}
            animate={{ width: `${progressBar.pct}%` }}
            transition={{ duration: 0.45, ease: [0.34, 1.1, 0.64, 1] }}
          />
        </div>
      )}
    </div>
  );
}

export const MainTitleSection = memo(MainTitleSectionInner);
