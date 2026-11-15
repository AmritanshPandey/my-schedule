import { useState } from 'react';
import { View } from 'react-native';
import { IconCheck } from '@tabler/icons-react-native';
import type { ScheduleEntry, TargetValues } from '@planr/core/lib/scheduleEntry';
import type { LoggedSet, SetLog } from '@planr/core/lib/scheduleTypes';
import { previousSetLog, setLogFor, setLogId, startingSets } from '@planr/core/lib/setLogs';
import { formatStrengthTargets } from '@planr/core/lib/subtaskTargets';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button, { BUTTON_TEXT } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import SetTable from './SetTable';

interface LogSetsSheetProps {
  open: boolean;
  onClose: () => void;
  taskId: string;
  /** The subtask being logged. Kept by the caller through the close, so the sheet can slide away showing it. */
  entry: ScheduleEntry | null;
  values: TargetValues;
  dateISO: string;
  setLogs: readonly SetLog[] | undefined;
  onSave: (log: SetLog, allDone: boolean) => void;
}

/**
 * Native port of components/activity/LogSetsSheet.tsx.
 *
 * The sheet itself stays mounted for the life of the detail view: an iOS
 * system sheet whose component unmounts while it's up is never dismissed and
 * freezes on screen. Only its body is keyed per opening, so each one starts
 * from that day's saved row.
 */
export default function LogSetsSheet({ open, onClose, taskId, entry, values, dateISO, setLogs, onSave }: LogSetsSheetProps) {
  const [opening, setOpening] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpening((n) => n + 1);
  }
  return (
    <BottomSheet open={open} onClose={onClose}>
      {entry ? (
        <LogSetsBody
          key={`${entry.id}-${opening}`}
          onClose={onClose}
          taskId={taskId}
          entry={entry}
          values={values}
          dateISO={dateISO}
          setLogs={setLogs}
          onSave={onSave}
        />
      ) : (
        <View />
      )}
    </BottomSheet>
  );
}

function LogSetsBody({
  onClose,
  taskId,
  entry,
  values,
  dateISO,
  setLogs,
  onSave,
}: Omit<LogSetsSheetProps, 'open' | 'entry'> & { entry: ScheduleEntry }) {
  const weightUnit = values.weightUnit ?? entry.targets?.weightUnit ?? 'kg';
  const previous = previousSetLog(setLogs, taskId, entry.id, dateISO);
  const existing = setLogFor(setLogs, taskId, entry.id, dateISO);
  const [sets, setSets] = useState<LoggedSet[]>(() => existing?.sets ?? startingSets(values, previous));
  const showWeight = values.weight != null || sets.some((s) => s.weight != null) || (previous?.sets.some((s) => s.weight != null) ?? false);
  const target = formatStrengthTargets(values);

  function save() {
    const working = sets.filter((s) => !s.warmup);
    onSave(
      { id: setLogId(taskId, entry.id, dateISO), taskId, subtaskId: entry.id, dateISO, weightUnit, sets, completedAt: new Date().toISOString() },
      working.length > 0 && working.every((s) => s.done),
    );
    onClose();
  }

  return (
    <View className="gap-4 px-5 pb-8 pt-1">
      <SheetHeader eyebrow="Log sets" title={entry.task} onClose={onClose} />
      {target ? (
        <Text className="-mt-2 text-[14px] font-semibold text-neutral-500 dark:text-neutral-400" style={{ fontVariant: ['tabular-nums'] }}>
          Target {target}
        </Text>
      ) : null}
      <SetTable sets={sets} onChange={setSets} previous={previous} weightUnit={weightUnit} showWeight={showWeight} />
      <Button variant="primary" fullWidth onPress={save} icon={<Icon icon={IconCheck} size={18} strokeWidth={2.6} className={BUTTON_TEXT.primary} />}>
        Save sets
      </Button>
    </View>
  );
}
