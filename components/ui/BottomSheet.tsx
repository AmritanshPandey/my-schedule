"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: string;
  /** Extra classes applied to the sheet/modal panel */
  className?: string;
  /** Override modal width on desktop (default max-w-[520px]) */
  desktopWidth?: string;
}

const MOBILE_SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 } as const;
const DESKTOP_EASE  = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;

export default function BottomSheet({
  open,
  onClose,
  children,
  maxHeight = "calc(var(--sheet-vh, 100dvh) - env(safe-area-inset-top) - 12px)",
  className = "",
  desktopWidth = "max-w-[520px]",
}: BottomSheetProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [viewportFrame, setViewportFrame] = useState({ height: 0, offsetTop: 0 });

  // Track breakpoint once mounted (SSR-safe)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Mobile-only: track visual viewport for keyboard avoidance
  useEffect(() => {
    if (!open || isDesktop) { setViewportFrame({ height: 0, offsetTop: 0 }); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setViewportFrame({ height: vv.height, offsetTop: vv.offsetTop });
      const el = document.activeElement as HTMLElement | null;
      if (el && el !== document.body)
        requestAnimationFrame(() => el.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => { vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  }, [open, isDesktop]);

  // Esc key + scroll lock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  const mobileStyle = (viewportFrame.height > 0
    ? { "--sheet-vh": `${viewportFrame.height}px`, height: `${viewportFrame.height}px`, top: `${viewportFrame.offsetTop}px` }
    : { "--sheet-vh": "100dvh", height: "100dvh" }) as unknown as CSSProperties;

  return (
    <AnimatePresence>
      {open && (
        isDesktop ? (
          /* ── Desktop: centered modal ──────────────────────────────────────── */
          <motion.div
            key="desktop-modal"
            className="fixed inset-0 z-50 flex items-center justify-center p-8"
            role="dialog"
            aria-modal="true"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-[3px]"
              onClick={onClose}
            />

            {/* Modal panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={DESKTOP_EASE}
              className={`relative w-full ${desktopWidth} overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200/80 bg-white dark:border-white/[0.08] dark:bg-neutral-900 ${className}`}
              style={{ maxHeight: "88vh" }}
            >
              {children}
            </motion.div>
          </motion.div>
        ) : (
          /* ── Mobile: bottom sheet ─────────────────────────────────────────── */
          <motion.div
            key="mobile-sheet"
            className="fixed left-0 right-0 top-0 z-50 flex items-end justify-center overflow-hidden"
            style={mobileStyle}
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
              transition={MOBILE_SPRING}
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
        )
      )}
    </AnimatePresence>
  );
}
