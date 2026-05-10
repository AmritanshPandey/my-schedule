"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InternalSectionTitleProps {
  title: string;
  /** Right-side actions (icon buttons, text links, etc.) */
  actions?: React.ReactNode;
  className?: string;
}

// ── Icon action button (+ / ✏️ / ✓) ──────────────────────────────────────────

interface SectionIconButtonProps {
  icon: React.ReactNode;
  /** Replaces icon when saving=true (e.g. checkmark instead of pencil) */
  saveIcon?: React.ReactNode;
  saving?: boolean;
  onClick: () => void;
  label?: string;
}

export function SectionIconButton({
  icon,
  saveIcon,
  saving = false,
  onClick,
  label,
}: SectionIconButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      transition={{ type: "spring", stiffness: 450, damping: 22 }}
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border transition-colors ${
        saving
          ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
          : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-white/[0.06]"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={saving ? "save" : "normal"}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.13 }}
        >
          {saving && saveIcon ? saveIcon : icon}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

// ── Text link action (e.g. "+ Add Task") ─────────────────────────────────────

interface SectionTextActionProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}

export function SectionTextAction({ label, icon, onClick }: SectionTextActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
    >
      {icon}
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function InternalSectionTitleInner({
  title,
  actions,
  className = "",
}: InternalSectionTitleProps) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h2 className="text-[18px] font-bold text-neutral-950 dark:text-white leading-tight">
        {title}
      </h2>
      {actions && (
        <div className="flex items-center gap-1.5 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

export const InternalSectionTitle = memo(InternalSectionTitleInner);
