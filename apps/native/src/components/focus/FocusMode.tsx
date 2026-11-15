import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconCheck, IconChevronLeft, IconChevronRight, IconPlayerPause, IconPlayerPlay, IconX } from '@tabler/icons-react-native';
import type { ScheduleEntry, TargetValues } from '@planr/core/lib/scheduleEntry';
import type { LoggedSet, SetLog, Task } from '@planr/core/lib/scheduleTypes';
import {
  allStepsDone,
  currentStepId,
  formatClock,
  restRemainingSeconds,
  stepElapsedMs,
  totalElapsedMs,
  type FocusAction,
  type FocusState,
} from '@planr/core/lib/focusSession';
import { previousSetLog, setLogFor, setLogId, startingSets } from '@planr/core/lib/setLogs';
import { formatStrengthTargets, hasStrengthTargets } from '@planr/core/lib/subtaskTargets';
import { formatMinutes } from '@planr/core/lib/timeUtils';
import { haptic } from '../../lib/haptics';
import { useNowTick } from '../../lib/useFocusSession';
import Button, { BUTTON_TEXT } from '../ui/Button';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import SetTable from '../activity/SetTable';
import ProgressionCard from '../activity/ProgressionCard';
import type { ProgressionSuggestion } from '@planr/core/lib/subtaskProgression';

export interface FocusFinish {
  logs: SetLog[];
  doneStepIds: string[];
}

interface FocusModeProps {
  focus: FocusState;
  dispatch: (action: FocusAction) => void;
  task: Task;
  items: ScheduleEntry[];
  valuesFor: (item: ScheduleEntry) => TargetValues;
  setLogs: readonly SetLog[] | undefined;
  /** A progression step ready for this subtask today, if any. */
  suggestionFor?: (item: ScheduleEntry) => ProgressionSuggestion | null;
  onDecide?: (suggestion: ProgressionSuggestion, decision: 'accepted' | 'held') => void;
  onHide: () => void;
  onFinish: (result: FocusFinish) => void;
}

/**
 * Native port of components/focus/FocusMode.tsx — one subtask, its clock and
 * its set table, full screen over the app. Drawn as an overlay rather than a
 * sheet: it is a place you stay for an hour, and an iOS sheet can be swiped
 * away by accident.
 */
