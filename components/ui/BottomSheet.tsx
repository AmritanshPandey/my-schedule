"use client";

import { useEffect, useState, type CSSProperties } from "react";
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
  maxHeight = "calc(var(--sheet-vh, 100dvh) - env(safe-area-inset-top) - 12px)",
  className = "",
}: BottomSheetProps) {
  const [viewportFrame, setViewportFrame] = useState({ height: 0, offsetTop: 0 });

  useEffect(() => {
    if (!open) {
      setViewportFrame({ height: 0, offsetTop: 0 });
      return;
    }

    const visualViewport = window.visualViewport;
    if (!visualViewport) return;

    const updateViewportFrame = () => {
      setViewportFrame({
        height: visualViewport.height,
        offsetTop: visualViewport.offsetTop,
      });
      // When the keyboard opens and shrinks the viewport, scroll the focused
      // input into view so it isn't hidden behind the keyboard.
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) {
        requestAnimationFrame(() =>
          active.scrollIntoView({ block: "nearest", behavior: "smooth" })
        );
      }
    };

    updateViewportFrame();
    visualViewport.addEventListener("resize", updateViewportFrame);
    visualViewport.addEventListener("scroll", updateViewportFrame);

    return () => {
      visualViewport.removeEventListener("resize", updateViewportFrame);
      visualViewport.removeEventListener("scroll", updateViewportFrame);
    };
  }, [open]);

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

  const containerStyle = viewportFrame.height > 0
    ? ({
        "--sheet-vh": `${viewportFrame.height}px`,
        height: `${viewportFrame.height}px`,
        top: `${viewportFrame.offsetTop}px`,
      } as CSSProperties)
    : ({ "--sheet-vh": "100dvh", height: "100dvh" } as CSSProperties);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed left-0 right-0 top-0 z-50 flex items-end justify-center overflow-hidden"
          style={containerStyle}
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SPRING}
            style={{ maxHeight, willChange: "transform" }}
            className={`relative w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[32px] border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-white/[0.08] dark:bg-neutral-900 ${className}`}
          >
            {/* Drag handle */}
            <div className="sticky top-0 z-10 flex justify-center rounded-t-[32px] bg-white/95 pb-1 pt-3 dark:bg-neutral-900/95">
              <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
            </div>

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
