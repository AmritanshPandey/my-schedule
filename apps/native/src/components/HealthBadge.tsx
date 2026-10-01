import { Text, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDot,
  IconTrendingUp,
} from '@tabler/icons-react-native';
import type { MilestoneHealth } from '@planr/core/lib/milestoneHealth';

/** MilestoneHealth plus the one extra state a Goal with nothing linked yet
 *  can be in — mirrors components/ui/HealthBadge.tsx's GoalHealth exactly,
 *  so milestones and goals read the same vocabulary here too. */
export type GoalHealth = MilestoneHealth | 'no_plans';

/**
 * Exact light/dark pairs from components/ui/HealthBadge.tsx's HEALTH_BADGE
 * map (`bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400`, etc.)
 * — copied as literal hex rather than re-derived, so this reads identically
 * to the web badge rather than a close approximation.
 */
const CONFIG: Record<GoalHealth, { label: string; light: string; dark: string; Icon: typeof IconCircleCheck }> = {
  completed: { label: 'Completed', light: '#737373', dark: '#A3A3A3', Icon: IconCircleCheck },
  not_started: { label: 'Not started', light: '#737373', dark: '#A3A3A3', Icon: IconCircleDashed },
  no_plans: { label: 'Not set up', light: '#737373', dark: '#A3A3A3', Icon: IconCircleDashed },
  getting_started: { label: 'Getting started', light: '#0369A1', dark: '#38BDF8', Icon: IconCircleDot },
  ahead: { label: 'Ahead', light: '#15803D', dark: '#4ADE80', Icon: IconTrendingUp },
  on_track: { label: 'On track', light: '#15803D', dark: '#4ADE80', Icon: IconCircleCheck },
  at_risk: { label: 'At risk', light: '#B45309', dark: '#FBBF24', Icon: IconAlertTriangle },
  delayed: { label: 'Delayed', light: '#BE123C', dark: '#FB7185', Icon: IconAlertCircle },
};

/**
 * Native port of components/ui/HealthBadge.tsx — same vocabulary/color ramp,
 * shared between the Milestones and Goals screens for the same reason it's
 * shared on web: a goal reading "At risk" above milestone rows that also
 * read "At risk" is the only way the two surfaces agree.
 */
export default function HealthBadge({ health, size = 'sm' }: { health: GoalHealth; size?: 'sm' | 'md' }) {
  const { colorScheme } = useColorScheme();
  const cfg = CONFIG[health];
  const color = colorScheme === 'dark' ? cfg.dark : cfg.light;
  const iconSize = size === 'md' ? 13 : 11;
  return (
    <View
      className={`flex-row items-center gap-1 self-start rounded-full ${size === 'md' ? 'px-2.5 py-1' : 'px-2 py-0.5'}`}
      style={{ backgroundColor: color + '1A' }}
    >
      <cfg.Icon size={iconSize} strokeWidth={2.4} color={color} />
      <Text style={{ color }} className={`font-bold ${size === 'md' ? 'text-[12px]' : 'text-[10.5px]'}`}>
        {cfg.label}
      </Text>
    </View>
  );
}
