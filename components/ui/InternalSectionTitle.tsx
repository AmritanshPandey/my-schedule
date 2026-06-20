"use client";

import { memo } from "react";
import { AnimatePresence, m } from "framer-motion";
import { SectionTitle } from "@/components/ui/Typography";

interface InternalSectionTitleProps {
  title: string;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  className?: string;
}

interface SectionIconButtonProps {
  icon: React.ReactNode;
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
    <m.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      transition={{ type: "spring", stiffness: 450, damping: 22 }}
      aria-label={label}
      className={`inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] transition-colors ${
        saving
          ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
          : "bg-transparent text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
      }`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={saving ? "save" : "normal"}
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.13 }}
        >
          {saving && saveIcon ? saveIcon : icon}
        </m.span>
      </AnimatePresence>
    </m.button>
  );
}

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
      className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
    >
      {icon}
      {label}
    </button>
  );
}

function InternalSectionTitleInner({
  title,
  actions,
  tabs,
  className = "",
}: InternalSectionTitleProps) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{title}</SectionTitle>
        {actions && (
          <div className="flex shrink-0 items-center gap-1">
            {actions}
          </div>
        )}
      </div>
      {tabs && <div className="mt-3">{tabs}</div>}
    </div>
  );
}

export const InternalSectionTitle = memo(InternalSectionTitleInner);
