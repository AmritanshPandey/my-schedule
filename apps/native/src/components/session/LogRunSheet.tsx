import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { IconCheck } from '@tabler/icons-react-native';
import type { RunEffort, Session, SessionLog } from '@planr/core/lib/scheduleTypes';
import { formatPace, paceSecPerKm, plannedDistanceM, validateRunLog } from '@planr/core/lib/sessions';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button, { BUTTON_TEXT } from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import Input, { FORM_LABEL, Textarea } from '../ui/Input';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export interface LogRunSheetProps {
  open: boolean;
  session: Session | null;
  initial?: SessionLog;
  onSave: (actual: { distanceM: number; durationSec: number; effort?: RunEffort }, note: string | undefined) => void;
  onClose: () => void;
}

const EFFORTS = [
  { value: 'easy', label: 'Easy' },
  { value: 'ok', label: 'OK' },
  { value: 'hard', label: 'Hard' },
] as const;

const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v.replace(',', '.')));

/** Native port of components/session/LogRunSheet.tsx. */
export default function LogRunSheet({ open, session, initial, onSave, onClose }: LogRunSheetProps) {
  const [distance, setDistance] = useState('');
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [effort, setEffort] = useState<RunEffort>('ok');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    const a = initial?.actual;
    setDistance(a ? String(Math.round(a.distanceM / 10) / 100) : String(plannedDistanceM(session) / 1000));
    setMinutes(a ? String(Math.floor(a.durationSec / 60)) : '');
    setSeconds(a ? String(a.durationSec % 60) : '');
    setEffort(a?.effort ?? 'ok');
    setNote(initial?.note ?? '');
    setTried(false);
  }, [open, session, initial]);

  const input = { distanceKm: num(distance), minutes: num(minutes), seconds: num(seconds) };
  const error = validateRunLog(input);
  const durationSec = (Number.isFinite(input.minutes) ? input.minutes : 0) * 60 + (Number.isFinite(input.seconds) ? input.seconds : 0);
  const pace = !error ? formatPace(paceSecPerKm({ distanceM: input.distanceKm * 1000, durationSec })) : null;

  const save = () => {
    setTried(true);
    if (error) return;
    onSave({ distanceM: Math.round(input.distanceKm * 1000), durationSec: Math.round(durationSec), effort }, note.trim() || undefined);
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      scroll
      footer={
        <Button variant="cta" fullWidth onPress={save} icon={<Icon icon={IconCheck} size={18} strokeWidth={2.5} className={BUTTON_TEXT.cta} />}>
          Save run
        </Button>
      }
    >
      <View className="gap-5 px-5 pb-6 pt-1">
        <SheetHeader eyebrow="Log run" title={session?.title ?? 'Run'} onClose={onClose} />
        <Input label="Distance (km)" keyboardType="decimal-pad" value={distance} onChangeText={setDistance} />
        <View>
          <Text className={FORM_LABEL}>Time</Text>
          <View className="flex-row items-center gap-2">
            <View className="flex-1">
              <Input accessibilityLabel="Minutes" placeholder="min" keyboardType="number-pad" value={minutes} onChangeText={setMinutes} />
            </View>
            <Text className="text-[16px] font-bold text-neutral-500">:</Text>
            <View className="flex-1">
              <Input accessibilityLabel="Seconds" placeholder="sec" keyboardType="number-pad" value={seconds} onChangeText={setSeconds} />
            </View>
          </View>
          <Text accessibilityLiveRegion="polite" className="mt-2 text-[13px] font-semibold tabular-nums text-neutral-600 dark:text-neutral-300">
            {pace ? `Pace ${pace}` : ' '}
          </Text>
        </View>
        <View>
          <Text className={FORM_LABEL}>How did it feel?</Text>
          <SegmentedControl ariaLabel="How did it feel?" options={EFFORTS} value={effort} onChange={setEffort} />
        </View>
        <Textarea label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
        {tried && error ? (
          <Text accessibilityRole="alert" className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">{error}</Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
