import { Pressable, View } from 'react-native';
import { IconAlertCircle, IconChevronRight } from '@tabler/icons-react-native';
import type { GoalPaceRow } from '@planr/core/lib/overview';
import { accentStyles } from '@planr/core/lib/colorSystem';
import { haptic } from '../../lib/haptics';
import { CARD } from '../ui/surfaces';
import HealthBadge, { HEALTH_FILL } from '../ui/HealthBadge';
import ProgressBar from '../ui/ProgressBar';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import Button from '../ui/Button';

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
  onAdaptMilestone,
}: {
  rows: GoalPaceRow[];
  totalCount: number;
  onOpenPlan: (planId: string) => void;
  onSeeAll: () => void;
  /** A slipping milestone's "Update plan": the adapt-milestone sheet. */
  onAdaptMilestone?: (milestoneId: string) => void;
}) {
  if (rows.length === 0) return null;

  return (
    <View testID="overview-goal-pace" className={`${CARD} px-2 pb-1 pt-3`}>
      <View className="flex-row items-center justify-between gap-3 px-2">
        <Text accessibilityRole="header" className="text-[16px] font-bold text-neutral-950 dark:text-white">
          Goals & milestones
        </Text>
        {totalCount > rows.length && (
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              haptic('light');
              onSeeAll();
            }}
            className="-my-2"
          >
            {`See all ${totalCount}`}
          </Button>
        )}
      </View>

      <View className="mt-1">
        {rows.map(({ plan, milestone, state, callout }, index) =>
          milestone ? (
            <View key={plan.id} className={index > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptic('light');
                onOpenPlan(plan.id);
              }}
              className="min-h-[56px] w-full flex-row items-center gap-3 rounded-xl px-2 py-2.5 active:bg-neutral-50 dark:active:bg-white/[0.03]"
            >
              <View className={`h-2.5 w-2.5 shrink-0 rounded-full ${accentStyles(plan.color).dot}`} />
              <View className="min-w-0 flex-1">
                <Text className="truncate text-[15px] font-bold text-neutral-950 dark:text-white">{milestone.title}</Text>
                <Text className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
                  {plan.title} · due {formatShortDate(milestone.plannedEndDate)}
                </Text>
                {/* How far along it is, so a slipping goal reads before its badge is read. */}
                {state && state.overallProgress !== null && (
                  <View className="mt-2 flex-row items-center gap-2">
                    <ProgressBar pct={state.overallProgress} height={5} fillClassName={HEALTH_FILL[state.health]} className="flex-1" />
                    <Text className="w-9 shrink-0 text-right text-[11.5px] font-bold tabular-nums text-neutral-600 dark:text-neutral-400">
                      {state.overallProgress}%
                    </Text>
                  </View>
                )}
              </View>
              {state && <HealthBadge health={state.health} />}
              <Icon icon={IconChevronRight} size={16} strokeWidth={2.2} className="shrink-0 text-neutral-400 dark:text-neutral-500" />
            </Pressable>
            {/* What to do about a slipping milestone — the milestone half of
                the old Needs attention card, under the goal it belongs to. */}
            {callout && (
              <View className="mx-2 mb-3 flex-row items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 dark:bg-amber-400/10">
                <Icon icon={IconAlertCircle} size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
                <View className="min-w-0 flex-1">
                  <Text className="text-[13px] font-medium leading-snug text-amber-900 dark:text-amber-200">{callout.text}</Text>
                  {onAdaptMilestone && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        haptic('light');
                        onAdaptMilestone(callout.milestoneId);
                      }}
                      className="-ml-3.5 mt-1 self-start"
                    >
                      Update plan
                    </Button>
                  )}
                </View>
              </View>
            )}
            </View>
          ) : null,
        )}
      </View>
    </View>
  );
}
