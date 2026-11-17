"use client";

import { IconAdjustments } from "@tabler/icons-react";
import Button from "@/components/ui/Button";
import type { PlanAdjustment } from "@/lib/useScheduleDB";

/** What accepting the suggestion would change, in plain words. */
export function adjustmentProposal(adj: PlanAdjustment): string {
  if (adj.kind === "pace") {
    const step = Math.abs(adj.detail.paceDeltaSec ?? 10);
    return `Speed up your interval and tempo pace by ${step} s/km from week ${adj.weekIndex}?`;
  }
  if (adj.kind === "repeat-week") return "Repeat last week's runs before moving on? Your plan ends a week later.";
  return "Ease next week back to last week's distances? Your plan ends a week later.";
}

/** A pending suggestion: the reason, the change, and the user's call. Nothing changes until Accept. */
export default function AdjustmentCard({ adjustment, onDecide }: { adjustment: PlanAdjustment; onDecide: (decision: "accepted" | "held") => void }) {
  return (
    <div className="rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-white/[0.07] dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/[0.06]">
          <IconAdjustments size={18} strokeWidth={2} className="text-neutral-600 dark:text-neutral-300" />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-bold text-neutral-900 dark:text-white">{adjustment.reason}</p>
          <p className="mt-0.5 text-[13px] font-medium text-neutral-600 dark:text-neutral-300">{adjustmentProposal(adjustment)}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={() => onDecide("accepted")}>Accept</Button>
        <Button variant="secondary" onClick={() => onDecide("held")}>Not now</Button>
      </div>
    </div>
  );
}
