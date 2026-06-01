"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconClipboardList } from "@tabler/icons-react";
import { Eyebrow, PageTitle } from "@/components/ui/Typography";
import { ICON } from "@/components/ui/Icon";

type ProgressMeta =
  | { done: number; total: number }
  | "done";

interface MainTitleSectionProps {
  label?: string;
  title: string;
  /** Use smaller title variant (20px) instead of the default (28px) */
  smallTitle?: boolean;
  progressMeta?: ProgressMeta;
  progressBar?: { pct: number };
  actions?: React.ReactNode;
  className?: string;
}

export function ViewToggleButton({
  options,
  value,
  onChange,
}: {
  options: [
    { label: string; icon: React.ReactNode; value: string },
    { label: string; icon: React.ReactNode; value: string },
  ];
  value: string;
  onChange: (v: string) => void;
}) {
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

export function IconActionButton({
  icon,
  saveIcon,
  saving = false,
  onClick,
  show = true,
}: {
  icon: React.ReactNode;
  saveIcon?: React.ReactNode;
  saving?: boolean;
  onClick: () => void;
  show?: boolean;
}) {
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

export function CtaActionButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border-[1.5px] border-neutral-200 bg-white px-4 min-h-[44px] py-[10px] text-[13px] font-bold text-neutral-700 transition-colors hover:bg-neutral-100 active:scale-[0.97] dark:border-white/15 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

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
      <div className="flex flex-row items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          {label && <Eyebrow className="mb-2">{label}</Eyebrow>}
          <div className="flex items-baseline gap-[9px]">
            <PageTitle
              className={smallTitle ? "text-[20px] tracking-[-0.5px]" : ""}
            >
              {title}
            </PageTitle>

            {isDone && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold leading-none tracking-[-0.1px] text-green-500 dark:text-green-400">
                <IconCheck {...ICON.badge} strokeWidth={2.5} />
                Done
              </span>
            )}

            {counter && (
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-[13px] font-bold leading-none tracking-[-0.1px] text-neutral-400 dark:text-neutral-500">
                <IconClipboardList {...ICON.badge} strokeWidth={1.8} />
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
