import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { IconRun } from '@tabler/icons-react-native';
import type { DayKey, RunPlanInputs } from '@planr/core/lib/scheduleTypes';
import { generateRunPlan, summarizeRunPlan, validateRunInputs } from '@planr/core/lib/runPlan';
import { headline } from '@planr/core/lib/sessions';
import { localISODate } from '@planr/core/lib/dateUtils';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button, { BUTTON_TEXT } from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import WeekdayPicker from '../ui/WeekdayPicker';
import DateInput from '../ui/DateInput';
import TimeInput from '../ui/TimeInput';
import Toggle from '../ui/Toggle';
import Input, { FORM_LABEL } from '../ui/Input';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export interface RunPlanSetupSheetProps {
  open: boolean;
  onCreate: (inputs: RunPlanInputs, createGoal: boolean) => void;
  onClose: () => void;
}

export const GUIDANCE = 'This plan is general guidance. Listen to your body and ease off if something hurts.';

const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v.replace(',', '.')));
const paceSec = (min: string, sec: string) => {
  const m = num(min);
  const s = sec.trim() === '' ? 0 : num(sec);
  return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : Number.NaN;
};

/** Native port of components/session/RunPlanSetupSheet.tsx: the 5K template's questions and a live preview. */
export default function RunPlanSetupSheet({ open, onCreate, onClose }: RunPlanSetupSheetProps) {
  const [current, setCurrent] = useState('3');
  const [easyMin, setEasyMin] = useState('6');
  const [easySec, setEasySec] = useState('30');
  const [target, setTarget] = useState('5');
  const [goalMode, setGoalMode] = useState<'pace' | 'finish'>('finish');
  const [targetMin, setTargetMin] = useState('6');
  const [targetSec, setTargetSec] = useState('00');
  const [weeks, setWeeks] = useState('8');
  const [days, setDays] = useState<DayKey[]>(['monday', 'wednesday', 'friday', 'sunday']);
  const [time, setTime] = useState('');
  const [start, setStart] = useState('');
  const [createGoal, setCreateGoal] = useState(true);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (open) {
      setStart(localISODate(new Date()));
      setTried(false);
    }
  }, [open]);

  const inputs: RunPlanInputs = {
    currentDistanceKm: num(current),
    easyPaceSecPerKm: paceSec(easyMin, easySec),
    targetDistanceKm: num(target),
    ...(goalMode === 'pace' ? { targetPaceSecPerKm: paceSec(targetMin, targetSec) } : {}),
    weeks: Math.round(num(weeks)),
    runDays: days,
    ...(time ? { startTime: time } : {}),
    startISO: start,
  };
  const today = localISODate(new Date());
  const error = goalMode === 'pace' && !(inputs.targetPaceSecPerKm! > 0) ? 'Enter your target pace.' : validateRunInputs(inputs, today);
  const key = JSON.stringify(inputs);
  const preview = useMemo(() => {
    if (error) return null;
    const sessions = generateRunPlan(inputs, [], 'preview', new Date().toISOString());
    return { summary: summarizeRunPlan(sessions), week1: sessions.filter((s) => s.generated?.weekIndex === 1) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, key]);

  const paceRow = (label: string, min: string, setMin: (v: string) => void, sec: string, setSec: (v: string) => void) => (
    <View>
      <Text className={FORM_LABEL}>{label}</Text>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <Input accessibilityLabel={`${label} minutes`} keyboardType="number-pad" value={min} onChangeText={setMin} />
        </View>
        <Text className="text-[16px] font-bold text-neutral-500">:</Text>
        <View className="flex-1">
          <Input accessibilityLabel={`${label} seconds`} keyboardType="number-pad" value={sec} onChangeText={setSec} />
        </View>
        <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">/km</Text>
      </View>
    </View>
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      scroll
      fullHeight
      footer={
        <Button
          variant="primary"
          fullWidth
          icon={<Icon icon={IconRun} size={18} strokeWidth={2.2} className={BUTTON_TEXT.primary} />}
          onPress={() => {
            setTried(true);
            if (!error) onCreate(inputs, createGoal);
          }}
        >
          Create plan
        </Button>
      }
    >
      <View className="gap-5 px-5 pb-6 pt-1">
        <SheetHeader eyebrow="Template" title="Run a 5K" onClose={onClose} />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Input label="You run now (km)" keyboardType="decimal-pad" value={current} onChangeText={setCurrent} />
          </View>
          <View className="flex-1">
            <Input label="Target (km)" keyboardType="decimal-pad" value={target} onChangeText={setTarget} />
          </View>
        </View>
        {paceRow('Easy pace', easyMin, setEasyMin, easySec, setEasySec)}
        <View>
          <Text className={FORM_LABEL}>Goal</Text>
          <SegmentedControl
            ariaLabel="Goal"
            options={[{ value: 'finish', label: 'Just finish' }, { value: 'pace', label: 'Target pace' }] as const}
            value={goalMode}
            onChange={setGoalMode}
          />
        </View>
        {goalMode === 'pace' ? paceRow('Target pace', targetMin, setTargetMin, targetSec, setTargetSec) : null}
        {/* Own rows: at half width the start date ("Sun, 15 Nov 2026") was cut off. */}
        <Input label="Weeks" keyboardType="number-pad" value={weeks} onChangeText={setWeeks} />
        <DateInput label="Start" value={start} onChange={setStart} min={today} />
        <View>
          <Text className={FORM_LABEL}>Run days</Text>
          <WeekdayPicker selected={days} onChange={setDays} allowEmpty />
        </View>
        <TimeInput label="Usual time (optional)" value={time} onChange={setTime} />
        <View className="min-h-[44px] flex-row items-center justify-between gap-3">
          <Text className="text-[14px] font-semibold text-neutral-800 dark:text-neutral-200">Also add this as a goal</Text>
          <Toggle on={createGoal} onChange={setCreateGoal} label="Also add this as a goal" />
        </View>

        {preview ? (
          <View className="rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-white/[0.07] dark:bg-neutral-900">
            <Text className="text-[14px] font-bold text-neutral-900 dark:text-white">
              {preview.summary.weeks} weeks · {preview.summary.runsPerWeek} runs a week · long run grows {preview.summary.longRunFromKm} to {preview.summary.longRunToKm} km
            </Text>
            <View className="mt-3 gap-1.5">
              {preview.week1.map((s) => (
                <View key={s.id} className="flex-row gap-2">
                  <Text className="w-10 text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">
                    {new Date(`${s.dateISO}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
                  </Text>
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                    {s.title} · {headline(s)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <Text className="text-[12.5px] font-medium text-neutral-500 dark:text-neutral-400">{GUIDANCE}</Text>
        {tried && error ? <Text accessibilityRole="alert" className="text-[13px] font-semibold text-rose-600 dark:text-rose-400">{error}</Text> : null}
      </View>
    </BottomSheet>
  );
}
