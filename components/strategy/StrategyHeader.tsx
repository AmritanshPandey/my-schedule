"use client";

import { m } from "framer-motion";
import {
  IconArrowLeft,
  IconMaximize,
  IconMinimize,
  IconCode,
  IconFileText,
  IconDeviceMobile,
  IconLayout,
} from "@tabler/icons-react";
import type { StrategyAsset } from "@/lib/useScheduleDB";
import { haptic } from "@/lib/haptics";

interface StrategyHeaderProps {
  asset: StrategyAsset;
  focusMode: boolean;
  onBack: () => void;
  onToggleFocus: () => void;
  renderMode?: "original" | "adaptive";
  onToggleMode?: () => void;
  currentPage?: number;
  totalPages?: number;
}

export default function StrategyHeader({
  asset,
  focusMode,
  onBack,
  onToggleFocus,
  renderMode,
  onToggleMode,
  currentPage,
  totalPages,
}: StrategyHeaderProps) {
  const isHtml = asset.type === "html";
  const progress = totalPages && currentPage ? (currentPage / totalPages) * 100 : 0;

  // Per-type accent colors
  const accent = isHtml
    ? { pill: "bg-sky-500/15 text-sky-300 border border-sky-500/25", bar: "from-sky-500/50 via-sky-500/20 to-transparent", progress: "bg-sky-400" }
    : { pill: "bg-violet-500/15 text-violet-300 border border-violet-500/25", bar: "from-violet-500/50 via-violet-500/20 to-transparent", progress: "bg-violet-400" };

  return (
    <m.div
      animate={{ opacity: focusMode ? 0 : 1, y: focusMode ? -6 : 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className={`shrink-0 z-10 flex flex-col bg-neutral-950/95 backdrop-blur-md ${focusMode ? "pointer-events-none" : ""}`}
    >
      {/* Top accent gradient line */}
      <div className={`h-[1.5px] bg-gradient-to-r ${accent.bar}`} />

      {/* ── Main row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-4">

        {/* Back button */}
        <m.button
          type="button"
          whileTap={{ scale: 0.86 }}
          onClick={() => { haptic("light"); onBack(); }}
          className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-white/60 active:text-white transition-colors"
        >
          <IconArrowLeft size={17} strokeWidth={2.2} />
        </m.button>

        {/* Title block */}
        <div className="flex-1 min-w-0">
          {/* Type badge */}
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.09em] ${accent.pill}`}>
              {isHtml ? <IconCode size={9} strokeWidth={2.5} /> : <IconFileText size={9} strokeWidth={2.5} />}
              {asset.type}
            </span>
            {asset.description && (
              <span className="text-[11px] text-white/25 truncate hidden sm:block">
                {asset.description}
              </span>
            )}
          </div>
          {/* Title */}
          <p className="text-[16px] font-bold text-white leading-snug truncate tracking-tight">
            {asset.title}
          </p>
        </div>

        {/* Action buttons */}
        <div className="shrink-0 flex items-center gap-1.5">
          {/* Focus / fullscreen */}
          <m.button
            type="button"
            whileTap={{ scale: 0.86 }}
            onClick={() => { haptic("light"); onToggleFocus(); }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.07] text-white/50 active:text-white transition-colors"
          >
            {focusMode ? <IconMinimize size={15} strokeWidth={2.2} /> : <IconMaximize size={15} strokeWidth={2.2} />}
          </m.button>
        </div>
      </div>

      {/* ── Bottom info bar — same height for both types ──────────────────── */}
      <div className="flex items-center gap-3 px-4 pb-3">

        {/* HTML: render mode toggle pill */}
        {isHtml && onToggleMode && (
          <>
            <m.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => { haptic("light"); onToggleMode(); }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                renderMode === "adaptive"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                  : "bg-white/[0.06] text-white/40 border border-white/[0.08]"
              }`}
            >
              <IconDeviceMobile size={11} strokeWidth={2.2} />
              Adaptive
            </m.button>
            <m.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => { haptic("light"); onToggleMode(); }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                renderMode === "original"
                  ? "bg-white/[0.10] text-white/80 border border-white/[0.14]"
                  : "bg-white/[0.04] text-white/25 border border-white/[0.06]"
              }`}
            >
              <IconLayout size={11} strokeWidth={2.2} />
              Original
            </m.button>
            <div className="flex-1" />
            <span className="text-[10px] font-semibold text-white/20 uppercase tracking-wider">
              HTML
            </span>
          </>
        )}

        {/* PDF: reading progress */}
        {!isHtml && (
          <>
            <div className="relative flex-1 h-[2px] overflow-hidden rounded-full bg-white/[0.08]">
              <m.div
                className={`absolute inset-y-0 left-0 rounded-full ${accent.progress}`}
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/30">
              {totalPages && totalPages > 1 ? `${currentPage ?? 1} / ${totalPages}` : "PDF"}
            </span>
          </>
        )}
      </div>

      {/* Bottom border */}
      <div className="h-px bg-white/[0.06]" />
    </m.div>
  );
}
