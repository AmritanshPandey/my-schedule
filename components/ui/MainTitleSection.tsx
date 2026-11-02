"use client";

import { memo } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconCheck, IconChecklist } from "@tabler/icons-react";
import { Eyebrow, PageTitle } from "@/components/ui/Typography";
import ProgressBar from "@/components/ui/ProgressBar";
import { ICON } from "@/components/ui/Icon";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";

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
    <Button variant="secondary" size="md" onClick={() => onChange(other.value)} trailingIcon={other.icon}>
      {other.label}
    </Button>
  );
}

export function IconActionButton({
  icon,
  saveIcon,
  saving = false,
  onClick,
  show = true,
  label,
}: {
  icon: React.ReactNode;
  saveIcon?: React.ReactNode;
  saving?: boolean;
  onClick: () => void;
  show?: boolean;
  label?: string;
}) {
  if (!show) return null;
  return (
    <IconButton label={label ?? ""} size="md" selected={saving} onClick={onClick}>
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={saving ? "save" : "edit"}
          initial={{ opacity: 0, scale: 0.75 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.75 }}
          transition={{ duration: 0.14 }}
          className="inline-flex"
        >
          {saving && saveIcon ? saveIcon : icon}
        </m.span>
      </AnimatePresence>
    </IconButton>
  );
}

export function CtaActionButton({
  label,
  icon,
  onClick,
  tour,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  /** `data-tour` id, when a coach-mark step points at this button. */
  tour?: string;
}) {
  return (
    <Button variant="secondary" size="md" onClick={onClick} data-tour={tour} icon={icon}>
      {label}
    </Button>
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
              <span className="inline-flex shrink-0 items-center gap-1 tabular-nums text-[13px] font-bold leading-none tracking-[-0.1px] text-neutral-500 dark:text-neutral-400">
                <IconChecklist {...ICON.badge} strokeWidth={1.8} />
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
        <ProgressBar
          pct={progressBar.pct}
          height={4}
          rounded="rounded-[2px]"
          fillClassName="bg-green-500"
          className="mt-[10px]"
        />
      )}
    </div>
  );
}

export const MainTitleSection = memo(MainTitleSectionInner);
