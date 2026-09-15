"use client";

import { useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconCheck } from "@tabler/icons-react";
import type { Milestone, Plan, Schedule } from "@/lib/useScheduleDB";
import type { MilestoneState } from "@/lib/milestoneHealth";
import {
  proposeAdaptations,
  type Adaptation,
  type AdaptationOffer,
} from "@/lib/milestoneAdaptation";
import BottomSheet from "@/components/ui/BottomSheet";
import SheetHeader from "@/components/ui/SheetHeader";
import Button from "@/components/ui/Button";
import Toggle from "@/components/ui/Toggle";
import EmptyState from "@/components/ui/EmptyState";
import { IconTargetArrow } from "@tabler/icons-react";

interface AdaptMilestoneSheetProps {
  open: boolean;
  onClose: () => void;
  milestone: Milestone;
  plan: Plan;
  state: MilestoneState;
  schedule: Schedule;
  /** Parent owns the mutation, mirroring how every other sheet here works. */
  onApply: (adaptation: Adaptation) => void;
}

/**
 * The treatment side of milestone health.
 *
 * The health engine already says "at your current pace this finishes twelve
 * days late". This sheet is what the user does about it — the options from
 * lib/milestoneAdaptation.ts, each stating its own consequences before it is
 * chosen.
 *
 * Nothing applies on selection. Picking an option only expands it; a separate,
 * explicit Apply commits, and the changes are listed verbatim above that
 * button. That is PP-06 ("PlanR recommends, the user decides") and UX-07
 * ("material changes should be reviewable") made literal — the same
 * review-then-commit shape as components/ai/AIReviewSheet.tsx.
 */
export default function AdaptMilestoneSheet({
  open,
  onClose,
  milestone,
  plan,
  state,
  schedule,
  onApply,
}: AdaptMilestoneSheetProps) {
  const offers = useMemo(
    () => (open ? proposeAdaptations({ milestone, plan, state, schedule }) : []),
    [open, milestone, plan, state, schedule],
  );

  const [selectedKind, setSelectedKind] = useState<Adaptation["kind"] | null>(null);
  // Cascade is a property of the chosen extension, not of the offer list, so
  // it lives here and is merged in at apply time.
  const [cascade, setCascade] = useState(true);

  useEffect(() => {
    if (!open) return;
    // Preselect the first (cheapest) option so the common case is one tap,
    // without ever pre-committing it.
    setSelectedKind(offers[0]?.adaptation.kind ?? null);
    const extend = offers.find((o) => o.adaptation.kind === "extend_target");
    setCascade(extend?.adaptation.kind === "extend_target" ? extend.adaptation.cascade : true);
  }, [open, offers]);

  const selected = offers.find((o) => o.adaptation.kind === selectedKind) ?? null;

  function handleApply() {
    if (!selected) return;
    const adaptation =
      selected.adaptation.kind === "extend_target"
        ? { ...selected.adaptation, cascade }
        : selected.adaptation;
    onApply(adaptation);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="space-y-4 p-5 pb-8">
        <SheetHeader eyebrow="Adjust" title={milestone.title} onClose={onClose} />

        {offers.length === 0 ? (
          <EmptyState
            icon={IconTargetArrow}
            title="Nothing to adjust yet"
            description="This milestone has no linked tasks or tracker, so there's no pace to correct. Link the work it's measured by first."
          />
        ) : (
          <>
            {/* The diagnosis, restated. The user may have arrived from a badge
                rather than from the detail view, so the sheet has to say what
                it is reacting to rather than assume they just read it. */}
            <p className="text-[13px] leading-relaxed text-neutral-600 dark:text-neutral-400">
              {state.statusMessage}
            </p>

            <div className="space-y-2">
              {offers.map((offer) => (
                <OfferRow
                  key={offer.adaptation.kind}
                  offer={offer}
                  selected={offer.adaptation.kind === selectedKind}
                  onSelect={() => setSelectedKind(offer.adaptation.kind)}
                  cascade={cascade}
                  onCascadeChange={setCascade}
                />
              ))}
            </div>

            <Button fullWidth onClick={handleApply} disabled={!selected}>
              {selected ? selected.label : "Choose an adjustment"}
            </Button>

            <p className="text-center text-[11.5px] text-neutral-400 dark:text-neutral-500">
              Nothing is deleted. You can change any of this again afterwards.
            </p>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function OfferRow({
  offer,
  selected,
  onSelect,
  cascade,
  onCascadeChange,
}: {
  offer: AdaptationOffer;
  selected: boolean;
  onSelect: () => void;
  cascade: boolean;
  onCascadeChange: (next: boolean) => void;
}) {
  // Narrowed to the variant rather than a boolean flag, so `downstreamCount`
  // is reachable without a cast.
  const extend = offer.adaptation.kind === "extend_target" ? offer.adaptation : null;

  return (
    <div
      className={`rounded-2xl border transition-colors ${
        selected
          ? "border-emerald-500/60 bg-emerald-50/60 dark:border-emerald-500/40 dark:bg-emerald-500/[0.07]"
          : "border-neutral-200 bg-white dark:border-white/[0.08] dark:bg-neutral-900"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span
          aria-hidden
          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
            selected
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-neutral-300 dark:border-white/20"
          }`}
        >
          {selected && <IconCheck size={12} strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold text-neutral-950 dark:text-white">
            {offer.label}
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
            {offer.rationale}
          </span>
        </span>
      </button>

      {/* The diff. Only for the selected option — showing every option's
          consequences at once is a wall of text at the moment the user is
          trying to choose between them. */}
      {selected && (
        <div className="border-t border-neutral-200/70 px-4 py-3 dark:border-white/[0.08]">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-500">
            What changes
          </p>
          <ul className="space-y-1">
            {offer.changes.map((change, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-neutral-700 dark:text-neutral-300"
              >
                <IconArrowRight
                  size={13}
                  strokeWidth={2}
                  className="mt-[3px] shrink-0 text-neutral-400 dark:text-neutral-500"
                />
                <span className="min-w-0">{change}</span>
              </li>
            ))}
          </ul>

          {extend && extend.downstreamCount > 0 && (
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-200/70 pt-3 dark:border-white/[0.08]">
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-neutral-800 dark:text-neutral-200">
                  Move later milestones too
                </p>
                <p className="text-[11.5px] leading-relaxed text-neutral-500 dark:text-neutral-400">
                  {cascade
                    ? "Everything after this shifts by the same amount."
                    : "Later milestones keep their dates, so the time left for them shrinks."}
                </p>
              </div>
              <Toggle on={cascade} onChange={onCascadeChange} label="Move later milestones too" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
