"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { m, AnimatePresence } from "framer-motion";
import { IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import { haptic } from "@/lib/haptics";

// Self-hosted worker (copied into public/ by scripts/copy-pdf-worker.mjs at
// build time). Served same-origin so it works offline / when a CDN is blocked
// in the installed iOS PWA, and is cached by the service worker.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface StrategyPdfReaderProps {
  pdfData?: string;  // base64 (guest fallback)
  pdfUrl?: string;   // Firebase Storage URL (preferred)
  onPageChange?: (page: number, total: number) => void;
}

const MIN_SCALE = 0.6;
const MAX_SCALE = 3.5;
const PAGE_GAP = 16;

export default function StrategyPdfReader({ pdfData, pdfUrl, onPageChange }: StrategyPdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  // renderScale = actual page width multiplier (committed after gesture)
  const [renderScale, setRenderScale] = useState(1);
  // visualScale = CSS-only scale during active pinch gesture
  const [visualScale, setVisualScale] = useState(1);

  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const lastTapRef = useRef(0);

  // Measure container width
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // ResizeObserver is unavailable on very old WebKit — fall back to the
    // initial measurement (plus a window-resize listener) so pages still render
    // at a real width instead of 0.
    if (typeof ResizeObserver === "undefined") {
      const measure = () => setContainerWidth(el.getBoundingClientRect().width);
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track visible page via scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || numPages === 0) return;

    function onScroll() {
      if (!el) return;
      const scrollTop = el.scrollTop;
      const pageHeight = (containerWidth * renderScale * 1.414) + PAGE_GAP; // A4 ratio
      const page = Math.min(numPages, Math.max(1, Math.round(scrollTop / pageHeight) + 1));
      setCurrentPage(page);
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [numPages, containerWidth, renderScale]);

  // Report page changes upward
  useEffect(() => {
    if (numPages > 0) onPageChange?.(currentPage, numPages);
  }, [currentPage, numPages, onPageChange]);

  // ── Pinch zoom handlers ─────────────────────────────────────────────────────
  function pinchDist(e: React.TouchEvent) {
    const [a, b] = [e.touches[0], e.touches[1]];
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: pinchDist(e), scale: renderScale };
    }
    // Double-tap detection on single touch
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 280) {
        haptic("light");
        setRenderScale((prev) => (prev > 1.1 ? 1 : 2));
      }
      lastTapRef.current = now;
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      const ratio = pinchDist(e) / pinchRef.current.dist;
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchRef.current.scale * ratio));
      setVisualScale(next / pinchRef.current.scale);
    }
  }

  function handleTouchEnd() {
    if (pinchRef.current && visualScale !== 1) {
      setRenderScale((prev) => {
        const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, prev * visualScale));
        return next;
      });
      setVisualScale(1);
      pinchRef.current = null;
    }
  }

  // ── Scroll to page ──────────────────────────────────────────────────────────
  function scrollToPage(n: number) {
    if (!scrollRef.current || containerWidth === 0) return;
    const pageHeight = containerWidth * renderScale * 1.414 + PAGE_GAP;
    scrollRef.current.scrollTo({ top: (n - 1) * pageHeight, behavior: "smooth" });
    haptic("light");
  }

  const fileData = useCallback(() => {
    // Prefer the Storage URL — react-pdf fetches it directly.
    if (pdfUrl) return pdfUrl;
    // Guest fallback: decode base64 to Uint8Array.
    if (pdfData) {
      const binary = atob(pdfData);
      const arr = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
      return { data: arr };
    }
    return null;
  }, [pdfUrl, pdfData]);

  const pageWidth = containerWidth > 0 ? containerWidth * renderScale : undefined;

  return (
    <div ref={containerRef} className="relative flex-1 overflow-hidden bg-neutral-900">
      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <m.div
          style={{ scale: visualScale, transformOrigin: "top center" }}
          transition={{ type: "spring", stiffness: 600, damping: 40 }}
          className="flex flex-col items-center py-4"
          aria-label="PDF pages"
        >
          {containerWidth > 0 && fileData() && (
            <Document
              file={fileData()}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              loading={
                <div className="flex flex-col gap-4 items-center pt-8">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse rounded-lg bg-white/[0.07]"
                      style={{ width: pageWidth, height: (pageWidth ?? 300) * 1.414 }}
                    />
                  ))}
                </div>
              }
              error={
                <div className="px-6 py-12 text-center text-white/40 text-sm">
                  Could not load PDF. The file may be corrupted or unsupported.
                </div>
              }
            >
              {pageWidth && Array.from({ length: numPages }, (_, i) => (
                <div key={i} style={{ marginBottom: PAGE_GAP }}>
                  <Page
                    pageNumber={i + 1}
                    width={pageWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </div>
              ))}
            </Document>
          )}
        </m.div>
      </div>

      {/* Floating page nav */}
      <AnimatePresence>
        {numPages > 1 && (
          <m.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className="absolute right-4 bottom-8 flex flex-col items-center gap-1.5"
          >
            <m.button
              type="button"
              whileTap={{ scale: 0.88 }}
              disabled={currentPage <= 1}
              onClick={() => scrollToPage(currentPage - 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800/90 backdrop-blur-sm border border-white/[0.10] text-white/70 disabled:opacity-30"
            >
              <IconChevronUp size={16} strokeWidth={2.5} />
            </m.button>

            <span className="text-[10px] font-bold tabular-nums text-white/40">
              {currentPage}
            </span>

            <m.button
              type="button"
              whileTap={{ scale: 0.88 }}
              disabled={currentPage >= numPages}
              onClick={() => scrollToPage(currentPage + 1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800/90 backdrop-blur-sm border border-white/[0.10] text-white/70 disabled:opacity-30"
            >
              <IconChevronDown size={16} strokeWidth={2.5} />
            </m.button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
