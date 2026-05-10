"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: string;
  /** Additional classes applied to the sheet panel */
  className?: string;
}

const SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 } as const;

export default function BottomSheet({
  open,
  onClose,
  children,
  maxHeight = "88vh",
  className = "",
}: BottomSheetProps) {
  // Esc to close + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING}
            style={{ maxHeight }}
            className={`relative w-full max-w-lg overflow-y-auto rounded-t-[32px] border-t border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900 ${className}`}
          >
            {/* Drag handle */}
            <div className="sticky top-0 z-10 flex justify-center rounded-t-[32px] bg-white/95 pb-1 pt-3 backdrop-blur-sm dark:bg-neutral-900/95">
              <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
            </div>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
