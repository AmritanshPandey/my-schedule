"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { IconSparkles, IconX } from "@tabler/icons-react";
import { AIPanel } from "./AIPanel";
import BottomSheet from "@/components/ui/BottomSheet";
import type { AIActionResult } from "@/lib/ai";
import type { Plan, Ritual } from "@/lib/useScheduleDB";

interface AIFabProps {
  ollamaUrl: string;
  ollamaModel: string;
  context: "plans" | "routine" | "strategy";
  plans: Plan[];
  rituals: Ritual[];
  activePlan?: Plan;
  initialMessage?: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  onApplyAction: (result: AIActionResult) => void;
}

export function AIFab({
  ollamaUrl,
  ollamaModel,
  context,
  plans,
  rituals,
  activePlan,
  initialMessage,
  open: controlledOpen,
  onOpenChange,
  onApplyAction,
}: AIFabProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const open = controlledOpen ?? internalOpen;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  function setOpen(v: boolean) {
    setInternalOpen(v);
    onOpenChange?.(v);
  }

  const panel = (
    <AIPanel
      ollamaUrl={ollamaUrl}
      ollamaModel={ollamaModel}
      context={context}
      plans={plans}
      rituals={rituals}
      activePlan={activePlan}
      initialMessage={initialMessage}
      onApplyAction={(result) => { onApplyAction(result); setOpen(false); }}
      onClose={() => setOpen(false)}
    />
  );

  return (
    <>
      {/* ── Mobile: bottom sheet ──────────────────────────────────────────── */}
      {!isDesktop && (
        <BottomSheet
          open={open}
          onClose={() => setOpen(false)}
          maxHeight="92dvh"
          className="flex flex-col"
        >
          <div className="flex h-[80dvh] flex-col">
            {panel}
          </div>
        </BottomSheet>
      )}

      {isDesktop && open && (
        <div className="fixed bottom-24 right-6 z-50 flex w-[26rem] max-w-[95vw] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-neutral-950/95 shadow-[0_30px_80px_rgba(15,23,42,0.28)] backdrop-blur">
          <div className="h-[74vh] min-h-[520px] overflow-hidden">
            {panel}
          </div>
        </div>
      )}

      {/* ── FAB button — hidden; AI is desktop-only ────────────────────── */}
      <div className="fixed bottom-20 right-4 z-50 hidden lg:block">
        {/* Spinning rainbow ring */}
        <div
          aria-hidden="true"
          className={`absolute -inset-[2.5px] ai-fab-rainbow-ring transition-opacity duration-300 ${open ? "opacity-50" : "opacity-90"}`}
        />
        {/* Soft ambient glow */}
        <div
          aria-hidden="true"
          className={`absolute -inset-1 ai-fab-rainbow-ring blur-[5px] transition-opacity duration-300 ${open ? "opacity-15" : "opacity-35"}`}
        />
        <m.button
          type="button"
          onClick={() => setOpen(!open)}
          whileTap={{ scale: 0.93 }}
          className="relative z-10 flex h-13 w-13 items-center justify-center rounded-full bg-white/85 text-neutral-950 shadow-[0_20px_60px_rgba(15,23,42,0.16)] ring-1 ring-white/40 transition-colors duration-200 hover:bg-white dark:bg-neutral-950/95 dark:text-white dark:ring-white/10"
          aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        >
          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <m.span
                key="close"
                initial={{ rotate: -45, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 45, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <IconX size={20} strokeWidth={2} className="text-neutral-950 dark:text-white" />
              </m.span>
            ) : (
              <m.span
                key="open"
                initial={{ rotate: 45, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -45, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <IconSparkles size={20} strokeWidth={2} className="text-neutral-950 dark:text-white" />
              </m.span>
            )}
          </AnimatePresence>
        </m.button>
      </div>
    </>
  );
}
