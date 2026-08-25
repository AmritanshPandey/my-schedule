"use client";

/**
 * Shared AI error banner — extracted from components/desktop/AIPanel.tsx's
 * own error banner, the best-designed of what used to be several
 * independent copies (AIPanel's rose banner, AIActionSheet.tsx's red banner
 * shown twice, PlanDetailView's Coach chat writing errors as plain chat
 * bubbles). Rose matches this app's established danger color elsewhere
 * (Button.tsx's destructive/dangerSecondary variants, AIReviewSheet.tsx's
 * blockers) — the red used in a couple of AI surfaces was the actual
 * outlier, not this one.
 */

import { AnimatePresence, m } from "framer-motion";
import { IconX } from "@tabler/icons-react";

export function AIErrorBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="flex items-start gap-2 overflow-hidden rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/20 dark:bg-rose-500/10"
      >
        <p className="flex-1 text-[12px] font-medium text-rose-700 dark:text-rose-400">{message}</p>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-rose-400 hover:text-rose-600"
          >
            <IconX size={14} strokeWidth={2} />
          </button>
        )}
      </m.div>
    </AnimatePresence>
  );
}
