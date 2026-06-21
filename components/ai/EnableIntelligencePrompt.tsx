"use client";

import { m, AnimatePresence } from "framer-motion";
import { IconBrain, IconCheck, IconShield, IconWifi, IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import type { EmbeddedAIStatus } from "@/lib/ai/useAIRuntime";

interface EnableIntelligencePromptProps {
  status: EmbeddedAIStatus;
  downloadProgress: number;
  modelSizeMB: number;
  onEnable: () => void;
  onDismiss: () => void;
}

function ProgressRing({ progress }: { progress: number }) {
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress / 100);

  return (
    <svg width="52" height="52" className="rotate-[-90deg]">
      <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="3"
        className="text-neutral-200 dark:text-white/10" />
      <m.circle
        cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="3"
        strokeLinecap="round" strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="text-emerald-500"
        transition={{ duration: 0.4 }}
      />
    </svg>
  );
}

export default function EnableIntelligencePrompt({
  status,
  downloadProgress,
  modelSizeMB,
  onEnable,
  onDismiss,
}: EnableIntelligencePromptProps) {
  const sizeMB = Math.round(modelSizeMB);

  const isDownloading = status === "enabling" || status === "downloading";
  const isReady = status === "ready";

  return (
    <m.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="mx-4 mb-4 overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-neutral-900"
    >
      {isDownloading && (
        <div className="h-[3px] w-full bg-neutral-100 dark:bg-white/[0.06]">
          <m.div
            className="h-full rounded-full bg-emerald-500"
            initial={{ width: "0%" }}
            animate={{ width: `${Math.max(downloadProgress, 3)}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}

      <div className="px-5 py-5">
        <AnimatePresence mode="wait" initial={false}>

          {/* ── Idle: enable prompt ─────────────────────────────────────────── */}
          {status === "disabled" && (
            <m.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mb-4 flex items-start gap-3.5">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#AD46FF]">
                  <IconBrain size={18} strokeWidth={1.8} className="text-white" />
                </div>
                <div>
                  <p className="text-[16px] font-bold leading-tight text-neutral-900 dark:text-white">
                    Enable Local Intelligence
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">
                    Private offline AI optimized for your device.
                  </p>
                </div>
              </div>

              <div className="mb-4 space-y-2">
                {[
                  { icon: IconShield, text: "Runs entirely on your device — no data sent anywhere" },
                  { icon: IconWifi,   text: "Works offline after download" },
                  { icon: IconBrain,  text: `~${sizeMB < 1000 ? sizeMB + " MB" : (sizeMB / 1000).toFixed(1) + " GB"} download, cached permanently` },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2.5">
                    <Icon size={13} strokeWidth={2} className="shrink-0 text-neutral-400" />
                    <p className="text-[12px] text-neutral-500 dark:text-neutral-400">{text}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <m.button
                  type="button"
                  onClick={onEnable}
                  whileTap={{ scale: 0.97 }}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-900 text-[13px] font-bold text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
                >
                  <IconBrain size={15} strokeWidth={2} />
                  Enable Local Intelligence
                </m.button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 text-neutral-400 transition-colors hover:bg-neutral-50 dark:border-white/[0.08] dark:hover:bg-white/[0.04]"
                >
                  ×
                </button>
              </div>
            </m.div>
          )}

          {/* ── Downloading ─────────────────────────────────────────────────── */}
          {isDownloading && (
            <m.div
              key="downloading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-4"
            >
              <div className="relative flex shrink-0 items-center justify-center">
                <ProgressRing progress={downloadProgress} />
                <span className="absolute text-[10px] font-bold tabular-nums text-neutral-600 dark:text-neutral-300">
                  {downloadProgress}%
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-neutral-900 dark:text-white">
                  Preparing Embedded Intelligence
                </p>
                <p className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500">
                  {downloadProgress < 10
                    ? "Optimizing for your device…"
                    : downloadProgress < 90
                    ? "Downloading lightweight offline AI…"
                    : "Almost ready…"}
                </p>
                <p className="mt-1 text-[10px] text-neutral-300 dark:text-neutral-600">
                  You can keep using the app while this downloads.
                </p>
              </div>
            </m.div>
          )}

          {/* ── Ready ───────────────────────────────────────────────────────── */}
          {isReady && (
            <m.div
              key="ready"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              <m.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500"
              >
                <IconCheck size={16} strokeWidth={2.5} className="text-white" />
              </m.div>
              <div>
                <p className="text-[14px] font-bold text-neutral-900 dark:text-white">
                  Embedded Intelligence Ready
                </p>
                <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
                  Offline · Private · Always available
                </p>
              </div>
            </m.div>
          )}

          {/* ── Error: couldn't load (offline / blocked) ────────────────────── */}
          {status === "error" && (
            <m.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                <IconAlertTriangle size={16} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-bold text-neutral-900 dark:text-white">
                  On-device AI couldn&apos;t load
                </p>
                <p className="mt-0.5 text-[12px] text-neutral-400 dark:text-neutral-500">
                  You may be offline or the download was blocked. The rest of the app works normally.
                </p>
              </div>
              <button
                type="button"
                onClick={onEnable}
                aria-label="Retry loading on-device AI"
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-2xl border border-neutral-200 px-3 text-[12px] font-bold text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-white/[0.08] dark:text-neutral-300 dark:hover:bg-white/[0.04]"
              >
                <IconRefresh size={14} strokeWidth={2.2} />
                Retry
              </button>
            </m.div>
          )}

        </AnimatePresence>
      </div>
    </m.div>
  );
}
