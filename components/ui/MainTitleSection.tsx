"use client";

import { memo } from "react";
import { motion } from "framer-motion";
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
  /** Inline progress counter or "done" for completed state */
  progressMeta?: ProgressMeta;
  /** Animated progress bar. Pass pct = 0–100. Always visible when provided. */
  progressBar?: { pct: number };
  /** Right-aligned action area. Use ViewToggleButton, IconActionButton, or any ReactNode. */
  actions?: React.ReactNode;
  className?: string;
}

// ── Exported helper button types ──────────────────────────────────────────────

/** Toggle between two labelled views (e.g. Timeline / List). */
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
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 h-9 text-[12px] font-semibold text-neutral-700 transition-all hover:bg-neutral-50 active:scale-95 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
    >
      {other.label}
      {other.icon}
    </button>
  );
}

/** Animated edit / save icon button. Filled black in save mode. */
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
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
        saving
          ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
          : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
      }`}
    >
      <motion.span
        key={saving ? "save" : "edit"}
        initial={{ opacity: 0, scale: 0.75 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.75 }}
        transition={{ duration: 0.14 }}
      >
        {saving && saveIcon ? saveIcon : icon}
      </motion.span>
    </motion.button>
  );
}

/** Simple CTA button (e.g. "+ Add New Plan"). */
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
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 h-9 text-[12px] font-semibold text-neutral-700 transition-all hover:bg-neutral-50 active:scale-95 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
    >
      {icon}
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function MainTitleSectionInner({
  label,
  title,
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
    <div className={`flex items-end justify-between gap-3 ${className}`}>
      {/* Left: label + title + inline meta + progress bar */}
      <div className="min-w-0">
        {label && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
        )}

        <div className="flex items-baseline gap-2 mt-0.5">
          <h1 className="text-[20px] font-bold text-neutral-950 dark:text-white leading-tight">
            {title}
          </h1>

          {isDone && (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-green-500 dark:text-green-400 leading-none">
              <IconCheck size={13} strokeWidth={2.5} />
              Done
            </span>
          )}

          {counter && (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums text-neutral-400 dark:text-neutral-500 leading-none">
              <IconClipboardList size={12} strokeWidth={1.8} />
              {counter.done}/{counter.total}
            </span>
          )}
        </div>

        {progressBar !== undefined && (
          <div className="mt-1.5 h-[8px] max-w-[200px] overflow-hidden rounded-full bg-neutral-200 dark:bg-white/10">
            <motion.div
              className="h-full rounded-full bg-green-500"
              initial={false}
              animate={{ width: `${progressBar.pct}%` }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        )}
      </div>

      {/* Right: action buttons */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

export const MainTitleSection = memo(MainTitleSectionInner);
