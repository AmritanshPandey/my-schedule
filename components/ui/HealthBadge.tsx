"use client";

import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDot,
  IconTrendingUp,
  type IconProps,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import type { GoalHealth } from "@/lib/goalProgress";

/**
 * The one health badge in the app.
 *
 * Milestone health and goal health share a vocabulary on purpose (see
 * lib/goalProgress.ts): a goal reading "At risk" above milestone rows that also
 * read "At risk" is the only way the two surfaces can agree. Keeping a second
 * copy of this colour map next to each surface is exactly how they stop
 * agreeing, so it lives here and both import it.
 *
 * `GoalHealth` is a superset of `MilestoneState["health"]` — it adds the
 * `no_plans` setup state, which is deliberately neutral rather than red: a goal
 * with nothing linked yet is an empty form, not a failing goal.
 */
/**
 * Icons rather than emoji, and a distinct *shape* per state rather than a
 * coloured dot: the colour already carries the ramp, so a badge that varies
 * only by hue says nothing to anyone reading it in greyscale or with a colour
 * vision deficiency. The label remains the accessible name — the icon is
 * decorative reinforcement, which is why it stays aria-hidden.
 */
export const HEALTH_BADGE: Record<
  GoalHealth,
  { Icon: ComponentType<IconProps>; label: string; className: string }
> = {
  completed:       { Icon: IconCircleCheck,  label: "Completed",       className: "bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400" },
  not_started:     { Icon: IconCircleDashed, label: "Not started",     className: "bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400" },
  no_plans:        { Icon: IconCircleDashed, label: "Not set up",      className: "bg-neutral-100 text-neutral-500 dark:bg-white/[0.06] dark:text-neutral-400" },
  getting_started: { Icon: IconCircleDot,    label: "Getting started", className: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400" },
  ahead:           { Icon: IconTrendingUp,   label: "Ahead",           className: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400" },
  on_track:        { Icon: IconCircleCheck,  label: "On track",        className: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400" },
  at_risk:         { Icon: IconAlertTriangle,label: "At risk",         className: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  delayed:         { Icon: IconAlertCircle,  label: "Delayed",         className: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400" },
};

/** The fill colour a progress bar should use for a given health. */
export const HEALTH_FILL: Record<GoalHealth, string> = {
  completed:       "bg-neutral-400 dark:bg-neutral-500",
  not_started:     "bg-neutral-300 dark:bg-neutral-600",
  no_plans:        "bg-neutral-300 dark:bg-neutral-600",
  getting_started: "bg-sky-500",
  ahead:           "bg-green-500",
  on_track:        "bg-emerald-500",
  at_risk:         "bg-amber-500",
  delayed:         "bg-rose-500",
};

export default function HealthBadge({
  health,
  size = "sm",
}: {
  health: GoalHealth;
  size?: "sm" | "md";
}) {
  const cfg = HEALTH_BADGE[health];
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full font-bold ${cfg.className} ${
        size === "md" ? "px-2.5 py-1 text-[12px]" : "px-2 py-0.5 text-[10.5px]"
      }`}
    >
      <Icon size={size === "md" ? 14 : 12} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
      {cfg.label}
    </span>
  );
}
