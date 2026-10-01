import type { GoalHealth } from '../components/HealthBadge';

/** The progress-bar fill class for a given health — native port of
 *  components/ui/HealthBadge.tsx's HEALTH_FILL. */
export const HEALTH_FILL: Record<GoalHealth, string> = {
  completed: 'bg-neutral-400 dark:bg-neutral-500',
  not_started: 'bg-neutral-300 dark:bg-neutral-600',
  no_plans: 'bg-neutral-300 dark:bg-neutral-600',
  getting_started: 'bg-sky-500',
  ahead: 'bg-green-500',
  on_track: 'bg-emerald-500',
  at_risk: 'bg-amber-500',
  delayed: 'bg-rose-500',
};
