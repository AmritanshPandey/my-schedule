"use client";

import { useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconSparkles, IconX } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";

const STEPS = [
  { n: 1, text: "Download & install Ollama from ollama.com" },
  { n: 2, text: "Open Terminal and run: ollama serve" },
  { n: 3, text: "Pull a model: ollama pull gemma4:2b" },
  { n: 4, text: "Open PlanR on desktop → Settings → paste the server URL and model name" },
  { n: 5, text: "Done — AI Coach and task generation are ready to use" },
];

const MODELS = [
  { name: "gemma4:2b", ram: "12–16 GB", speed: "Fast, great for most plans" },
  { name: "gemma4:4b", ram: "16–24 GB", speed: "Smarter, richer responses" },
];

export default function AIMobileTeaser() {
  const [dismissed, setDismissed] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* ── Announcement bar — mobile only, dismissable ───────────────────── */}
      <AnimatePresence initial={false}>
        {!dismissed && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            {/* Promo bar */}
            <div className="ai-promo-bar relative overflow-hidden">
              {/* Shader noise overlay for depth */}
              <div className="pointer-events-none absolute inset-0 ai-promo-noise" />
              {/* Sweep shine */}
              <div className="pointer-events-none absolute inset-0 ai-promo-sweep" />

              <div className="relative z-10 flex items-center gap-2 px-4 py-2.5">
                {/* Sparkle */}
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <IconSparkles size={13} strokeWidth={2.5} className="text-white" />
                </div>

                {/* Message */}
                <p className="flex-1 text-[12px] font-semibold tracking-[-0.01em] text-white/95">
                  AI features available on desktop
                </p>

                {/* Learn more */}
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="shrink-0 rounded-full border border-white/30 bg-white/15 px-3 py-1 text-[11px] font-bold text-white transition-colors active:bg-white/25"
                >
                  Learn more
                </button>

                {/* Dismiss */}
                <button
                  type="button"
                  onClick={() => setDismissed(true)}
                  aria-label="Dismiss"
                  className="ml-0.5 shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-white/50 active:text-white transition-colors"
                >
                  <IconX size={12} strokeWidth={2.5} />
                </button>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* ── How-to bottom sheet ───────────────────────────────────────────── */}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} desktopWidth="max-w-[480px]">
        <div className="px-5 pb-8 pt-3">

          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="ai-promo-bar relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl">
              <div className="pointer-events-none absolute inset-0 ai-promo-sweep" />
              <IconSparkles size={20} strokeWidth={2} className="relative z-10 text-white" />
            </div>
            <div>
              <p className="text-[16px] font-bold text-neutral-900 dark:text-white">AI on Desktop</p>
              <p className="text-[12px] text-neutral-400 dark:text-neutral-500">
                Powered by Ollama — runs locally, free, private
              </p>
            </div>
          </div>

          {/* Setup steps */}
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            How to set up
          </p>
          <div className="mb-6 space-y-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
                  {s.n}
                </span>
                <p className="text-[13px] leading-snug text-neutral-700 dark:text-neutral-300">{s.text}</p>
              </div>
            ))}
          </div>

          {/* Model cards */}
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            Recommended models
          </p>
          <div className="mb-5 space-y-2">
            {MODELS.map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-3 dark:border-white/[0.07] dark:bg-white/[0.03]"
              >
                <div>
                  <p className="font-mono text-[13px] font-bold text-neutral-900 dark:text-white">{m.name}</p>
                  <p className="text-[11px] text-neutral-400 dark:text-neutral-500">{m.speed}</p>
                </div>
                <span className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-600 dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-neutral-400">
                  {m.ram} RAM
                </span>
              </div>
            ))}
          </div>

          <p className="text-[12px] leading-relaxed text-neutral-400 dark:text-neutral-500">
            Ollama runs entirely on your device — no data leaves your machine. Start with gemma4:2b if you have 12 GB or more of RAM.
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
