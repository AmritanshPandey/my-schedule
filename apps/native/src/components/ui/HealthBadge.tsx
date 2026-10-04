import { View } from 'react-native';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDot,
  IconTrendingUp,
} from '@tabler/icons-react-native';
import type { GoalHealth } from '@planr/core/lib/goalProgress';
import { Icon, type TablerIcon } from './Icon';
import { Text } from './Text';

/**
 * Native port of components/ui/HealthBadge.tsx — the one health badge, shared
 * by milestones and goals so the two surfaces read the same vocabulary.
 * Each web className is split into its fill and its text color.
 */
export const HEALTH_BADGE: Record<GoalHealth, { Icon: TablerIcon; label: string; box: string; text: string }> = {
  completed: { Icon: IconCircleCheck, label: 'Completed', box: 'bg-neutral-100 dark:bg-white/[0.06]', text: 'text-neutral-500 dark:text-neutral-400' },
  not_started: { Icon: IconCircleDashed, label: 'Not started', box: 'bg-neutral-100 dark:bg-white/[0.06]', text: 'text-neutral-500 dark:text-neutral-400' },
  no_plans: { Icon: IconCircleDashed, label: 'Not set up', box: 'bg-neutral-100 dark:bg-white/[0.06]', text: 'text-neutral-500 dark:text-neutral-400' },
  getting_started: { Icon: IconCircleDot, label: 'Getting started', box: 'bg-sky-50 dark:bg-sky-500/10', text: 'text-sky-700 dark:text-sky-400' },
  ahead: { Icon: IconTrendingUp, label: 'Ahead', box: 'bg-green-50 dark:bg-green-500/10', text: 'text-green-700 dark:text-green-400' },
  on_track: { Icon: IconCircleCheck, label: 'On track', box: 'bg-green-50 dark:bg-green-500/10', text: 'text-green-700 dark:text-green-400' },
  at_risk: { Icon: IconAlertTriangle, label: 'At risk', box: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700 dark:text-amber-400' },
  delayed: { Icon: IconAlertCircle, label: 'Delayed', box: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-700 dark:text-rose-400' },
};

/** The fill colour a progress bar should use for a given health. */
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

export default function HealthBadge({ health, size = 'sm' }: { health: GoalHealth; size?: 'sm' | 'md' }) {
  const cfg = HEALTH_BADGE[health];
  return (
    <View
      accessibilityLabel={cfg.label}
      className={`shrink-0 flex-row items-center gap-1 self-start rounded-full ${cfg.box} ${size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5'}`}
    >
      <Icon icon={cfg.Icon} size={size === 'md' ? 14 : 12} strokeWidth={2.2} className={`shrink-0 ${cfg.text}`} />
      <Text className={`font-bold ${cfg.text} ${size === 'md' ? 'text-[12px]' : 'text-[10.5px]'}`}>{cfg.label}</Text>
    </View>
  );
}
