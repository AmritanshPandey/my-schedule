import { Pressable, View } from 'react-native';
import { IconChevronRight } from '@tabler/icons-react-native';
import type { GoalPaceRow } from '@planr/core/lib/overview';
import { accentStyles } from '@planr/core/lib/colorSystem';
import { haptic } from '../../lib/haptics';
import { CARD } from '../ui/surfaces';
import HealthBadge from '../ui/HealthBadge';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Native port of components/overview/GoalPaceCard.tsx (the `compact`
 * variant): each running plan's next milestone and its health, worst first.
 * Renders nothing when no plan has a milestone to pace.
 */
export default function GoalPaceCard({
  rows,
  totalCount,
  onOpenPlan,
  onSeeAll,
}: {
  rows: GoalPaceRow[];
  totalCount: number;
  onOpenPlan: (planId: string) => void;
  onSeeAll: () => void;
}) {
  if (rows.length === 0) return null;

  return (
    <View testID="overview-goal-pace" className={`${CARD} px-2 pb-1 pt-3`}>
      <View className="flex-row items-center justify-between gap-3 px-2">
        <Text accessibilityRole="header" className="text-[14px] font-bold text-neutral-950 dark:text-white">
          Goals on pace
        </Text>
        {totalCount > rows.length && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              haptic('light');
              onSeeAll();
            }}
            className="-my-2 min-h-[44px] justify-center px-1"
          >
            <Text className="text-[13px] font-bold text-neutral-600 dark:text-neutral-400">See all {totalCount}</Text>
          </Pressable>
        )}
      </View>

      <View className="mt-1">
        {rows.map(({ plan, milestone, state }, index) =>
          milestone ? (
            <Pressable
              key={plan.id}
              accessibilityRole="button"
              onPress={() => {
                haptic('light');
                onOpenPlan(plan.id);
              }}
              className={`min-h-[56px] w-full flex-row items-center gap-3 rounded-xl px-2 py-2.5 active:bg-neutral-50 dark:active:bg-white/[0.03] ${
                index > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''
              }`}
            >
              <View className={`h-2.5 w-2.5 shrink-0 rounded-full ${accentStyles(plan.color).dot}`} />
              <View className="min-w-0 flex-1">
                <Text className="truncate text-[15px] font-bold text-neutral-950 dark:text-white">{milestone.title}</Text>
                <Text className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                  {plan.title} · due {formatShortDate(milestone.plannedEndDate)}
                </Text>
              </View>
              {state && <HealthBadge health={state.health} />}
              <Icon icon={IconChevronRight} size={16} strokeWidth={2.2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
            </Pressable>
          ) : null,
        )}
      </View>
    </View>
  );
}
