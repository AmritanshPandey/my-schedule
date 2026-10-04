import { Pressable, View } from 'react-native';
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconClockExclamation,
  IconFlag,
  IconFlame,
  IconTrendingDown,
  IconX,
} from '@tabler/icons-react-native';
import { haptic } from '../lib/haptics';
import { formatDateShort, todayISO } from '@planr/core/lib/dateUtils';
import { bandRangeLabel } from '@planr/core/lib/slotReliability';
import {
  formatDaysAgo,
  formatDaysBehind,
  formatDaysOverdue,
  formatReliabilityRate,
  type MissedTask,
  type NeedsAttention,
  type UnreliableSlotTask,
} from '@planr/core/lib/needsAttention';
import { ritualAttentionKey, slotRiskKey, milestoneRiskKey, milestoneOverdueKey } from '@planr/core/lib/attentionDismissal';
import { CARD } from './ui/surfaces';
import IconButton, { ICON_BUTTON_TONE } from './ui/IconButton';
import { Icon, type TablerIcon } from './ui/Icon';
import { Text } from './ui/Text';

const MAX_ROWS = 4;

interface NeedsAttentionCardProps {
  data: NeedsAttention;
  onNavigate: (tab: number) => void;
  onHandleMissed?: (missed: MissedTask) => void;
  onAdaptMilestone?: (milestoneId: string) => void;
  onReviewUnreliableSlot?: (row: UnreliableSlotTask) => void;
  onClearAll?: () => void;
  onDismissOne?: (key: string) => void;
}

function Row({
  icon,
  tone,
  title,
  detail,
  pill,
  onClick,
  dismissKey,
  onDismissOne,
}: {
  icon: TablerIcon;
  tone: 'warn' | 'danger';
  title: string;
  detail: string;
  pill: string;
  onClick: () => void;
  dismissKey: string | null;
  onDismissOne?: (key: string) => void;
}) {
  const accent = tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
  const tint = tone === 'warn' ? 'bg-amber-50 dark:bg-amber-500/[0.10]' : 'bg-rose-50 dark:bg-rose-500/[0.10]';

  return (
    <View className="w-full flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptic('light');
          onClick();
        }}
        className="min-w-0 flex-1 flex-row items-center gap-3 py-2.5"
      >
        <View className={`h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tint}`}>
          <Icon icon={icon} size={15} strokeWidth={2} className={accent} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="truncate text-[14px] font-bold text-neutral-950 dark:text-white">{title}</Text>
          <Text className="mt-0.5 truncate text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{detail}</Text>
        </View>
        <Text className={`shrink-0 text-[12px] font-bold tabular-nums ${accent}`}>{pill}</Text>
        <Icon icon={IconArrowUpRight} size={14} strokeWidth={2.2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
      </Pressable>
      {dismissKey && onDismissOne && (
        <IconButton
          label={`Dismiss "${title}"`}
          size="xxs"
          variant="ghost"
          onPress={() => {
            haptic('light');
            onDismissOne(dismissKey);
          }}
        >
          <Icon icon={IconX} size={12} strokeWidth={2.5} className={ICON_BUTTON_TONE.ghost} />
        </IconButton>
      )}
    </View>
  );
}

/**
 * Native port of components/NeedsAttentionCard.tsx — overdue/at-risk
 * milestones, at-risk ritual streaks, unreliable slots and recent misses,
 * ordered by how recoverable each is. Renders nothing when all clear.
 */
