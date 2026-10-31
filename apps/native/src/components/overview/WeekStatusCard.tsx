import { Pressable, View } from 'react-native';
import { IconFlame } from '@tabler/icons-react-native';
import { WEEK_VERDICT_LABEL, statusTone, type StatusTone, type WeekStatus, type WeekVerdict } from '@planr/core/lib/overview';
import { haptic } from '../../lib/haptics';
import { CARD } from '../ui/surfaces';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const TONE_FILL: Record<StatusTone, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-400',
  bad: 'bg-rose-400',
  none: 'bg-neutral-300 dark:bg-white/15',
};

const VERDICT_PILL: Record<WeekVerdict, { box: string; text: string }> = {
  'on-track': { box: 'bg-emerald-500/10 dark:bg-emerald-400/10', text: 'text-emerald-700 dark:text-emerald-400' },
  'at-risk': { box: 'bg-amber-500/12 dark:bg-amber-400/12', text: 'text-amber-700 dark:text-amber-300' },
  behind: { box: 'bg-rose-500/10 dark:bg-rose-400/10', text: 'text-rose-700 dark:text-rose-300' },
};

/**
 * Native port of components/overview/WeekStatusCard.tsx (the `compact`
 * variant): the verdict, the seven week bars, and one meta line with missed
 * and the streak. Tapping it opens the week on Today.
 */
export default function WeekStatusCard({ status, onOpen }: { status: WeekStatus; onOpen: () => void }) {
  const { days, verdict, verdictPct, tasksDone, tasksTotal, missed, streak, hasData } = status;

  if (!hasData) {
    return (
      <View testID="overview-week-status" className={`${CARD} p-4`}>
        <Text className="text-[14px] font-bold text-neutral-950 dark:text-white">This week</Text>
        <Text className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          Nothing is scheduled this week yet. Add a task or routine and your week shows up here.
        </Text>
      </View>
    );
  }

  const meta = [`${tasksDone} of ${tasksTotal} tasks`, missed > 0 ? `${missed} missed` : null].filter(Boolean).join(' · ');
  const summary = [
    verdict ? `${WEEK_VERDICT_LABEL[verdict]}, ${verdictPct}% of what's due so far` : "Fresh week, nothing's due yet",
    meta,
    streak.streak > 0 ? `${streak.streak}-day streak${streak.atRisk ? ', at risk' : ''}` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View testID="overview-week-status" className={`${CARD} p-0`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`This week. ${summary}`}
        onPress={() => {
          haptic('light');
          onOpen();
        }}
        className="rounded-2xl p-4 active:bg-neutral-50 dark:active:bg-white/[0.03]"
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-[14px] font-bold text-neutral-950 dark:text-white">This week</Text>
            {verdict ? (
              <View className="mt-1.5 flex-row items-baseline gap-2">
                <Text className="text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-neutral-950 dark:text-white">
                  {verdictPct}
                  <Text className="text-[17px] font-extrabold text-neutral-950 dark:text-white">%</Text>
                </Text>
                <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400">of what's due so far</Text>
              </View>
            ) : (
              <Text className="mt-1.5 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Fresh week. Nothing is due yet.</Text>
            )}
          </View>
          {verdict && (
            <View className={`shrink-0 rounded-full px-2.5 py-1 ${VERDICT_PILL[verdict].box}`}>
              <Text className={`text-[12px] font-bold ${VERDICT_PILL[verdict].text}`}>{WEEK_VERDICT_LABEL[verdict]}</Text>
            </View>
          )}
        </View>

        {/* Week bars. Future days are dimmed: they are the plan, not the record. */}
        <View className="mt-3 flex-row gap-1.5" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {days.map((day) => (
            <View key={day.day} className={`flex-1 items-center gap-1.5 ${day.isFuture ? 'opacity-45' : ''}`}>
              <View
                className={`h-12 w-full max-w-[34px] justify-end overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.07] ${
                  day.isToday ? 'border-2 border-[#00A63E] dark:border-[#2FD46E]' : ''
                }`}
              >
                <View
                  className={`w-full rounded-full ${TONE_FILL[statusTone(day.pct)]}`}
                  style={{ height: `${day.total > 0 ? Math.max(day.pct, day.pct > 0 ? 8 : 0) : 0}%` }}
                />
              </View>
              <Text className={`text-[11px] font-bold leading-none ${day.isToday ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
                {day.label}
              </Text>
            </View>
          ))}
        </View>

        <View className="mt-3 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-neutral-200/70 pt-3 dark:border-white/[0.07]">
          <Text className="text-[12.5px] font-medium tabular-nums text-neutral-600 dark:text-neutral-400">{meta}</Text>
          {streak.streak > 0 && (
            <View className="flex-row items-center gap-1">
              <Icon
                icon={IconFlame}
                size={14}
                strokeWidth={2.2}
                className={streak.atRisk ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}
              />
              <Text
                className={`text-[12.5px] font-bold tabular-nums ${streak.atRisk ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400'}`}
              >
                {streak.atRisk ? `${streak.streak}-day streak · do one thing today` : `${streak.streak}-day streak`}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
}
