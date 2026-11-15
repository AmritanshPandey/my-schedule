"use client";

import { IconTrendingUp } from "@tabler/icons-react";
import Button from "@/components/ui/Button";
import type { ProgressionSuggestion } from "@/lib/subtaskProgression";
import { describeEvidence, describeStep } from "@/lib/subtaskProgression";
import type { SubtaskProgression } from "@planr/core/lib/scheduleEntry";

/**
 * "Ready to step up" — one suggested progression step, with the evidence it
 * rests on, and the user's two answers. Plain and calm (PRODUCT.md: progress
 * feels earned, not gamified): no badge, no celebration, just the numbers.
 */
export default function ProgressionCard({
  suggestion,
  name,
  cadence,
  onDecide,
}: {
  suggestion: ProgressionSuggestion;
  name: string;
  cadence: SubtaskProgression["cadence"];
  onDecide: (decision: "accepted" | "held") => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 px-4 py-3.5 dark:border-white/[0.08]">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-neutral-500 dark:text-neutral-400">
        <IconTrendingUp size={13} strokeWidth={2.2} aria-hidden="true" />
        Ready to step up
      </div>
      <p className="mt-1.5 text-[16px] font-bold text-neutral-900 dark:text-white">{name}</p>
      <p className="text-[16px] font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">{describeStep(suggestion.from, suggestion.to)}</p>
      <p className="mt-0.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">{describeEvidence(suggestion.consistency, cadence)}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" size="md" className="flex-1" onClick={() => onDecide("accepted")}>
          Step up
        </Button>
        <Button variant="secondary" size="md" className="flex-1" onClick={() => onDecide("held")}>
          Hold for now
        </Button>
      </div>
    </div>
  );
}
