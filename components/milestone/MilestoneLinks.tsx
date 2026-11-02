"use client";

import { useState } from "react";
import { IconCircleCheck, IconFlag3, IconPlus, IconX } from "@tabler/icons-react";
import type { Milestone, ProgressTracker, Schedule, Task } from "@/lib/useScheduleDB";
import { linkableMilestones, milestonesForItem, type MilestoneLinkKind } from "@/lib/milestoneLinks";
import { resolveMilestoneLinks } from "@/lib/milestoneAutoLinks";
import { haptic } from "@/lib/haptics";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";

function handLinks(milestone: Milestone | undefined, kind: MilestoneLinkKind): string[] {
  if (!milestone) return [];
  return (kind === "task" ? milestone.linkedActivities : kind === "tracker" ? milestone.linkedTrackers : milestone.linkedRituals) ?? [];
}

/**
 * The item side of a milestone link — which milestones this task, tracker or
 * routine advances, with a way to link or unlink one without leaving the item.
 * The link itself still lives on the milestone (lib/milestoneLinks.ts); this
 * only reads and toggles it.
 *
 * Given the schedule's activities and trackers, it also shows the milestones
 * that count this item automatically — the plan's own work, due in their
 * dates (lib/milestoneAutoLinks.ts) — marked "Auto", so "Not linked" only
 * ever means nothing is counting it.
 */
export default function MilestoneLinks({
  milestones,
  kind,
  itemId,
  planId,
  onSetLink,
  hideIds,
  activities,
  trackers,
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
  /** The schedule's activities — lets a task show milestones that count it automatically. */
  activities?: Schedule["activities"];
  /** Every tracker — lets a plan's only tracker show the milestones that use it automatically. */
  trackers?: readonly ProgressTracker[];
  className?: string;
}) {
  const [picking, setPicking] = useState(false);
  const resolved = activities || trackers
    ? resolveMilestoneLinks(milestones, activities as unknown as Record<string, Task[]> | undefined, trackers)
    : milestones;
  const linked = milestonesForItem(resolved, kind, itemId);
  // Counted because the milestone has no hand-made links of this kind.
  const auto = new Set(linked.filter((m) => handLinks(milestones.find((raw) => raw.id === m.id), kind).length === 0).map((m) => m.id));
  const linkedIds = new Set(linked.map((m) => m.id));
  const options = linkableMilestones(milestones, planId).filter((m) => !linkedIds.has(m.id));
  const shown = hideIds ? linked.filter((m) => !hideIds.includes(m.id)) : linked;
  if (shown.length === 0 && options.length === 0) return null;
  // A link is only shown as missing when there truly is none; one the card
  // already shows elsewhere just isn't repeated.
  const label = shown.length > 0 ? (shown.length < linked.length ? "Also advances" : "Advances") : linked.length === 0 ? "Not counted toward a milestone" : null;

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
              {auto.has(m.id) && (
                <span
                  title="Counted automatically: part of this plan and due in these dates"
                  className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-neutral-600 dark:bg-white/[0.07] dark:text-neutral-300"
                >
                  Auto
                </span>
              )}
              {!done && (
                <IconButton label={`Unlink from ${m.title}`} variant="destructive" size="md" onClick={() => { haptic("light"); onSetLink(m.id, kind, itemId, false); }}>
                  <IconX size={16} strokeWidth={2.5} />
                </IconButton>
              )}
            </span>
          );
        })}
        {options.length > 0 && !picking && (
          <Button variant="ghost" size="md" onClick={() => setPicking(true)} icon={<IconPlus size={16} strokeWidth={2.5} />}>
            Link to milestone
          </Button>
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
