import { Pressable, View } from 'react-native';
import { IconChevronRight, IconFlame } from '@tabler/icons-react-native';
import type { Ritual, RitualCompletion } from '@planr/core/lib/scheduleTypes';
import { formatDisplayTime } from '@planr/core/lib/timeUtils';
import { todayISO } from '@planr/core/lib/dateUtils';
import { calculateRitualStats, ritualScheduledOnDate } from '@planr/core/lib/consistency/calculateRitualStreak';
import { entriesForRitualDate } from '@planr/core/lib/ritualCompletions';
import { ritualDayProgress } from '@planr/core/lib/consistency/ritualDayStatus';
import { describeRecurrence } from '@planr/core/lib/ritualRecurrence';
import { haptic } from '../../lib/haptics';
import { iconGlyph, getIconPickerStyle } from '../SectionIcons';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import RoutineCompletionControl from './RoutineCompletionControl';

interface RoutineRowProps {
  ritual: Ritual;
  ritualCompletions: RitualCompletion[];
  selectedDateISO: string;
  /** Settings → Tracking → "Tracking starts" (schedule.preferences?.startDate). */
  trackingStart?: string;
  onToggleComplete: (ritualId: string, dateISO: string) => void;
  onLogAmount: (ritualId: string, amount: number, dateISO: string) => void;
  onUndoLastLog: (ritualId: string, dateISO: string) => void;
  onOpenDetail: (ritual: Ritual) => void;
  onDelete: (ritual: Ritual) => void;
}

/**
 * Native port of components/activity/RoutineRow.tsx — one compact routine
 * row: icon/color chip, title + secondary line, the trackingType-appropriate
 * completion control, and the chevron into the detail view. (The web's
 * hover-revealed desktop delete button has no phone equivalent; delete lives
 * in the detail view, same as the PWA's phone layout.)
 */
export default function RoutineRow({
  ritual,
  ritualCompletions,
  selectedDateISO,
  trackingStart,
  onToggleComplete,
  onLogAmount,
  onUndoLastLog,
  onOpenDetail,
}: RoutineRowProps) {
  const entries = entriesForRitualDate(ritualCompletions, ritual.id, selectedDateISO);
  const progress = ritualDayProgress(ritual, entries);
  const scheduled = ritualScheduledOnDate(ritual, selectedDateISO, trackingStart);
  const missed = selectedDateISO < todayISO() && scheduled && !progress.complete;
  const { streak } = calculateRitualStats(ritual, ritualCompletions, selectedDateISO, trackingStart);

  const iconStyle = getIconPickerStyle(ritual.icon ?? '');
  const Glyph = iconGlyph(ritual.icon ?? '');

  const trackingType = ritual.trackingType ?? 'checkbox';

  const secondary: string[] = [];
  if (trackingType === 'times' && ritual.steps && ritual.steps.length > 0) {
    // Every occurrence, not just the earliest one `ritual.time` mirrors —
    // "8:00 AM · 1:00 PM · 6:00 PM" is the whole schedule at a glance.
    secondary.push(ritual.steps.map((step) => formatDisplayTime(step.label)).join(' · '));
  } else if (ritual.anyTime) secondary.push('Anytime');
  else secondary.push(formatDisplayTime(ritual.time));
  if (missed) secondary.push('Missed');
  else secondary.push(describeRecurrence(ritual));

  const showProgressText = trackingType === 'quantity' || trackingType === 'duration' || trackingType === 'count';
  // Checkbox routines can bundle a purely descriptive item list (e.g. "Hair"
  // ⇒ coconut oil, shampoo, conditioner) — one tap above covers all of them,
  // so this is a caption, never its own row of checkboxes.
  const items = trackingType === 'checkbox' ? ritual.steps : undefined;

  const open = () => {
    haptic('light');
    onOpenDetail(ritual);
  };

  return (
    <View className="flex-row items-center gap-3 py-3">
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

      {/* Title + meta — opens the detail view */}
      <Pressable accessibilityRole="button" onPress={open} className="min-w-0 flex-1">
        <Text
          className={`truncate text-[15px] font-bold leading-tight ${
            progress.complete
              ? 'text-neutral-400 line-through dark:text-neutral-500'
              : missed
                ? 'text-neutral-500 dark:text-neutral-400'
                : 'text-neutral-900 dark:text-white'
          }`}
        >
          {ritual.title}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5 overflow-hidden">
          <Text className="shrink-0 text-[12px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
            {secondary[0]}
          </Text>
          <Text className="text-[12px] font-medium text-neutral-500 dark:text-neutral-400" accessibilityElementsHidden importantForAccessibility="no">
            ·
          </Text>
          <Text className="shrink truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{secondary[1]}</Text>
          {showProgressText && (
            <Text className="shrink-0 text-[12px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
              · {progress.value}/{ritual.target ?? '–'}
              {ritual.unit ? ` ${ritual.unit}` : ''}
            </Text>
          )}
          {streak >= 2 && (
            <View className="shrink-0 flex-row items-center gap-0.5">
              <Icon icon={IconFlame} size={12} strokeWidth={2.4} className="text-emerald-600 dark:text-emerald-400" />
              <Text className="text-[12px] font-bold text-emerald-600 dark:text-emerald-400">{streak}</Text>
            </View>
          )}
        </View>
        {items && items.length > 0 && (
          <Text className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">{items.map((step) => step.label).join(' · ')}</Text>
        )}
      </Pressable>

      <RoutineCompletionControl
        ritual={ritual}
        progress={progress}
        missed={missed}
        onToggleCheckbox={() => onToggleComplete(ritual.id, selectedDateISO)}
        onLogAmount={(amount) => onLogAmount(ritual.id, amount, selectedDateISO)}
        onUndoLastLog={() => onUndoLastLog(ritual.id, selectedDateISO)}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${ritual.title} details`}
        onPress={open}
        className="h-8 w-8 shrink-0 items-center justify-center active:scale-[0.9]"
      >
        <Icon icon={IconChevronRight} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
      </Pressable>
    </View>
  );
}
