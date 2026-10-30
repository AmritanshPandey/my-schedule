"use client";

import { useState } from "react";
import { IconCircleCheck, IconFlag3, IconPlus, IconX } from "@tabler/icons-react";
import type { Milestone } from "@/lib/useScheduleDB";
import { linkableMilestones, milestonesForItem, type MilestoneLinkKind } from "@/lib/milestoneLinks";
import { haptic } from "@/lib/haptics";

/**
 * The item side of a milestone link — which milestones this task, tracker or
 * routine advances, with a way to link or unlink one without leaving the item.
 * The link itself still lives on the milestone (lib/milestoneLinks.ts); this
 * only reads and toggles it.
 */
export default function MilestoneLinks({
  milestones,
  kind,
  itemId,
  planId,
  onSetLink,
  hideIds,
  className = "",
}: {
  milestones: readonly Milestone[];
  kind: MilestoneLinkKind;
  itemId: string;
  /** Limit the picker to one plan's milestones (tasks and trackers). Omit for routines. */
  planId?: string;
  onSetLink: (milestoneId: string, kind: MilestoneLinkKind, itemId: string, linked: boolean) => void;
  /** Milestones the surrounding card already shows (Tracking's milestone panel), so they aren't listed twice. */
  hideIds?: readonly string[];
  className?: string;
}) {
  const [picking, setPicking] = useState(false);
  const linked = milestonesForItem(milestones, kind, itemId);
  const linkedIds = new Set(linked.map((m) => m.id));
  const options = linkableMilestones(milestones, planId).filter((m) => !linkedIds.has(m.id));
  const shown = hideIds ? linked.filter((m) => !hideIds.includes(m.id)) : linked;
  if (shown.length === 0 && options.length === 0) return null;
  // A link is only shown as missing when there truly is none; one the card
  // already shows elsewhere just isn't repeated.
  const label = shown.length > 0 ? (shown.length < linked.length ? "Also advances" : "Advances") : linked.length === 0 ? "Not linked to a milestone" : null;

  return (
    <div className={className} data-testid={`milestone-links-${kind}`}>
      {label && (
        <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">
          {label}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {shown.map((m) => {
          // A finished milestone is history: it stays listed, but unlinking
          // it now would quietly rewrite how it was measured.
          const done = m.status === "completed" || !!m.actualCompletedDate;
          return (
            <span
              key={m.id}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border border-neutral-200 pl-3 text-[12.5px] font-bold dark:border-white/10 ${
                done ? "pr-3 text-neutral-500 dark:text-neutral-400" : "pr-1 text-neutral-700 dark:text-neutral-200"
              }`}
            >
              {done ? (
                <IconCircleCheck size={13} strokeWidth={2} className="shrink-0" aria-label="Completed" />
              ) : (
                <IconFlag3 size={13} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden="true" />
              )}
              <span className="max-w-[180px] truncate">{m.title}</span>
              {!done && (
                <button
                  type="button"
                  onClick={() => { haptic("light"); onSetLink(m.id, kind, itemId, false); }}
                  aria-label={`Unlink from ${m.title}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-rose-600 active:scale-[0.98] dark:text-neutral-400 dark:hover:bg-white/[0.06] dark:hover:text-rose-400"
                >
                  <IconX size={13} strokeWidth={2.5} />
                </button>
              )}
            </span>
          );
        })}
        {options.length > 0 && !picking && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-[12.5px] font-bold text-neutral-600 transition-colors hover:bg-neutral-100 active:scale-[0.98] dark:text-neutral-300 dark:hover:bg-white/[0.06]"
          >
            <IconPlus size={13} strokeWidth={2.5} />
            Link to milestone
          </button>
        )}
      </div>
      {picking && options.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {options.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { haptic("light"); onSetLink(m.id, kind, itemId, true); setPicking(false); }}
              className="min-h-11 rounded-full border border-dashed border-neutral-300 px-3 text-[12.5px] font-semibold text-neutral-600 transition-colors hover:border-neutral-400 hover:bg-neutral-50 active:scale-[0.98] dark:border-white/15 dark:text-neutral-300 dark:hover:bg-white/[0.04]"
            >
              + {m.title}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="min-h-11 rounded-full px-3 text-[12.5px] font-semibold text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