export default function FocusMode({ focus, dispatch, task, items, valuesFor, setLogs, suggestionFor, onDecide, onHide, onFinish }: FocusModeProps) {
  const insets = useSafeAreaInsets();
  const running = focus.runningSince != null;
  const resting = focus.restEndsAt != null;
  const now = useNowTick(running || resting);

  const stepId = currentStepId(focus);
  const item = stepId ? items.find((i) => i.id === stepId) ?? null : null;
  const values = item ? valuesFor(item) : {};
  const strength = !!item && (hasStrengthTargets(values) || !!focus.draftSets[item.id]);
  const previous = item ? previousSetLog(setLogs, task.id, item.id, focus.dateISO) : null;
  // A session continues what was already logged today (from the Log sets sheet
  // or an earlier focus run) rather than starting over and overwriting it.
  const todays = item ? setLogFor(setLogs, task.id, item.id, focus.dateISO) : null;
  const sets: LoggedSet[] = item ? focus.draftSets[item.id] ?? todays?.sets ?? startingSets(values, previous) : [];
  const weightUnit = values.weightUnit ?? 'kg';
  const restSeconds = item?.restSeconds ?? (task.stepBufferMinutes ? task.stepBufferMinutes * 60 : 0);

  const suggestion = item && suggestionFor ? suggestionFor(item) : null;
  const restLeft = restRemainingSeconds(focus, now);
  const stepMs = stepElapsedMs(focus, now);
  const targetMs = values.minutes != null ? values.minutes * 60_000 : null;
  const everyDone = allStepsDone(focus);
  const stepDone = !!stepId && focus.doneStepIds.includes(stepId);
  const total = items.length;
  const undone = focus.stepIds.filter((id) => !focus.doneStepIds.includes(id));
  const isFinalStep = total === 0 || (undone.length === 1 && undone[0] === stepId) || everyDone;

  const lastRest = useRef(restLeft);
  useEffect(() => {
    if (resting && running && restLeft === 0 && lastRest.current > 0) {
      haptic('medium');
      dispatch({ type: 'skipRest' });
    }
    lastRest.current = restLeft;
  }, [restLeft, resting, running, dispatch]);

  const [confirmLeave, setConfirmLeave] = useState(false);

  const upNext = useMemo(() => {
    const order = [...focus.stepIds.slice(focus.stepIndex + 1), ...focus.stepIds.slice(0, focus.stepIndex)];
    const id = order.find((sid) => !focus.doneStepIds.includes(sid));
    return id ? items.find((i) => i.id === id)?.task ?? null : null;
  }, [focus.stepIds, focus.stepIndex, focus.doneStepIds, items]);

  function finish(alsoDone?: string | null) {
    const logs: SetLog[] = [];
    for (const [subtaskId, draft] of Object.entries(focus.draftSets)) {
      if (!draft.some((s) => s.done)) continue;
      const entry = items.find((i) => i.id === subtaskId);
      logs.push({
        id: setLogId(task.id, subtaskId, focus.dateISO),
        taskId: task.id,
        subtaskId,
        dateISO: focus.dateISO,
        weightUnit: entry ? valuesFor(entry).weightUnit ?? 'kg' : 'kg',
        sets: draft,
        completedAt: new Date().toISOString(),
      });
    }
    const done = alsoDone && !focus.doneStepIds.includes(alsoDone) ? [...focus.doneStepIds, alsoDone] : focus.doneStepIds;
    onFinish({ logs, doneStepIds: total === 0 ? [] : done });
  }

  function primary() {
    haptic('medium');
    if (everyDone) return finish();
    if (isFinalStep) return finish(stepId);
    dispatch({ type: 'completeStep', now: Date.now() });
  }

  const label = 'text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400';
  const clock = 'text-[56px] font-extrabold leading-none text-neutral-950 dark:text-white';

  return (
    <View className="absolute inset-0 z-50 bg-white dark:bg-neutral-950" style={{ paddingTop: insets.top }} accessibilityViewIsModal>
      <View className="flex-row items-center gap-3 px-4 py-3">
        <IconButton label="Leave focus" variant="secondary" size="md" onPress={() => setConfirmLeave(true)}>
          <Icon icon={IconX} size={18} strokeWidth={2.2} className={ICON_BUTTON_TONE.secondary} />
        </IconButton>
        <View className="min-w-0 flex-1 items-center">
          <Text numberOfLines={1} className="text-[15px] font-bold text-neutral-900 dark:text-white">
            {task.title}
          </Text>
          <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400" style={{ fontVariant: ['tabular-nums'] }}>
            {total > 0 ? `Step ${focus.stepIndex + 1} of ${total} · ${focus.doneStepIds.length} done` : 'Focus'} · {formatClock(totalElapsedMs(focus, now))}
          </Text>
        </View>
        <View className="h-11 w-11" />
      </View>

      {total > 0 && (
        <View className="flex-row gap-1 px-5">
          {focus.stepIds.map((id, i) => (
            <View
              key={id}
              className={`h-1 flex-1 rounded-full ${
                focus.doneStepIds.includes(id) ? 'bg-green-600 dark:bg-green-500' : i === focus.stepIndex ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-white/10'
              }`}
            />
          ))}
        </View>
      )}

      <ScrollView className="min-h-0 flex-1" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={{ padding: 20, gap: 20 }}>
        <View>
          <Text className={`text-[26px] font-extrabold leading-tight ${stepDone ? 'text-neutral-400 line-through dark:text-neutral-500' : 'text-neutral-950 dark:text-white'}`}>
            {item?.task ?? task.title}
          </Text>
          {item && (formatStrengthTargets(values) || values.minutes != null) ? (
            <Text className="mt-1 text-[15px] font-semibold text-neutral-500 dark:text-neutral-400" style={{ fontVariant: ['tabular-nums'] }}>
              {[values.minutes != null ? formatMinutes(values.minutes) : '', formatStrengthTargets(values)].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {item?.info ? <Text className="mt-1 text-[14px] text-neutral-500 dark:text-neutral-400">{item.info}</Text> : null}
        </View>

        {suggestion && item?.progression && onDecide ? (
          <ProgressionCard suggestion={suggestion} name={item.task} cadence={item.progression.cadence} onDecide={(d) => onDecide(suggestion, d)} />
        ) : null}

        <View className="items-center rounded-2xl bg-neutral-100/70 px-5 py-5 dark:bg-white/[0.04]" accessibilityLiveRegion="polite">
          {resting ? (
            <>
              <Text className={label}>Rest</Text>
              <Text className={clock} style={{ fontVariant: ['tabular-nums'] }}>{formatClock(restLeft * 1000)}</Text>
              <View className="mt-3">
                <Button variant="secondary" size="md" onPress={() => dispatch({ type: 'skipRest' })}>
                  Skip rest
                </Button>
              </View>
            </>
          ) : (
            <>
              <Text className={label}>{running ? 'Elapsed' : 'Paused'}</Text>
              <Text className={clock} style={{ fontVariant: ['tabular-nums'] }}>{formatClock(stepMs)}</Text>
              {targetMs != null ? (
                <Text className="mt-2 text-[14px] font-semibold text-neutral-500 dark:text-neutral-400" style={{ fontVariant: ['tabular-nums'] }}>
                  {stepMs < targetMs ? `${formatClock(targetMs - stepMs)} left of ${formatMinutes(values.minutes!)}` : `${formatMinutes(values.minutes!)} reached`}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {strength && item ? (
          <SetTable
            sets={sets}
            onChange={(next) => dispatch({ type: 'setSets', stepId: item.id, sets: next })}
            previous={previous}
            weightUnit={weightUnit}
            showWeight={values.weight != null || sets.some((s) => s.weight != null)}
            onSetDone={() => {
              if (restSeconds > 0) dispatch({ type: 'startRest', seconds: restSeconds, now: Date.now() });
            }}
          />
        ) : null}

        {upNext && !everyDone ? (
          <Text className="text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">
            Up next: <Text className="text-neutral-800 dark:text-neutral-200">{upNext}</Text>
          </Text>
        ) : null}
      </ScrollView>

      <View
        className="flex-row items-center gap-2.5 border-t border-neutral-200 bg-white px-5 pt-3 dark:border-white/[0.08] dark:bg-neutral-950"
        style={{ paddingBottom: Math.max(12, insets.bottom) }}
      >
        {total > 1 && (
          <IconButton label="Previous step" variant="secondary" size="lg" disabled={focus.stepIndex === 0} onPress={() => dispatch({ type: 'goTo', index: focus.stepIndex - 1, now: Date.now() })}>
            <Icon icon={IconChevronLeft} size={20} strokeWidth={2.2} className={ICON_BUTTON_TONE.secondary} />
          </IconButton>
        )}
        <IconButton label={running ? 'Pause' : 'Resume'} variant="secondary" size="lg" onPress={() => dispatch({ type: running ? 'pause' : 'resume', now: Date.now() })}>
          <Icon icon={running ? IconPlayerPause : IconPlayerPlay} size={20} strokeWidth={2.2} className={ICON_BUTTON_TONE.secondary} />
        </IconButton>
        <View className="flex-1">
          <Button variant="cta" fullWidth onPress={primary} icon={<Icon icon={IconCheck} size={18} strokeWidth={2.6} className={BUTTON_TEXT.cta} />}>
            {everyDone || isFinalStep ? 'Finish' : stepDone ? 'Next' : 'Done · next'}
          </Button>
        </View>
        {total > 1 && (
          <IconButton label="Skip to next step" variant="secondary" size="lg" disabled={focus.stepIndex >= total - 1} onPress={() => dispatch({ type: 'goTo', index: focus.stepIndex + 1, now: Date.now() })}>
            <Icon icon={IconChevronRight} size={20} strokeWidth={2.2} className={ICON_BUTTON_TONE.secondary} />
          </IconButton>
        )}
      </View>

      {/* Confirm drawn inside the overlay: presenting a system sheet over it
          would fight the modal queue, and this is two buttons. */}
      {confirmLeave && (
        <Pressable className="absolute inset-0 justify-end bg-black/30" onPress={() => setConfirmLeave(false)} accessibilityLabel="Stay in focus">
          <Pressable className="rounded-t-[28px] bg-white px-5 pt-5 dark:bg-neutral-900" style={{ paddingBottom: Math.max(32, insets.bottom + 12) }} onPress={() => {}}>
            <Text className="text-[18px] font-bold text-neutral-900 dark:text-white">Leave focus?</Text>
            <Text className="mt-1 text-[14px] text-neutral-500 dark:text-neutral-400">The clock keeps running. Open the task again to pick up where you left off.</Text>
            <View className="mt-5 gap-2">
              <Button variant="primary" fullWidth onPress={() => { setConfirmLeave(false); onHide(); }}>
                Leave, keep the session
              </Button>
              <Button variant="secondary" fullWidth onPress={() => { setConfirmLeave(false); finish(); }}>
                Finish now
              </Button>
            </View>
          </Pressable>
        </Pressable>
      )}
    </View>
  );
}
