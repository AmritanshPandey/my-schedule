import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconChevronRight, IconFlame } from '@tabler/icons-react-native';
import type { Ritual, RitualCompletion } from '@planr/core/lib/scheduleTypes';
import { todayISO } from '@planr/core/lib/dateUtils';
import { calculateRitualStats, ritualScheduledOnDate } from '@planr/core/lib/consistency/calculateRitualStreak';
import { entriesForRitualDate } from '@planr/core/lib/ritualCompletions';
import { ritualDayProgress } from '@planr/core/lib/consistency/ritualDayStatus';
import { describeRecurrence } from '@planr/core/lib/ritualRecurrence';
import { formatAmount, routineDetailLine, routineWhenLabel } from '@planr/core/lib/routineDetails';
import { haptic } from '../../lib/haptics';
import { iconGlyph, getIconPickerStyle } from '../SectionIcons';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import RoutineCompletionControl from './RoutineCompletionControl';
import FollowedPicker from './FollowedPicker';

interface RoutineRowProps {
  ritual: Ritual;
  ritualCompletions: RitualCompletion[];
  selectedDateISO: string;
  /** Settings → Tracking → "Tracking starts" (schedule.preferences?.startDate). */
  trackingStart?: string;
  /** Mark the day done, rated 1–100 (100 when the user doesn't say). */
  onMarkDone: (ritualId: string, dateISO: string, followed: number) => void;
  onUnmarkDone: (ritualId: string, dateISO: string) => void;
  onOpenDetail: (ritual: Ritual) => void;
  onDelete: (ritual: Ritual) => void;
}

/**
 * Native port of components/activity/RoutineRow.tsx — one routine on one day:
 * identity chip, title, when it happens, its detail (the meal plan, the goal),
 * and a single done ring.
 *
 * Marking done is one tap for every kind of routine. Right after it, the row
 * offers an optional "how closely did you follow it?" — skip it and the day
 * stays at 100%. The rating never decides whether the day counts. (The web's
 * hover-revealed desktop delete has no phone equivalent; delete lives in the
 * detail view, same as the PWA's phone layout.)
 */
