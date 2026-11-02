"use client";

import type { ReactNode } from "react";
import BottomSheet from "@/components/ui/BottomSheet";
import Button from "@/components/ui/Button";

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
            <Button variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm} className="flex-1">
              {confirmLabel}
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
