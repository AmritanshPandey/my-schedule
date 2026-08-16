"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconSparkles, IconX } from "@tabler/icons-react";
import { AISettingsSheet } from "./AISettingsSheet";
import { haptic } from "@/lib/haptics";

/**
 * One-time welcome explainer for AI — shown once, then never again regardless
 * of what's chosen. AI runs on a local MLX model the browser talks to
 * directly (no account, no API key, no cloud usage) — dismissing this
 * doesn't disable anything, it just stops the explainer from reappearing.
 */
const AI_ONBOARDED_KEY = "planr_ai_onboarded";

export default function AIOnboarding() {
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Show once, after 2s, for anyone who hasn't seen it yet.
  useEffect(() => {
    const t = setTimeout(() => {
      const seen = localStorage.getItem(AI_ONBOARDED_KEY);
      if (seen === null) setVisible(true);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem(AI_ONBOARDED_KEY, "true");
    setVisible(false);
  }

  function handleOpenSettings() {
    haptic("light");
    localStorage.setItem(AI_ONBOARDED_KEY, "true");
    setVisible(false);
    setSettingsOpen(true);
  }

  return (
    <>
      <AnimatePresence>
        {visible && (
          <>
            {/* Backdrop */}
            <m.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-[60] bg-black/30 dark:bg-black/50"
              onClick={dismiss}
            />

            {/* Sheet */}
            <m.div
              key="sheet"
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
              className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-w-lg"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="m-3 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900">
                {/* Dismiss button */}
                <div className="flex justify-end px-5 pt-5">
                  <button
                    type="button"
                    onClick={dismiss}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.08] dark:text-neutral-400"
                  >
                    <IconX size={14} strokeWidth={2} />
                  </button>
                </div>

                {/* Icon */}
                <div className="flex justify-center px-5 pt-2 pb-5">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-violet-500 bg-[#AD46FF]">
                    <IconSparkles size={36} strokeWidth={1.5} className="text-white" />
                  </div>
                </div>

                {/* Headline */}
                <div className="px-6 pb-5 text-center">
                  <h2 className="text-[22px] font-black leading-tight tracking-[-0.5px] text-neutral-900 dark:text-white">
                    Meet AI in PlanR
                  </h2>
                  <p className="mt-2 text-[14px] leading-snug text-neutral-500 dark:text-neutral-400">
                    Free, local AI — build plans, generate tasks, and get a weekly
                    coaching read on your consistency. Runs entirely on your device,
                    no account or API key needed.
                  </p>
                </div>

                {/* CTA */}
                <div className="px-5 pb-6">
                  <button
                    type="button"
                    onClick={handleOpenSettings}
                    className="flex w-full items-center justify-center gap-2.5 rounded-full bg-neutral-900 py-4 text-[16px] font-bold text-white transition-colors dark:bg-white dark:text-neutral-900"
                  >
                    Set up local AI
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="mt-3 w-full py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>

      <AISettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
