import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useColorScheme } from 'nativewind';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { Goal } from '@planr/core/lib/scheduleTypes';
import { createGoal, updateGoal } from '@planr/core/lib/goalMutations';
import { formatDateShort, todayISO } from '@planr/core/lib/dateUtils';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';
import { colors } from '../theme/colors';

type RootStackParamList = {
  NewGoal: { goalId?: string } | undefined;
};

const GOAL_TITLE_MAX = 60;

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {children}
    </Text>
  );
}

/** Inline native date field — a tap opens the platform's own date picker
 *  (DateTimePicker), matching how iOS/Android users already expect to set a
 *  date, rather than a text input for an ISO string. */
function DateField({
  label,
  value,
  onChange,
  minimumDate,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  minimumDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  return (
    <View className="flex-1">
      <FieldLabel>{label}</FieldLabel>
      <Pressable
        onPress={() => setOpen(true)}
        className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 dark:border-white/[0.09] dark:bg-neutral-900"
      >
        <Text className={value ? 'text-[15px] text-black dark:text-white' : 'text-[15px] text-neutral-400 dark:text-neutral-500'}>
          {value ? formatDateShort(value) : 'Not set'}
        </Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={value ? new Date(`${value}T12:00:00`) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          minimumDate={minimumDate}
          themeVariant={colorScheme ?? 'light'}
          onChange={(_event, date) => {
            setOpen(Platform.OS === 'ios');
            if (date) onChange(date.toISOString().slice(0, 10));
          }}
        />
      )}
    </View>
  );
}

export default function NewGoalScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'NewGoal'>>();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  const editingId = route.params?.goalId;
  const existing = editingId ? getSchedule().goals?.find((g) => g.id === editingId) ?? null : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [targetDate, setTargetDate] = useState(existing?.targetDate ?? '');

  useEffect(() => {
    navigation.setOptions({ title: existing ? 'Edit Goal' : 'New Goal' });
  }, [navigation, existing]);

  function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const input = { title: trimmed, description, startDate, targetDate };
    if (existing) {
      updateSchedule((s) => updateGoal(s, existing.id, input));
    } else {
      updateSchedule((s) => createGoal(s, input));
    }
    navigation.goBack();
  }

  return (
    <ScrollView className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" contentContainerStyle={{ padding: 20, gap: 18 }}>
      <View>
        <FieldLabel>Title</FieldLabel>
        <TextInput
          value={title}
          onChangeText={(t) => setTitle(t.slice(0, GOAL_TITLE_MAX))}
          placeholder="e.g. Get a senior UX design job"
          placeholderTextColor={c.muted}
          autoFocus={!existing}
          className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
        />
        <Text className="mt-1 text-right text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          {title.length}/{GOAL_TITLE_MAX}
        </Text>
      </View>

      <View>
        <FieldLabel>Description (optional)</FieldLabel>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Short description"
          placeholderTextColor={c.muted}
          multiline
          className="min-h-[70px] rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[15px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
        />
      </View>

      <View className="flex-row gap-3">
        <DateField label="Start date" value={startDate} onChange={setStartDate} />
        <DateField label="Target date" value={targetDate} onChange={setTargetDate} minimumDate={startDate ? new Date(`${startDate}T12:00:00`) : undefined} />
      </View>

      <Pressable
        onPress={save}
        disabled={!title.trim()}
        className="mt-2 items-center rounded-full bg-black py-3.5 disabled:opacity-40 dark:bg-white"
      >
        <Text className="text-[15px] font-bold text-white dark:text-black">{existing ? 'Save changes' : 'Create goal'}</Text>
      </Pressable>
    </ScrollView>
  );
}
