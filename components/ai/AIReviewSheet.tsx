"use client";

import { useMemo, useState } from "react";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import { haptic } from "@/lib/haptics";
import type { AIActionResult } from "@/lib/ai";
import type { Plan, Schedule } from "@/lib/useScheduleDB";
import { describeAction, canConfirm, actionNoun } from "@/lib/ai/checklist";
import { describeBreaches, type CreationCounts } from "@/lib/ai/limits";
import type { TaskCandidate } from "@/lib/ai/targets";

/**
 * The last thing between an AI response and the schedule.
 *
 * Every write used to apply the moment it was parsed, so a confidently wrong
 * answer became a silent edit. This shows what is about to happen — where it
 * lands, what it will create, what is missing — and does not let it through
 * until the target resolves and the required fields are filled.
 *
 * The target is a picker rather than a label on purpose: it is the control that
 * catches the model naming the wrong plan, which is the failure the rest of this
 * work exists to prevent.
 */
export default function AIReviewSheet({
  open,
  action,
  schedule,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  action: AIActionResult | null;
  schedule: Schedule;
  onCancel: () => void;
  /** Receives the action with any target correction applied. */
  onConfirm: (action: AIActionResult) => void;
}) {
  const [targetOverride, setTargetOverride] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // Re-describe with the override folded in, so choosing a plan clears the
  // blocker immediately rather than only at confirm time.
  const effective = useMemo<AIActionResult | null>(() => {
    if (!action) return null;
    if (!targetOverride) return action;
    switch (action.type) {
      case "add_task":
      case "add_tracker":
      case "suggest_milestones":
        return { ...action, payload: { ...action.payload, planTitle: targetOverride } } as AIActionResult;
      case "add_subtasks":
        return { ...action, payload: { ...action.payload, taskTitle: targetOverride } };
      default:
        return action;
    }
  }, [action, targetOverride]);

  const review = useMemo(
    () => (effective ? describeAction(effective, schedule) : null),
    [effective, schedule],
  );

  if (!action || !effective || !review) return null;

  const ready = canConfirm(review, acknowledged);
  const capNote = describeBreaches(review.limits.softBreaches);

  // Candidates to choose between when the target didn't resolve on its own.
  const candidates: Array<{ key: string; label: string }> =
    review.target.kind === "plan" && review.target.match.status !== "resolved"
      ? planCandidates(review.target.match, schedule.plans)
      : review.target.kind === "task" && review.target.match.status !== "resolved"
      ? taskCandidateOptions(review.target.match)
      : [];

  function close() {
    setTargetOverride(null);
    setAcknowledged(false);
    onCancel();
  }

  return (
    <BottomSheet open={open} onClose={close} maxHeight="86vh">
      <div className="flex flex-col gap-4 px-5 pb-6 pt-2">
        <SheetHeader eyebrow={`Review ${actionNoun(effective)}`} title={review.summary} onClose={close} />

        {/* What it will create — the size of the change, before it happens. */}
        <div className="flex flex-wrap gap-1.5">
          {countChips(review.limits.counts).map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-[11px] font-semibold text-neutral-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-neutral-300"
            >
              {chip}
            </span>
          ))}
        </div>

        {/* Where it lands. A picker, not a label — this is the control that
            catches a wrong plan before it is written. */}
        {review.target.kind !== "none" && (
          <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 px-4 py-3 dark:border-white/[0.08]">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
              {review.target.kind === "plan" ? "Plan" : "Task"}
            </span>
            {review.target.match.status === "resolved" ? (
              <p className="text-[14px] font-bold text-neutral-900 dark:text-white">
                {review.target.kind === "plan"
                  ? (review.target.match.value as Plan).title
                  : (review.target.match.value as TaskCandidate).title}
              </p>
            ) : (
              <>
                <p className="text-[12px] font-medium text-amber-700 dark:text-amber-400">
                  {review.target.problem}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {candidates.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => { haptic("light"); setTargetOverride(c.label); }}
                      className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-white/[0.1] dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-white/[0.04]"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Required first, then optional — each optional one is fine to leave. */}
        <div className="flex flex-col gap-1.5">
          {review.fields.map((f) => (
            <div
              key={f.key}
              className="flex items-center gap-2 rounded-xl border border-neutral-100 px-3 py-2 dark:border-white/[0.05]"
            >
              <span className="w-24 shrink-0 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                {f.label}
              </span>
              {f.value !== null ? (
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">
                  {f.value}
                </span>
              ) : (
                <span
                  className={`min-w-0 flex-1 text-[12px] font-semibold ${
                    f.required ? "text-rose-600 dark:text-rose-400" : "text-neutral-400 dark:text-neutral-500"
                  }`}
                >
                  {f.required ? "Required — missing" : "Not set · optional"}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* A large change is allowed, but not silently. */}
        {capNote && (
          <button
            type="button"
            onClick={() => { haptic("light"); setAcknowledged((a) => !a); }}
            className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-left transition-colors ${
              acknowledged
                ? "border-emerald-500/40 bg-emerald-500/[0.08]"
                : "border-amber-400/40 bg-amber-400/[0.08]"
            }`}
          >
            <span className="mt-0.5 shrink-0">
              {acknowledged ? (
                <IconCheck size={15} strokeWidth={2.6} className="text-emerald-600 dark:text-emerald-400" />
              ) : (
                <IconAlertTriangle size={15} strokeWidth={2.4} className="text-amber-600 dark:text-amber-400" />
              )}
            </span>
            <span className="text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">
              {capNote} {acknowledged ? "Confirmed." : "Tap to confirm."}
            </span>
          </button>
        )}

        {review.blockers.length > 0 && (
          <ul className="flex flex-col gap-1">
            {review.blockers.map((b) => (
              <li key={b} className="text-[12px] font-medium text-rose-600 dark:text-rose-400">
                {b}
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-full border border-neutral-200 px-4 py-3 text-[14px] font-bold text-neutral-700 hover:bg-neutral-50 dark:border-white/[0.1] dark:text-neutral-200 dark:hover:bg-white/[0.04]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => { haptic("medium"); onConfirm(effective); close(); }}
            className="flex-[2] rounded-full bg-[#00A63E] px-4 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#008236] disabled:opacity-40 dark:bg-[#2FD46E] dark:text-neutral-950 dark:hover:bg-[#2FD46E]/90"
          >
            {ready ? "Add to my plan" : "Fix the above first"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function countChips(counts: CreationCounts): string[] {
  const order: Array<[keyof CreationCounts, string]> = [
    ["plans", "plan"], ["tasks", "task"], ["milestones", "milestone"],
    ["subtasks", "step"], ["trackers", "tracker"], ["rituals", "routine"],
  ];
  const out: string[] = [];
  for (const [key, noun] of order) {
    const n = counts[key] ?? 0;
    if (n > 0) out.push(`${n} ${noun}${n === 1 ? "" : "s"}`);
  }
  return out.length > 0 ? out : ["No new items"];
}

function planCandidates(
  match: { status: string; candidates?: Plan[] },
  allPlans: Plan[],
): Array<{ key: string; label: string }> {
  // Ambiguous offers the tied names; anything else offers every plan, since the
  // user has to pick from scratch.
  const list = match.status === "ambiguous" && match.candidates ? match.candidates : allPlans;
  return list.map((p) => ({ key: p.id, label: p.title }));
}

function taskCandidateOptions(
  match: { status: string; candidates?: TaskCandidate[] },
): Array<{ key: string; label: string }> {
  return (match.candidates ?? []).map((t) => ({ key: t.id, label: t.title }));
}