export default function RoutineRow({
  ritual,
  ritualCompletions,
  selectedDateISO,
  trackingStart,
  onMarkDone,
  onUnmarkDone,
  onOpenDetail,
}: RoutineRowProps) {
  const [rating, setRating] = useState(false);
  const entries = entriesForRitualDate(ritualCompletions, ritual.id, selectedDateISO);
  const progress = ritualDayProgress(ritual, entries);
  const done = progress.complete;
  const scheduled = ritualScheduledOnDate(ritual, selectedDateISO, trackingStart);
  const missed = selectedDateISO < todayISO() && scheduled && !done;
  const { streak, timesDone } = calculateRitualStats(ritual, ritualCompletions, selectedDateISO, trackingStart);

  const iconStyle = getIconPickerStyle(ritual.icon ?? '');
  const Glyph = iconGlyph(ritual.icon ?? '');

  const trackingType = ritual.trackingType ?? 'checkbox';
  const measured = trackingType === 'quantity' || trackingType === 'duration' || trackingType === 'count';
  const logged =
    measured && progress.value > 0
      ? `${formatAmount(progress.value)}${ritual.target ? ` of ${formatAmount(ritual.target)}` : ''}${ritual.unit ? ` ${ritual.unit}` : ''} logged`
      : null;
  // Once something is logged, "60 of 120 g logged" already states the goal.
  const detail = routineDetailLine(logged ? { ...ritual, target: undefined } : ritual);

  const meta = [routineWhenLabel(ritual), missed ? 'Missed' : describeRecurrence(ritual)].join(' · ');

  function press() {
    if (!done) {
      onMarkDone(ritual.id, selectedDateISO, 100);
      setRating(true);
    } else if (progress.markedDone) {
      onUnmarkDone(ritual.id, selectedDateISO);
      setRating(false);
    } else {
      // Done through logging alone — nothing to take back here, but it can
      // still be rated.
      setRating((open) => !open);
    }
  }

  const open = () => {
    haptic('light');
    onOpenDetail(ritual);
  };

  return (
    <View className="py-3">
      <View className="flex-row items-center gap-3">
        {/* Icon/color chip — identity, not the completion control. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${ritual.title}`}
          onPress={open}
          className={`h-10 w-10 shrink-0 items-center justify-center rounded-full ${ritual.icon ? iconStyle.tint : 'bg-neutral-100 dark:bg-white/[0.06]'}`}
        >
          {ritual.icon ? (
            <Icon icon={Glyph} size={18} strokeWidth={1.9} className={iconStyle.text} />
          ) : (
            <Text className="text-[15px] font-bold text-neutral-600 dark:text-neutral-400">{ritual.title.charAt(0).toUpperCase()}</Text>
          )}
        </Pressable>

        {/* Title, when, detail — opens the routine */}
        <Pressable accessibilityRole="button" onPress={open} className="min-w-0 flex-1">
          <Text
            numberOfLines={1}
            className={`text-[15px] font-bold leading-tight ${done || missed ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}
          >
            {ritual.title}
          </Text>
          {/* One inline run, truncated at the end: when it happens and how
              often stay visible, the record trails off first on a narrow row. */}
          <Text numberOfLines={1} className="mt-0.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">
            <Text className="tabular-nums">{meta}</Text>
            {streak >= 2 && (
              <>
                {' · '}
                <Text accessibilityLabel={`${streak}-day streak`} className="font-bold text-emerald-700 dark:text-emerald-400">
                  <Icon icon={IconFlame} size={11} strokeWidth={2.4} className="text-emerald-700 dark:text-emerald-400" />
                  {streak}
                </Text>
              </>
            )}
            {timesDone > 0 && <Text className="tabular-nums">{` · ${timesDone}× in 30 days`}</Text>}
          </Text>
          {(logged || detail) && (
            <Text numberOfLines={1} className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
              {[logged, detail].filter(Boolean).join(' · ')}
            </Text>
          )}
        </Pressable>

        {/* How closely it was followed — tap to change. hitSlop widens the
            target to 44px without making the pill look heavy. */}
        {done && progress.followed !== null && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Followed ${progress.followed}%. Change how closely you followed ${ritual.title}`}
            accessibilityState={{ expanded: rating }}
            hitSlop={6}
            onPress={() => {
              haptic('light');
              setRating((v) => !v);
            }}
            className={`h-8 shrink-0 items-center justify-center rounded-full border px-2 ${
              rating ? 'border-neutral-950 bg-neutral-950 dark:border-white dark:bg-white' : 'border-neutral-200 active:bg-neutral-50 dark:border-white/[0.10] dark:active:bg-white/[0.05]'
            }`}
          >
            <Text
              className={`text-[12px] font-extrabold tabular-nums ${rating ? 'text-white dark:text-neutral-950' : 'text-neutral-700 dark:text-neutral-200'}`}
            >
              {progress.followed}%
            </Text>
          </Pressable>
        )}

        <RoutineCompletionControl title={ritual.title} done={done} missed={missed} onPress={press} />

        {/* Affordance only — the title already opens the routine. */}
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={open}
          className="-ml-1.5 h-8 w-5 shrink-0 items-center justify-center active:scale-[0.9]"
        >
          <Icon icon={IconChevronRight} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
        </Pressable>
      </View>

      {rating && done && (
        <FollowedPicker
          className="pl-[52px] pt-2.5"
          prompt="How closely did you follow it?"
          value={progress.followed}
          routineTitle={ritual.title}
          // The slider stays open after a release: a rating you can drag
          // invites a second look, and the pill beside the title already
          // shows the committed value.
          onChange={(pct) => onMarkDone(ritual.id, selectedDateISO, pct)}
        />
      )}
    </View>
  );
}
