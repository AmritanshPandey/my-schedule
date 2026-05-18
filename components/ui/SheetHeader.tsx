"use client";

import { IconX } from "@tabler/icons-react";
import { Eyebrow, SheetTitle } from "@/components/ui/Typography";
import { ICON } from "@/components/ui/Icon";

interface SheetHeaderProps {
  eyebrow: string;
  title: string;
  onClose: () => void;
}

export default function SheetHeader({ eyebrow, title, onClose }: SheetHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <SheetTitle className="mt-0.5">{title}</SheetTitle>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-200 text-neutral-400 transition-colors hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-500 dark:hover:bg-white/5"
      >
        <IconX {...ICON.ui} />
      </button>
    </div>
  );
}
