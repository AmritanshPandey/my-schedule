"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { m, AnimatePresence } from "framer-motion";
import type { StrategyAsset } from "@/lib/useScheduleDB";
import StrategyHeader from "./StrategyHeader";
import StrategyHtmlRenderer from "./StrategyHtmlRenderer";
import { haptic } from "@/lib/haptics";
import { isIOSSafeMode } from "@/lib/iosSafeMode";

const StrategyPdfReader = dynamic(() => import("./StrategyPdfReader"), {
  ssr: false,
  loading: () => <div className="flex-1 bg-neutral-900 animate-pulse" />,
});

interface StrategyViewerProps {
  asset: StrategyAsset | null;
  onClose: () => void;
}

export default function StrategyViewer({ asset, onClose }: StrategyViewerProps) {
  const iosSafeMode = isIOSSafeMode();
  const [focusMode, setFocusMode] = useState(false);
  const [renderMode, setRenderMode] = useState<"original" | "adaptive">("original");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page);
    setTotalPages(total);
  }, []);

  function handleClose() {
    haptic("light");
    setFocusMode(false);
    setRenderMode("original");
    setCurrentPage(1);
    setTotalPages(0);
    onClose();
  }

  function handleTapContent() {
    if (focusMode) {
      haptic("light");
      setFocusMode(false);
    }
  }

  return (
    <AnimatePresence>
      {asset && (
        <m.div
          key="strategy-viewer"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", stiffness: 320, damping: 34 }}
          className="fixed inset-0 z-[60] flex flex-col bg-neutral-950"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {/* Header */}
          <StrategyHeader
            asset={asset}
            focusMode={focusMode}
            onBack={handleClose}
            onToggleFocus={() => setFocusMode((v) => !v)}
            renderMode={renderMode}
            onToggleMode={() => setRenderMode((m) => m === "original" ? "adaptive" : "original")}
            currentPage={currentPage}
            totalPages={totalPages || undefined}
          />

          {/* Content area */}
          <div
            className="flex-1 overflow-hidden"
            onClick={handleTapContent}
          >
            {asset.type === "html" && asset.htmlContent && (
              <StrategyHtmlRenderer
                htmlContent={asset.htmlContent}
                renderMode={renderMode}
                onModeDetected={(detected) => {
                  setRenderMode(detected);
                }}
              />
            )}

            {asset.type === "pdf" && iosSafeMode && (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div>
                  <p className="text-[15px] font-bold text-white">PDF viewer paused on iOS</p>
                  <p className="mt-1 text-[13px] leading-snug text-white/45">
                    Safe mode is active while the iPhone crash is being isolated.
                  </p>
                </div>
              </div>
            )}

            {asset.type === "pdf" && !iosSafeMode && (asset.pdfUrl || asset.pdfData) && (
              <StrategyPdfReader
                pdfUrl={asset.pdfUrl}
                pdfData={asset.pdfData}
                onPageChange={handlePageChange}
              />
            )}

            {/* Fallback */}
            {((asset.type === "html" && !asset.htmlContent) ||
              (asset.type === "pdf" && !asset.pdfUrl && !asset.pdfData)) && (
              <div className="flex h-full items-center justify-center">
                <p className="text-white/30 text-sm">No content available.</p>
              </div>
            )}
          </div>

          {/* Focus mode tap-to-show hint */}
          <AnimatePresence>
            {focusMode && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none"
              >
                <span className="rounded-full bg-neutral-900/80 backdrop-blur-sm px-4 py-2 text-[12px] font-semibold text-white/40">
                  Tap to show controls
                </span>
              </m.div>
            )}
          </AnimatePresence>
        </m.div>
      )}
    </AnimatePresence>
  );
}
