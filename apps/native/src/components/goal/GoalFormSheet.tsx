import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Goal, Schedule } from '@planr/core/lib/scheduleTypes';
import { createGoal, updateGoal } from '@planr/core/lib/goalMutations';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DateInput from '../ui/DateInput';
import { Text } from '../ui/Text';

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

export const GOAL_TITLE_MAX = 60;

/** Native port of components/goal/GoalFormSheet.tsx — create or edit a Goal. */
export default function GoalFormSheet({ open, onClose, setSchedule, goal }: { open: boolean; onClose: () => void; setSchedule: SetScheduleFn; goal?: Goal | null }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [targetDate, setTargetDate] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title ?? '');
    setDescription(goal?.description ?? '');
    setStartDate(goal?.startDate ?? '');
    setTargetDate(goal?.targetDate ?? '');
  }, [open, goal]);

  function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    if (goal) setSchedule((prev) => updateGoal(prev, goal.id, { title: trimmedTitle, description, startDate, targetDate }));
    else setSchedule((prev) => createGoal(prev, { title: trimmedTitle, description, startDate, targetDate }));
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View className="gap-4 p-5 pb-8">
        <SheetHeader eyebrow={goal ? 'Edit' : 'New'} title={goal ? 'Edit goal' : 'Create goal'} onClose={onClose} />
        <View className="gap-2.5">
          <View>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder="Goal — e.g. Get a senior UX design job"
              autoFocus
              maxLength={GOAL_TITLE_MAX}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (title.trim()) handleSubmit();
              }}
              accessibilityLabel="Goal title"
            />
            <Text className="mt-1 text-right text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
              {title.length}/{GOAL_TITLE_MAX}
            </Text>
          </View>
          <Input value={description} onChangeText={setDescription} placeholder="Short description (optional)" accessibilityLabel="Goal description" />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <DateInput label="Start date" value={startDate} onChange={setStartDate} clearable />
            </View>
            <View className="flex-1">
              <DateInput label="Target date" value={targetDate} onChange={setTargetDate} clearable />
            </View>
          </View>
        </View>
        <Button fullWidth onPress={handleSubmit} disabled={!title.trim()}>
          {goal ? 'Save changes' : 'Create goal'}
        </Button>
      </View>
    </BottomSheet>
  );
}
