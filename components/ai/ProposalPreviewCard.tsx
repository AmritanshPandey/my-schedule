"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { IconCheck, IconX } from "@tabler/icons-react";
import type { AIProposal } from "@/lib/aiProposal";
import Button from "@/components/ui/Button";
import TimeInput from "@/components/ui/TimeInput";
import { DAYS, DAY_LABELS, type DayKey } from "@/lib/scheduleConstants";

interface ProposalPreviewCardProps {
  proposal: AIProposal;
  onAccept: (proposal: AIProposal) => void;
  onReject: (proposal: AIProposal) => void;
}

/**
 * The reusable AI-suggestion preview: a human-readable diff (never raw JSON)
 * plus explicit Accept/Reject. Same card shell/typography as AIPanel.tsx's
 * ActionCard, same Button variants as the rest of the app — no new visual
 * language. Once resolved, collapses to a one-line status so a decision
 * can't be replayed.
 */
export function ProposalPreviewCard({ proposal, onAccept, onReject }: ProposalPreviewCardProps) {
  // A day/startTime/endTime the model genuinely left unsaid (as opposed to
  // present-but-wrong) — see lib/ai.ts's parseAITaskFields and
  // lib/aiProposal.ts's buildCreateTaskProposal for where this is set.
  // Answered here rather than by re-typing into chat: the same "ask instead
  // of silently keeping a fake 9am Monday" fix AIReviewSheet.tsx has for
  // every other action type, for the one type (add_task) that skips that
  // sheet entirely via its own reviewed-proposal path.
  const [day, setDay] = useState<DayKey | null>(null);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const unspecified = new Set(proposal.data._unspecified ?? []);
  const needsDay = unspecified.has("day");
  const needsStart = unspecified.has("startTime");
  const needsEnd = unspecified.has("endTime");
  const ready = (!needsDay || day) && (!needsStart || startTime) && (!needsEnd || endTime);

  function handleAccept() {
    if (unspecified.size === 0) {
      onAccept(proposal);
      return;
    }
    onAccept({
      ...proposal,
      data: {
        ...proposal.data,
        ...(needsDay && day ? { days: [day] } : {}),
        ...(needsStart && startTime ? { startTime } : {}),
        ...(needsEnd && endTime ? { endTime } : {}),
        _unspecified: undefined,
      },
    });
  }

  if (proposal.status !== "pending") {
    const resolved = proposal.status === "accepted"
      ? { icon: IconCheck, label: "Added", tone: "text-emerald-600 dark:text-emerald-400" }
      : proposal.status === "rejected"
      ? { icon: IconX, label: "Dismissed", tone: "text-neutral-400 dark:text-neutral-500" }
      : { icon: IconX, label: "Couldn't add this", tone: "text-rose-500 dark:text-rose-400" };
    return (
      <m.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className={`mt-2 flex items-center gap-1.5 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-[12px] font-semibold dark:border-white/[0.10] dark:bg-neutral-900 ${resolved.tone}`}
      >
        <resolved.icon size={13} strokeWidth={2.5} />
        {resolved.label}
      </m.div>
    );
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="mt-2 w-full rounded-2xl border border-emerald-200/60 bg-white p-3 dark:border-emerald-500/[0.18] dark:bg-neutral-900"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
          AI Suggestion
        </span>
        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">Review before adding</span>
      </div>

      <p className="mb-2 text-[13px] font-semibold text-neutral-900 dark:text-white">{proposal.title}</p>

      <div className="mb-3 flex flex-col gap-1 rounded-xl border border-neutral-100 bg-neutral-50 p-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
        {proposal.changes.map((change, i) => (
          <div key={i} className="flex items-baseline gap-2 text-[11px]">
            <span className="w-12 shrink-0 font-semibold text-neutral-400 dark:text-neutral-500">{change.label}</span>
            <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">{change.value}</span>
          </div>
        ))}
      </div>

      {unspecified.size > 0 && (
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50/50 p-2.5 dark:border-rose-500/20 dark:bg-rose-500/[0.06]">
          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
            No real day or time was given — needs an answer
          </span>
          {needsDay && (
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    day === d
                      ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-white/20"
                  }`}
                >
                  {DAY_LABELS[d]}
                </button>
              ))}
            </div>
          )}
          {(needsStart || needsEnd) && (
            <div className="flex gap-2">
              {needsStart && <TimeInput value={startTime} onChange={setStartTime} ariaLabel="Start time" className="flex-1" />}
              {needsEnd && <TimeInput value={endTime} onChange={setEndTime} ariaLabel="End time" className="flex-1" />}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="dangerSecondary" onClick={() => onReject(proposal)}>
          Reject
        </Button>
        <Button size="sm" variant="cta" fullWidth disabled={!ready} onClick={handleAccept}>
          Accept
        </Button>
      </div>
    </m.div>
  );
}

export default ProposalPreviewCard;
