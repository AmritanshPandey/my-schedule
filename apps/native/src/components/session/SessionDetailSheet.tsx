import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { IconArrowBackUp, IconCalendarEvent, IconCheck, IconPencil, IconPlayerSkipForward, IconRun } from '@tabler/icons-react-native';
import type { Session, SessionLog, SessionTask } from '@planr/core/lib/scheduleTypes';
import { formatDistance, formatPace, paceSecPerKm, plannedDistanceM, type SessionState } from '@planr/core/lib/sessions';
import { formatDisplayTime } from '@planr/core/lib/timeUtils';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button, { BUTTON_TEXT } from '../ui/Button';
import DateInput from '../ui/DateInput';
import TimeInput from '../ui/TimeInput';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { typography } from '../ui/Typography';

export interface SessionDetailSheetProps {
  open: boolean;
  session: Session | null;
  state: SessionState;
  actual?: SessionLog;
  planTitle?: string;
  onClose: () => void;
  onLog: () => void;
  onMarkDone: () => void;
  onUndo: () => void;
  onSkip: () => void;
  onMove: (dateISO: string, startTime: string | undefined) => void;
}

function taskLine(task: SessionTask): string {
  if (task.kind === 'simple') return task.title;
  const { distanceM, paceSecPerKm: pace, repeats, restSec } = task.plan;
  const d = repeats && repeats > 1 ? `${repeats} × ${formatDistance(distanceM)}` : formatDistance(distanceM);
  return [d, pace ? `@ ${formatPace(pace)}` : null, restSec && repeats && repeats > 1 ? `${restSec} s rest` : null].filter(Boolean).join(' ');
}

const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

/** Native port of components/session/SessionDetailSheet.tsx. */
export default function SessionDetailSheet({ open, session, state, actual, planTitle, onClose, onLog, onMarkDone, onUndo, onSkip, onMove }: SessionDetailSheetProps) {
  const [moving, setMoving] = useState(false);
  const [moveDate, setMoveDate] = useState('');
  const [moveTime, setMoveTime] = useState('');

  useEffect(() => {
    if (!open || !session) return;
    setMoving(false);
    setMoveDate(session.dateISO);
    setMoveTime(session.startTime ?? '');
  }, [open, session]);

  const done = state === 'done';
  const a = actual?.actual;

  return (
    <BottomSheet open={open} onClose={onClose} scroll>
      {session ? (
        <View className="px-5 pb-8 pt-1">
          <SheetHeader eyebrow={planTitle ?? 'Session'} title={session.title} onClose={onClose} />
          <Text className="mt-1 text-[13px] font-semibold text-neutral-600 dark:text-neutral-300">
            {dateLabel(session.dateISO)}
            {session.startTime ? ` · ${formatDisplayTime(session.startTime)}` : ' · Any time'}
            {session.estimatedMinutes ? ` · ${session.estimatedMinutes} min` : ''}
          </Text>

          <View className="mt-5 gap-2">
            {session.tasks.map((t) => (
              <View key={t.id} className="flex-row items-center gap-3 rounded-xl border border-neutral-200/70 bg-white px-4 py-3 dark:border-white/[0.07] dark:bg-neutral-900">
                <Icon icon={IconRun} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">{t.title}</Text>
                  <Text className="text-[13px] font-medium tabular-nums text-neutral-600 dark:text-neutral-300">{taskLine(t)}</Text>
                </View>
              </View>
            ))}
          </View>

          <View className="mt-5 flex-row gap-3">
            <View className="flex-1 rounded-xl bg-neutral-100 px-4 py-3 dark:bg-white/[0.05]">
              <Text className={typography.eyebrow}>Planned</Text>
              <Text className="mt-1 text-[15px] font-bold tabular-nums text-neutral-900 dark:text-white">{formatDistance(plannedDistanceM(session))}</Text>
            </View>
            <View className="flex-1 rounded-xl bg-neutral-100 px-4 py-3 dark:bg-white/[0.05]">
              <Text className={typography.eyebrow}>You ran</Text>
              <Text className="mt-1 text-[15px] font-bold tabular-nums text-neutral-900 dark:text-white">
                {a ? `${formatDistance(a.distanceM)} @ ${formatPace(paceSecPerKm(a))}` : done ? 'Done' : 'Not yet'}
              </Text>
              {actual?.source === 'health' ? <Text className="mt-0.5 text-[12px] font-medium text-neutral-500 dark:text-neutral-400">From Apple Health</Text> : null}
            </View>
          </View>
          {actual?.note ? <Text className="mt-3 text-[13px] text-neutral-600 dark:text-neutral-300">{actual.note}</Text> : null}

          <View className="mt-6 gap-2">
            {done ? (
              <>
                <Button variant="primary" fullWidth onPress={onLog} icon={<Icon icon={IconPencil} size={16} strokeWidth={2.2} className={BUTTON_TEXT.primary} />}>
                  {a ? 'Edit log' : 'Add distance and time'}
                </Button>
                <Button variant="secondary" fullWidth onPress={onUndo} icon={<Icon icon={IconArrowBackUp} size={16} strokeWidth={2.2} className={BUTTON_TEXT.secondary} />}>
                  Mark not done
                </Button>
              </>
            ) : (
              <>
                <Button variant="cta" fullWidth onPress={onLog} icon={<Icon icon={IconRun} size={18} strokeWidth={2.2} className={BUTTON_TEXT.cta} />}>
                  Log run
                </Button>
                <View className="flex-row gap-2">
                  <Button variant="secondary" className="flex-1" onPress={onMarkDone} icon={<Icon icon={IconCheck} size={16} strokeWidth={2.4} className={BUTTON_TEXT.secondary} />}>
                    Done
                  </Button>
                  <Button variant="secondary" className="flex-1" onPress={() => setMoving((v) => !v)} icon={<Icon icon={IconCalendarEvent} size={16} strokeWidth={2.2} className={BUTTON_TEXT.secondary} />}>
                    Move
                  </Button>
                  <Button variant="secondary" className="flex-1" onPress={onSkip} icon={<Icon icon={IconPlayerSkipForward} size={16} strokeWidth={2.2} className={BUTTON_TEXT.secondary} />}>
                    Skip
                  </Button>
                </View>
              </>
            )}
            {moving && !done ? (
              <View className="mt-3 gap-3 rounded-2xl border border-neutral-200/70 p-4 dark:border-white/[0.07]">
                <DateInput label="Day" value={moveDate} onChange={setMoveDate} />
                <TimeInput label="Time" value={moveTime} onChange={setMoveTime} />
                <Button variant="primary" fullWidth disabled={!moveDate} onPress={() => onMove(moveDate, moveTime || undefined)}>
                  Move run
                </Button>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}
