"use client";

import { IconArrowRight, IconChevronRight, IconTarget } from "@tabler/icons-react";
import type { GoalPaceRow } from "@/lib/overview";
import { accentStyles } from "@/lib/colorSystem";
import { haptic } from "@/lib/haptics";
import { CARD } from "@/components/ui/surfaces";
import HealthBadge, { HEALTH_FILL } from "@/components/ui/HealthBadge";
import ProgressBar from "@/components/ui/ProgressBar";
import Button from "@/components/ui/Button";

function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * "Are my goals moving?": each running plan's next milestone and its pace,
 * worst first. Health comes from the same calculateMilestoneState call Plan
 * detail uses, so the badge here and the badge there always agree.
 *
 * `compact` (mobile) lists milestones only, a few rows deep. The full
 * variant (desktop review) adds progress against expected, the status
 * sentence, and plans that have no milestones yet.
 */
export default function GoalPaceCard({
  rows,
  totalCount,
  compact = false,
  onOpenPlan,
  onSeeAll,
}: {
  rows: GoalPaceRow[];
  totalCount: number;
  compact?: boolean;
  onOpenPlan: (planId: string) => void;
  onSeeAll?: () => void;
}) {
  if (rows.length === 0) {
    if (compact) return null;
    return (
      <section data-testid="overview-goal-pace" className={`${CARD} p-4`}>
        <p className="text-[14px] font-bold text-neutral-950 dark:text-white">Goals &amp; milestones</p>
        <div className="mt-3 rounded-xl border border-dashed border-neutral-200 px-4 py-5 text-center dark:border-white/[0.09]">
          <IconTarget size={22} strokeWidth={2} className="mx-auto text-neutral-400" aria-hidden />
          <p className="mt-2 text-[13px] text-neutral-600 dark:text-neutral-400">No active plans. Create a plan with milestones to see its pace here.</p>
          {onSeeAll && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => { haptic("light"); onSeeAll(); }}
              trailingIcon={<IconArrowRight size={16} strokeWidth={2.5} />}
              className="mt-3"
            >
              Open plans
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section data-testid="overview-goal-pace" className={`${CARD} ${compact ? "px-2 pb-1 pt-3" : "p-4"}`}>
      <div className={`flex items-center justify-between gap-3 ${compact ? "px-2" : ""}`}>
        <p className="text-[14px] font-bold text-neutral-950 dark:text-white">{compact ? "Goals on pace" : "Goals & milestones"}</p>
        {onSeeAll && totalCount > rows.length && (
          <Button variant="ghost" size="sm" onClick={() => { haptic("light"); onSeeAll(); }} className="-my-2">
            See all {totalCount}
          </Button>
        )}
      </div>

      <ul className={`${compact ? "mt-1" : "mt-2"} divide-y divide-neutral-100 dark:divide-white/[0.06]`}>
        {rows.map(({ plan, milestone, state, milestonesDone, milestonesTotal, consistency }) => (
          <li key={plan.id}>
            <button
              type="button"
              onClick={() => { haptic("light"); onOpenPlan(plan.id); }}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl text-left transition-colors active:bg-neutral-50 lg:hover:bg-neutral-50/80 dark:active:bg-white/[0.03] dark:lg:hover:bg-white/[0.03] ${
                compact ? "px-2 py-2.5" : "-mx-2 w-[calc(100%+16px)] px-2 py-3"
              }`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accentStyles(plan.color).dot}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[15px] font-bold text-neutral-950 dark:text-white">
                    {compact && milestone ? milestone.title : plan.title}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                  {milestone
                    ? compact
                      ? `${plan.title} · due ${formatShortDate(milestone.plannedEndDate)}`
                      : `${milestone.title} · due ${formatShortDate(milestone.plannedEndDate)} · ${milestonesDone} of ${milestonesTotal} milestones`
                    : milestonesTotal > 0
                      ? `All ${milestonesTotal} milestones done · ${consistency}% of days active`
                      : `No milestones yet · ${consistency}% of days active`}
                </span>
                {state && (
                  <>
                    {state.overallProgress !== null && (
                      <span className="mt-2 flex items-center gap-2">
                        <ProgressBar
                          pct={state.overallProgress}
                          height={5}
                          className="flex-1"
                          fillClassName={HEALTH_FILL[state.health]}
                        />
                        <span className="w-9 shrink-0 text-right text-[11.5px] font-bold tabular-nums text-neutral-600 dark:text-neutral-400">
                          {state.overallProgress}%
                        </span>
                      </span>
                    )}
                    {!compact && (
                      <span className="mt-1.5 line-clamp-2 block text-[12px] leading-snug text-neutral-600 dark:text-neutral-400">
                        {state.statusMessage}
                      </span>
                    )}
                  </>
                )}
              </span>
              {state ? <HealthBadge health={state.health} /> : null}
              {compact && <IconChevronRight size={16} strokeWidth={2.2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
