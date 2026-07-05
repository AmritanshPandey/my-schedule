"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { stopTextEditKeyPropagation } from "@/lib/keyboardEvents";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: string;
  /** Extra classes applied to the sheet/modal panel */
  className?: string;
  /** Override modal width on desktop (default max-w-[520px]) */
  desktopWidth?: string;
  /** Override the backdrop classes for the modal/sheet overlay. */
  backdropClassName?: string;
}

const MOBILE_SPRING = { type: "spring", stiffness: 380, damping: 30, mass: 0.9 } as const;
const DESKTOP_EASE  = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;

export default function BottomSheet({
  open,
  onClose,
  children,
  maxHeight = "calc(var(--sheet-vh, 100dvh) - env(safe-area-inset-top) - 12px)",
  className = "",
  desktopWidth = "max-w-[640px]",
  backdropClassName,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [viewportFrame, setViewportFrame] = useState({ height: 0, offsetTop: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

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

  // Esc key + scroll lock + focus trap. Do not focus the panel itself on open:
  // some platforms draw a large system focus highlight around the whole dialog,
  // and that also steals number-key input from fields inside the sheet.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const FOCUSABLE =
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === panel
      );
      if (nodes.length === 0) { e.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      // Restore focus to whatever opened the sheet (if it's still in the DOM).
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [open]);

  const mobileStyle = (viewportFrame.height > 0
    ? { "--sheet-vh": `${viewportFrame.height}px`, height: `${viewportFrame.height}px`, top: `${viewportFrame.offsetTop}px` }
    : { "--sheet-vh": "100dvh", height: "100dvh" }) as unknown as CSSProperties;

  const sheet = (
    <AnimatePresence>
      {open && (
        isDesktop ? (
          /* ── Desktop: centered modal ──────────────────────────────────────── */
          <m.div
            key="desktop-modal"
            className="fixed inset-0 z-50 flex items-center justify-center p-8"
            role="dialog"
            aria-modal="true"
          >
            {/* Backdrop — frosted so the modal reads as a floating layer */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className={`absolute inset-0 ${backdropClassName ?? "bg-black/35 backdrop-blur-md"}`}
              onClick={onClose}
              aria-hidden="true"
              data-glass
            />

            {/* Modal panel */}
            <m.div
              ref={panelRef}
              onKeyDown={stopTextEditKeyPropagation}
              initial={{ opacity: 0, scale: 0.97, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 10 }}
              transition={DESKTOP_EASE}
              data-glass
              className={`relative w-full ${desktopWidth} overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200/80 bg-white shadow-2xl shadow-black/10 outline-none dark:border-white/[0.08] dark:bg-neutral-900 dark:shadow-black/40 ${className}`}
              style={{ maxHeight: "88vh" }}
            >
              {children}
            </m.div>
          </m.div>
        ) : (
          /* ── Mobile: bottom sheet ─────────────────────────────────────────── */
          <m.div
            key="mobile-sheet"
            className="fixed left-0 right-0 top-0 z-50 flex items-end justify-center overflow-hidden"
            style={mobileStyle}
            role="dialog"
            aria-modal="true"
          >
            {/* Backdrop — frosted so the sheet reads as a floating layer */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className={`absolute inset-0 ${backdropClassName ?? "bg-black/35 backdrop-blur-sm"}`}
              onClick={onClose}
              aria-hidden="true"
              data-glass
            />

            {/* Panel */}
            <m.div
              ref={panelRef}
              onKeyDown={stopTextEditKeyPropagation}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={MOBILE_SPRING}
              style={{ maxHeight, willChange: "transform" }}
              className={`relative w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)] outline-none dark:border-white/[0.08] dark:bg-neutral-900 ${className}`}
            >
              {/* Drag handle */}
              <div className="sticky top-0 z-10 flex justify-center rounded-t-2xl bg-white pb-1 pt-3 dark:bg-neutral-900">
                <div className="h-1 w-10 rounded-full bg-neutral-300 dark:bg-white/20" />
              </div>
              {children}
            </m.div>
          </m.div>
        )
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
