import { Pressable, View } from 'react-native';
import { IconMinus, IconRun, IconX } from '@tabler/icons-react-native';
import type { Plan, Session, SessionLog } from '@planr/core/lib/scheduleTypes';
import { formatDistance, formatPace, headline, paceSecPerKm, type SessionState } from '@planr/core/lib/sessions';
import { formatDisplayTime } from '@planr/core/lib/timeUtils';
import { haptic } from '../../lib/haptics';
import CheckDraw from '../ui/CheckDraw';
import Pill from '../ui/Pill';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export interface SessionRowProps {
  session: Session;
  state: SessionState;
  actual?: SessionLog;
  plan?: Plan | null;
  isFirst?: boolean;
  isLast?: boolean;
  readOnly?: boolean;
  onOpen: () => void;
  onToggleDone?: () => void;
}

/**
 * Native port of components/session/SessionRow.tsx: a planned run on the Today
 * timeline, set like a task row (time, spine node, card). The node is the done
 * toggle; the card opens the session.
 */
export default function SessionRow({ session, state, actual, plan, isFirst = false, isLast = false, readOnly = false, onOpen, onToggleDone }: SessionRowProps) {
  const done = state === 'done';
  const missed = state === 'missed';
  const skipped = state === 'skipped';
  const timeLabel = session.startTime ? formatDisplayTime(session.startTime) : 'Any time';
  const match = /^(.*?)\s*(AM|PM)$/i.exec(timeLabel);
  const meta = [plan?.title, session.estimatedMinutes ? `${session.estimatedMinutes} min` : null].filter(Boolean).join(' · ');
  const ran = actual?.actual ? `You ran ${formatDistance(actual.actual.distanceM)} @ ${formatPace(paceSecPerKm(actual.actual))}` : null;
  const canToggle = !readOnly && !skipped && !!onToggleDone;

  const nodeClass = done
    ? 'border-transparent bg-emerald-500'
    : missed
      ? 'border-transparent bg-rose-500'
      : skipped
        ? 'border-transparent bg-neutral-300 dark:bg-white/25'
        : 'border-2 border-neutral-300 bg-white dark:border-white/25 dark:bg-neutral-950';
  const connectorClass = missed ? 'bg-rose-500/50' : done ? 'bg-emerald-500/70' : 'bg-neutral-200 dark:bg-white/10';
  const cardClass = done
    ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
    : missed
      ? 'border-rose-500/25 bg-rose-500/[0.06]'
      : 'border-neutral-200/70 bg-white dark:border-white/[0.07] dark:bg-neutral-900';

  return (
    <View className="flex-row items-stretch gap-3 pb-3">
      <View className="w-[56px] shrink-0 items-end justify-center">
        <Text numberOfLines={1} className="text-right text-[13px] font-semibold tabular-nums leading-none text-neutral-500 dark:text-neutral-400">
          {match ? match[1] : timeLabel}
          {match && <Text className="text-[10px] font-bold">{` ${match[2].toUpperCase()}`}</Text>}
        </Text>
      </View>

      <View className="relative w-7 shrink-0 items-center justify-center">
        <View
          pointerEvents="none"
          className={`absolute w-[1.5px] rounded-full ${connectorClass} ${isFirst ? 'top-1/2' : 'top-0'} ${isLast ? 'bottom-1/2' : '-bottom-3'}`}
          style={{ left: 13.25 }}
        />
        <View className="relative z-10">
          <Pressable
            disabled={!canToggle}
            accessibilityRole="checkbox"
            accessibilityLabel={done ? `Mark ${session.title} not done` : `Mark ${session.title} done`}
            accessibilityState={{ checked: done, disabled: !canToggle }}
            hitSlop={8}
            onPress={() => {
              haptic('medium');
              onToggleDone?.();
            }}
            className={`h-7 w-7 items-center justify-center rounded-full ${nodeClass}`}
          >
            <CheckDraw visible={done} size={15} strokeWidth={3} className="text-white" />
            {missed && <Icon icon={IconX} size={14} strokeWidth={3} className="text-white" />}
            {skipped && <Icon icon={IconMinus} size={14} strokeWidth={3} className="text-white" />}
          </Pressable>
        </View>
      </View>

      <View className="min-w-0 flex-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${session.title}, ${headline(session)}`}
          onPress={() => {
            haptic('light');
            onOpen();
          }}
          className={`flex-row items-start justify-between gap-3 rounded-2xl border px-4 py-3 active:scale-[0.995] ${cardClass}`}
        >
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1.5">
              <Icon icon={IconRun} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
              <Text numberOfLines={1} className={`min-w-0 flex-1 text-[16px] font-bold leading-tight ${missed || skipped ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}>
                {session.title}
              </Text>
            </View>
            <Text numberOfLines={1} className="mt-0.5 text-[12.5px] font-medium text-neutral-600 dark:text-neutral-300">{ran ?? headline(session)}</Text>
            {meta ? <Text numberOfLines={1} className="mt-0.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">{meta}</Text> : null}
          </View>
          {done ? (
            <Pill variant="success" size="sm">Completed</Pill>
          ) : missed ? (
            <Pill variant="danger" size="sm">Missed</Pill>
          ) : skipped ? (
            <Pill variant="subtle" size="sm">Skipped</Pill>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
