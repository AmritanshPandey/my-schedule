"use client";

import { IconX } from "@tabler/icons-react";

interface SheetHeaderProps {
  eyebrow: string;
  title: string;
  onClose: () => void;
}

export default function SheetHeader({ eyebrow, title, onClose }: SheetHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-neutral-500">
          {eyebrow}
        </p>
        <h2 className="mt-0.5 text-[18px] font-semibold text-neutral-950 dark:text-white">
          {title}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-500 dark:hover:bg-white/5"
      >
        <IconX size={16} />
      </button>
    </div>
  );
}
