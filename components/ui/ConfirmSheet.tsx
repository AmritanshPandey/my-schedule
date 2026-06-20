"use client";

import type { ReactNode } from "react";
import { m } from "framer-motion";
import BottomSheet from "@/components/ui/BottomSheet";

interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  actions?: ReactNode;
}

export default function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  actions,
}: ConfirmSheetProps) {
  function handleConfirm() {
    onConfirm();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-5 pb-8 pt-2">
        <h2 className="mb-1 text-[18px] font-bold text-neutral-900 dark:text-white">
          {title}
        </h2>
        {description && (
          <p className="mb-6 text-[14px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        )}
        {!description && <div className="mb-6" />}

        {actions ?? (
          <div className="flex gap-3">
            <m.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={onClose}
              className="flex-1 rounded-2xl border border-neutral-200 bg-white py-3.5 text-[15px] font-semibold text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/[0.08] dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-white/[0.07]"
            >
              Cancel
            </m.button>
            <m.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={handleConfirm}
              className="flex-1 rounded-2xl bg-rose-500 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-rose-600 dark:bg-rose-500 dark:hover:bg-rose-600"
            >
              {confirmLabel}
            </m.button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
