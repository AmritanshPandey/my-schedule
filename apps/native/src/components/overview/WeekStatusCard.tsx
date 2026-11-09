import { Pressable, View } from 'react-native';
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react-native';
import { WEEK_VERDICT_LABEL, type WeekStatus, type WeekVerdict } from '@planr/core/lib/overview';
import { haptic } from '../../lib/haptics';
import { CARD, SOFT_PANEL } from '../ui/surfaces';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const VERDICT_PILL: Record<WeekVerdict, { box: string; text: string }> = {
  'on-track': { box: 'bg-emerald-500/10 dark:bg-emerald-400/10', text: 'text-emerald-700 dark:text-emerald-400' },
  'at-risk': { box: 'bg-amber-500/12 dark:bg-amber-400/12', text: 'text-amber-700 dark:text-amber-300' },
  behind: { box: 'bg-rose-500/10 dark:bg-rose-400/10', text: 'text-rose-700 dark:text-rose-300' },
};

/**
 * Native port of components/overview/WeekStatusCard.tsx (the `compact`
 * variant), "Weekly progress": how much of what's been due this week got done,
 * how that compares with last week, and the week's tasks and routines as
 * counts. Tapping it opens the week on Today.
 */
export default function WeekStatusCard({ status, onOpen }: { status: WeekStatus; onOpen: () => void }) {
  const { verdict, verdictPct, tasksDone, tasksTotal, routinesDone, routinesTotal, vsLastWeekPct, hasData } = status;

  if (!hasData) {
    return (
      <View testID="overview-week-status" className={`${CARD} p-4`}>
        <Text className="text-[16px] font-bold text-neutral-950 dark:text-white">Weekly progress</Text>
        <Text className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          Nothing is scheduled this week yet. Add a task or routine and your week shows up here.
        </Text>
      </View>
    );
  }

  const up = vsLastWeekPct >= 0;
  const summary = [
    verdict ? `${WEEK_VERDICT_LABEL[verdict]}, ${verdictPct}% of what's been due` : "Fresh week, nothing's due yet",
    vsLastWeekPct !== 0 ? `${up ? 'up' : 'down'} ${Math.abs(vsLastWeekPct)}% vs last week` : null,
    `${tasksDone} of ${tasksTotal} tasks done`,
    `${routinesDone} of ${routinesTotal} routines done`,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View testID="overview-week-status" className={`${CARD} p-0`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Weekly progress. ${summary}`}
        onPress={() => {
          haptic('light');
          onOpen();
        }}
        className="rounded-2xl p-4 active:bg-neutral-50 dark:active:bg-white/[0.03]"
      >
        <View className="flex-row items-start justify-between gap-3">
          <Text className="text-[16px] font-bold text-neutral-950 dark:text-white">Weekly progress</Text>
          {verdict && (
            <View className={`shrink-0 rounded-full px-2.5 py-1 ${VERDICT_PILL[verdict].box}`}>
              <Text className={`text-[12px] font-bold ${VERDICT_PILL[verdict].text}`}>{WEEK_VERDICT_LABEL[verdict]}</Text>
            </View>
          )}
        </View>

        {verdict ? (
          <>
            <Text className="mt-2 text-[40px] font-extrabold leading-none tracking-[-0.03em] tabular-nums text-neutral-950 dark:text-white">
              {verdictPct}
              <Text className="text-[22px] font-extrabold text-neutral-950 dark:text-white">%</Text>
            </Text>
            <Text className="mt-1 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">of what's been due this week</Text>
            {vsLastWeekPct !== 0 && (
              <View className="mt-2 flex-row items-center gap-1">
                <Icon
                  icon={up ? IconTrendingUp : IconTrendingDown}
                  size={16}
                  strokeWidth={2.2}
                  className={up ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}
                />
                <Text className={`text-[13px] font-bold tabular-nums ${up ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                  {`${Math.abs(vsLastWeekPct)}% vs last week`}
                </Text>
              </View>
            )}
          </>
        ) : (
          <Text className="mt-2 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">Fresh week. Nothing is due yet.</Text>
        )}

        <View className="mt-4 flex-row gap-3">
          {[
            { label: 'Tasks done', value: `${tasksDone}/${tasksTotal}` },
            { label: 'Routine done', value: `${routinesDone}/${routinesTotal}` },
          ].map((tile) => (
            <View key={tile.label} className={`${SOFT_PANEL} flex-1 px-3 py-2.5`}>
              <Text className="text-[11px] font-bold uppercase tracking-[0.6px] text-neutral-500 dark:text-neutral-400">{tile.label}</Text>
              <Text className="mt-1 text-[20px] font-extrabold leading-none tabular-nums text-neutral-950 dark:text-white">{tile.value}</Text>
            </View>
          ))}
        </View>
      </Pressable>
    </View>
  );
}
