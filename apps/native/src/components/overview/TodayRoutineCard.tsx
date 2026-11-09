import { View } from 'react-native';
import type { TodayRoutineRow } from '@planr/core/lib/overview';
import { haptic } from '../../lib/haptics';
import { iconGlyph, getIconPickerStyle } from '../SectionIcons';
import RoutineCompletionControl from '../activity/RoutineCompletionControl';
import { CARD } from '../ui/surfaces';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import Button from '../ui/Button';

/**
 * Native port of components/overview/TodayRoutineCard.tsx — today's routines,
 * each one tap from done with the Routine tab's ring. A routine whose run ends
 * tonight unless it's done says so on its own row.
 */
export default function TodayRoutineCard({
  rows,
  done,
  total,
  atRiskIds,
  onToggle,
  onOpenRoutine,
}: {
  rows: TodayRoutineRow[];
  done: number;
  total: number;
  atRiskIds?: ReadonlySet<string>;
  onToggle: (ritualId: string, done: boolean) => void;
  onOpenRoutine: () => void;
}) {
  return (
    <View testID="overview-today-routine" className={`${CARD} px-4 pb-2 pt-4`}>
      <View className="flex-row items-center justify-between gap-3">
        <Text accessibilityRole="header" className="text-[16px] font-bold text-neutral-950 dark:text-white">
          Today's routine
        </Text>
        {total > 0 && <Text className="text-[13px] font-semibold tabular-nums text-neutral-500 dark:text-neutral-400">{`${done}/${total} done`}</Text>}
      </View>

      {rows.length === 0 ? (
        <View className="items-center py-5">
          <Text className="text-[13px] text-neutral-500 dark:text-neutral-400">No routines due today.</Text>
          <Button
            variant="secondary"
            size="md"
            onPress={() => {
              haptic('light');
              onOpenRoutine();
            }}
            className="mt-3"
          >
            Open routines
          </Button>
        </View>
      ) : (
        <View className="mt-2">
          {rows.map(({ ritual, cadenceLabel, goalLabel, done: isDone }, index) => {
            const style = getIconPickerStyle(ritual.icon ?? '');
            const glyph = iconGlyph(ritual.icon ?? '');
            const atRisk = !isDone && atRiskIds?.has(ritual.id);
            return (
              <View
                key={ritual.id}
                className={`flex-row items-center gap-3 py-3 ${index > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}`}
              >
                <View
                  className={`h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    ritual.icon ? style.tint : 'bg-neutral-100 dark:bg-white/[0.06]'
                  }`}
                >
                  {ritual.icon ? (
                    <Icon icon={glyph} size={18} strokeWidth={1.9} className={style.text} />
                  ) : (
                    <Text className="text-[14px] font-bold text-neutral-600 dark:text-neutral-300">{ritual.title.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    numberOfLines={1}
                    className={`text-[15px] font-semibold ${isDone ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-neutral-950 dark:text-white'}`}
                  >
                    {ritual.title}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className={`mt-0.5 text-[12px] ${atRisk ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-medium text-neutral-500 dark:text-neutral-400'}`}
                  >
                    {atRisk ? 'Streak ends tonight' : [cadenceLabel, goalLabel].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <RoutineCompletionControl title={ritual.title} done={isDone} missed={false} onPress={() => onToggle(ritual.id, isDone)} />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
