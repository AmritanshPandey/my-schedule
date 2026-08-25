"use client";

/**
 * Shared "AI is working" indicators — extracted from components/desktop/
 * AIPanel.tsx (the most thoughtfully-designed of what used to be four
 * independent, drifting reimplementations: AIPanel's own dots, AIActionSheet.
 * tsx's copy, AIAssistant.tsx's copy-pasted duplicate of AIActionSheet's, and
 * PlanDetailView.tsx's separately-invented cycling-phrase version, which
 * AIPlanCreatorSheet.tsx then copy-pasted too). Consolidating here doesn't
 * force one visual language on every surface — `tone` and `phrases` still
 * let each surface keep its own color/copy — it just means there is one
 * place these animations and timings live instead of five.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";

const TONE_DOT: Record<"neutral" | "emerald", string> = {
  neutral: "bg-neutral-400 dark:bg-neutral-500",
  emerald: "bg-emerald-500",
};

const TONE_LABEL: Record<"neutral" | "emerald", string> = {
  neutral: "text-neutral-500 dark:text-neutral-400",
  emerald: "text-neutral-500 dark:text-neutral-400",
};

const TONE_CURSOR: Record<"neutral" | "emerald", string> = {
  neutral: "bg-neutral-400 dark:bg-neutral-500",
  emerald: "bg-emerald-500",
};

/**
 * Shown only while waiting for the FIRST token — once real text starts
 * streaming in, that token-by-token appearance already is the honest
 * progress signal, so callers stop rendering this once they have any text.
 * The copy is deliberately elapsed-time-based rather than a fabricated
 * checklist ("Analyzing…", "Drafting…") that would play out identically no
 * matter what's actually happening — a local model can genuinely take
 * several seconds before its first token, so the label escalates honestly
 * instead of pretending nothing changed, and it plateaus (doesn't loop) so a
 * long wait doesn't start to feel like it's lying.
 */
const THINKING_PHASES: { atMs: number; local: string; remote: string }[] = [
  { atMs: 0, local: "Thinking on your device…", remote: "Thinking…" },
  { atMs: 3500, local: "Still working…", remote: "Still working…" },
  { atMs: 9000, local: "Local models can take a moment — hang tight", remote: "Taking longer than usual…" },
];

/** The three pulsing dots alone — AIActionSheet.tsx's original ThinkingDots
 *  had no accompanying label (its "Thinking…"/"Found N tasks…" text lives
 *  separately, in its CTA button), so this stays dots-only to keep that
 *  surface's exact current look. AIPanel-style callers that also want the
 *  escalating label compose it with AIThinkingLabel below. */
export function AIThinkingDots({ tone = "neutral" }: { tone?: "neutral" | "emerald" }) {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          className={`block h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`}
          animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

/** The elapsed-time-escalating label alone — see THINKING_PHASES' doc
 *  comment above for why it escalates instead of looping. */
export function AIThinkingLabel({ isLocal, tone = "neutral" }: { isLocal: boolean; tone?: "neutral" | "emerald" }) {
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    setPhaseIdx(0);
    const timers = THINKING_PHASES.slice(1).map((phase, i) => setTimeout(() => setPhaseIdx(i + 1), phase.atMs));
    return () => timers.forEach(clearTimeout);
  }, []);

  const label = isLocal ? THINKING_PHASES[phaseIdx].local : THINKING_PHASES[phaseIdx].remote;

  return (
    <AnimatePresence mode="wait">
      <m.span
        key={label}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.2 }}
        className={`text-[12px] font-medium ${TONE_LABEL[tone]}`}
      >
        {label}
      </m.span>
    </AnimatePresence>
  );
}

/** AIPanel.tsx's original combined shape — dots + escalating label. */
export function AIThinkingStatus({ isLocal, tone = "neutral" }: { isLocal: boolean; tone?: "neutral" | "emerald" }) {
  return (
    <span className="inline-flex items-center gap-2 py-0.5">
      <AIThinkingDots tone={tone} />
      <AIThinkingLabel isLocal={isLocal} tone={tone} />
    </span>
  );
}

export function AIStreamingCursor({ tone = "neutral" }: { tone?: "neutral" | "emerald" }) {
  return (
    <m.span
      className={`inline-block ml-0.5 h-[13px] w-[2px] rounded-full align-middle ${TONE_CURSOR[tone]}`}
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/**
 * The interval-cycling label pattern (PlanDetailView's former
 * CoachStreamingStatus, AIPlanCreatorSheet's former GenStreamingStatus) —
 * takes its own phrase list so each surface keeps its own copy while
 * sharing the animation/timing.
 */
export function AICyclingStatus({ phrases }: { phrases: string[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    const id = setInterval(() => setIdx((p) => (p + 1) % phrases.length), 1400);
    return () => clearInterval(id);
  }, [phrases]);
  return (
    <AnimatePresence mode="wait">
      <m.span
        key={phrases[idx]}
        initial={{ opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -3 }}
        transition={{ duration: 0.22 }}
        className="animate-status-pulse text-[13px] font-medium text-neutral-500 dark:text-neutral-400"
      >
        {phrases[idx]}
      </m.span>
    </AnimatePresence>
  );
}
