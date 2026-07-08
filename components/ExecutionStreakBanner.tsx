"use client";

import { m } from "framer-motion";
import { IconFlame } from "@tabler/icons-react";
import type { ExecutionStreak } from "@/lib/consistency/calculateExecutionStreak";
import { TRANSITION_BASE } from "@/lib/motion";

/**
 * The single momentum signal at the top of the Overview. Honest and earned —
 * it only appears once a real run exists (≥2 days), never celebrates a fresh
 * start, and turns into a calm factual nudge (amber) when the streak is alive
 * but nothing has been done today. No points, no confetti.
 */
export default function ExecutionStreakBanner({ data }: { data: ExecutionStreak }) {
  const { streak, atRisk, milestone } = data;
  if (streak < 2) return null;

  const tone = atRisk
    ? {
        ring: "border-amber-300/70 bg-amber-50 dark:border-amber-500/25 dark:bg-amber-500/[0.08]",
        icon: "text-amber-500",
        title: "text-amber-700 dark:text-amber-300",
        sub: "text-amber-700/80 dark:text-amber-300/70",
        label: `${streak}-day streak at risk`,
        hint: "Complete one thing to keep it alive.",
      }
    : {
        ring: "border-emerald-300/60 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07]",
        icon: "text-emerald-500",
        title: "text-emerald-700 dark:text-emerald-300",
        sub: "text-emerald-700/80 dark:text-emerald-300/70",
        label: milestone ? `${streak}-day streak · new milestone` : `${streak}-day streak`,
        hint: milestone ? "Earned today — keep the run going." : "You showed up today.",
      };

  return (
    <m.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={TRANSITION_BASE}
      role="status"
      // Floating status strip above the grid — quiet hero shadow, data-glass
      // tagged so the e2e banned-effects guard exempts it.
      data-glass
      className={`mb-3 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.12)] dark:shadow-[0_4px_20px_-10px_rgba(0,0,0,0.5)] ${tone.ring}`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70 dark:bg-white/[0.06] ${tone.icon}`}>
        <IconFlame size={20} strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className={`text-[14px] font-bold leading-tight ${tone.title}`}>{tone.label}</p>
        <p className={`text-[12px] leading-snug ${tone.sub}`}>{tone.hint}</p>
      </div>
    </m.div>
  );
}
