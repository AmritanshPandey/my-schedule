"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconBrain, IconCheck, IconShield, IconSparkles, IconWifi, IconX } from "@tabler/icons-react";
import { AI_ENABLED_KEY } from "@/lib/ai/runtime";
import { useAIRuntime } from "@/lib/ai/useAIRuntime";

// On-device AI is on by default, so this is a one-time welcome explainer.
// It tracks "seen" separately so dismissing never disables AI.
const AI_ONBOARDED_KEY = "planr_ai_onboarded";

export default function AIOnboarding() {
  const runtime = useAIRuntime();
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<"idle" | "downloading" | "done">("idle");

  // Show once, after 2s, only if the user hasn't seen it and hasn't opted out.
  useEffect(() => {
    const t = setTimeout(() => {
      const seen = localStorage.getItem(AI_ONBOARDED_KEY);
      const optedOut = localStorage.getItem(AI_ENABLED_KEY) === "false";
      if (seen === null && !optedOut) setVisible(true);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  // Track runtime status changes
  useEffect(() => {
    if (runtime.status === "downloading" || runtime.status === "enabling") setPhase("downloading");
    if (runtime.status === "ready" && phase === "downloading") {
      setPhase("done");
      setTimeout(() => setVisible(false), 2200);
    }
  }, [runtime.status, phase]);

  function handleEnable() {
    localStorage.setItem(AI_ONBOARDED_KEY, "true");
    setPhase("downloading");
    runtime.enable();
  }

  // Dismiss only marks the explainer as seen — it does NOT disable AI.
  // Opting out lives in AI settings (the toggle).
  function handleDismiss() {
    localStorage.setItem(AI_ONBOARDED_KEY, "true");
    setVisible(false);
  }

  return (
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
            onClick={phase === "idle" ? handleDismiss : undefined}
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

              <AnimatePresence mode="wait" initial={false}>

                {/* ── Idle: enable prompt ─────────────────────────────────── */}
                {phase === "idle" && (
                  <m.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }}>

                    {/* Dismiss button */}
                    <div className="flex justify-end px-5 pt-5">
                      <button type="button" onClick={handleDismiss}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-white/[0.08] dark:text-neutral-400">
                        <IconX size={14} strokeWidth={2} />
                      </button>
                    </div>

                    {/* Icon */}
                    <div className="flex justify-center px-5 pt-2 pb-5">
                      <div className="relative">
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-violet-500 bg-[#AD46FF]">
                          <IconBrain size={36} strokeWidth={1.5} className="text-white" />
                        </div>
                        <m.div
                          className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full border border-emerald-600 bg-emerald-500"
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <IconSparkles size={13} strokeWidth={2} className="text-white" />
                        </m.div>
                      </div>
                    </div>

                    {/* Headline */}
                    <div className="px-6 pb-5 text-center">
                      <h2 className="text-[22px] font-black leading-tight tracking-[-0.5px] text-neutral-900 dark:text-white">
                        Meet Your Execution Intelligence
                      </h2>
                      <p className="mt-2 text-[14px] leading-snug text-neutral-500 dark:text-neutral-400">
                        Private offline AI that runs entirely on this device — no accounts, no cloud, no cost.
                      </p>
                    </div>

                    {/* Benefits */}
                    <div className="mx-5 mb-5 space-y-2.5 rounded-2xl border border-neutral-100 bg-neutral-50 px-4 py-3.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                      {[
                        { icon: IconShield, text: "Runs fully on your device — nothing leaves it" },
                        { icon: IconWifi,   text: "Works offline after a one-time download" },
                        { icon: IconBrain,  text: "Automatically optimized for this device" },
                      ].map(({ icon: Icon, text }) => (
                        <div key={text} className="flex items-center gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.06]">
                            <Icon size={13} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                          </div>
                          <p className="text-[13px] text-neutral-600 dark:text-neutral-300">{text}</p>
                        </div>
                      ))}
                    </div>

                    {/* CTA */}
                    <div className="px-5 pb-6">
                      <m.button
                        type="button"
                        onClick={handleEnable}
                        whileTap={{ scale: 0.97 }}
                        className="flex w-full items-center justify-center gap-2.5 rounded-full bg-neutral-900 py-4 text-[15px] font-bold text-white dark:bg-white dark:text-neutral-900"
                      >
                        <IconBrain size={18} strokeWidth={2} />
                        Enable Local Intelligence
                      </m.button>
                      <button type="button" onClick={handleDismiss}
                        className="mt-3 w-full py-2 text-[13px] font-medium text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
                        Set up later in Settings
                      </button>
                    </div>
                  </m.div>
                )}

                {/* ── Downloading ─────────────────────────────────────────── */}
                {phase === "downloading" && (
                  <m.div key="downloading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="px-6 py-8 text-center">
                    <div className="relative mx-auto mb-5 h-20 w-20">
                      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80">
                        <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="5" className="text-neutral-100 dark:text-white/10" />
                        <m.circle
                          cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="5"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 34}
                          strokeDashoffset={2 * Math.PI * 34 * (1 - runtime.downloadProgress / 100)}
                          className="text-emerald-500"
                          transition={{ duration: 0.5 }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-[16px] font-bold tabular-nums text-neutral-900 dark:text-white">
                          {runtime.downloadProgress}%
                        </span>
                      </div>
                    </div>
                    <p className="text-[17px] font-bold text-neutral-900 dark:text-white">
                      Preparing Embedded Intelligence
                    </p>
                    <p className="mt-2 text-[13px] text-neutral-400 dark:text-neutral-500">
                      {runtime.downloadProgress < 15
                        ? "Optimizing for your device…"
                        : runtime.downloadProgress < 85
                        ? "Downloading lightweight offline AI…"
                        : "Almost ready…"}
                    </p>
                    <p className="mt-4 text-[11px] text-neutral-300 dark:text-neutral-600">
                      The app stays fully usable while this downloads.
                    </p>
                  </m.div>
                )}

                {/* ── Done ────────────────────────────────────────────────── */}
                {phase === "done" && (
                  <m.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }} className="px-6 py-10 text-center">
                    <m.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 350, damping: 20 }}
                      className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-emerald-600 bg-emerald-500"
                    >
                      <IconCheck size={36} strokeWidth={2.5} className="text-white" />
                    </m.div>
                    <p className="text-[18px] font-bold text-neutral-900 dark:text-white">Intelligence Enabled</p>
                    <p className="mt-2 text-[13px] text-emerald-600 dark:text-emerald-400">
                      Offline · Private · Always available
                    </p>
                  </m.div>
                )}

              </AnimatePresence>
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  );
}