export default function NeedsAttentionCard({
  data,
  onNavigate,
  onHandleMissed,
  onAdaptMilestone,
  onReviewUnreliableSlot,
  onClearAll,
  onDismissOne,
}: NeedsAttentionCardProps) {
  if (data.total === 0) return null;

  const today = todayISO();

  const rows = [
    ...data.atRiskRituals.map((row) => ({
      key: `r:${row.ritual.id}`,
      icon: IconFlame,
      tone: 'warn' as const,
      title: row.ritual.title,
      detail: `${row.streak}-day run ends tonight`,
      pill: 'Not done',
      onClick: () => onNavigate(2),
      dismissKey: ritualAttentionKey(row.ritual.id, today),
    })),
    ...data.unreliableSlotTasks.map((row) => ({
      key: `slot:${row.task.id}`,
      icon: IconClockExclamation,
      tone: 'warn' as const,
      title: row.task.title,
      detail: `${row.plan ? row.plan.title + ' · ' : ''}${bandRangeLabel(row.from.band)} rarely finishes`,
      pill: formatReliabilityRate(row.from.rate),
      onClick: () => (onReviewUnreliableSlot ? onReviewUnreliableSlot(row) : onNavigate(0)),
      dismissKey: slotRiskKey(row.task.id, today),
    })),
    ...data.atRiskMilestones.map((row) => ({
      key: `am:${row.milestone.id}`,
      icon: IconTrendingDown,
      tone: 'warn' as const,
      title: row.milestone.title,
      detail: row.plan
        ? row.forecastDate
          ? `${row.plan.title} · projects ${formatDateShort(row.forecastDate)}`
          : row.plan.title
        : 'Milestone',
      pill: formatDaysBehind(row.daysBehind),
      onClick: () => (onAdaptMilestone ? onAdaptMilestone(row.milestone.id) : onNavigate(1)),
      dismissKey: milestoneRiskKey(row.milestone.id, row.milestone.plannedEndDate),
    })),
    ...data.overdueMilestones.map((row) => ({
      key: `m:${row.milestone.id}`,
      icon: IconFlag,
      tone: 'warn' as const,
      title: row.milestone.title,
      detail: row.plan ? row.plan.title : 'Milestone',
      pill: formatDaysOverdue(row.daysOverdue),
      onClick: () => (onAdaptMilestone ? onAdaptMilestone(row.milestone.id) : onNavigate(1)),
      dismissKey: milestoneOverdueKey(row.milestone.id, row.milestone.plannedEndDate),
    })),
    ...data.missedTasks.map((row) => ({
      key: `t:${row.task.id}:${row.dateISO}`,
      icon: IconX,
      tone: 'danger' as const,
      title: row.task.title,
      detail: row.plan ? `${row.plan.title} · missed ${formatDaysAgo(row.daysAgo)}` : `Missed ${formatDaysAgo(row.daysAgo)}`,
      pill: formatDaysAgo(row.daysAgo),
      onClick: () => (onHandleMissed ? onHandleMissed(row) : onNavigate(0)),
      dismissKey: null,
    })),
  ];

  const visible = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - visible.length;

  return (
    <View testID="overview-needs-attention" className={`${CARD} p-4`}>
      <View className="mb-1 flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Icon icon={IconAlertTriangle} size={15} strokeWidth={2} className="shrink-0 text-amber-700 dark:text-amber-400" />
          <Text accessibilityRole="header" className="truncate text-[13px] font-extrabold text-neutral-800 dark:text-neutral-200">
            Needs attention
          </Text>
        </View>
        <View className="shrink-0 flex-row items-center gap-1.5">
          {onClearAll && (
            <Pressable
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => {
                haptic('light');
                onClearAll();
              }}
              className="rounded-full px-2 py-1 active:bg-neutral-100 dark:active:bg-white/[0.07]"
            >
              <Text className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400">Clear all</Text>
            </Pressable>
          )}
          <View className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 dark:border-white/[0.10] dark:bg-white/[0.05]">
            <Text className="text-[11px] font-black tabular-nums text-neutral-500 dark:text-neutral-400">{data.total}</Text>
          </View>
        </View>
      </View>

      <View>
        {visible.map(({ key, ...row }, i) => (
          <View key={key} className={i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}>
            <Row {...row} onDismissOne={onDismissOne} />
          </View>
        ))}
      </View>

      {hidden > 0 && <Text className="mt-2 text-[12px] font-semibold text-neutral-500 dark:text-neutral-400">+{hidden} more</Text>}
    </View>
  );
}
