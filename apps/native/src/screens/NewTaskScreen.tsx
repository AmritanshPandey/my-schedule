import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useNavigation } from '@react-navigation/native';
import { DAYS } from '@planr/core/lib/scheduleConstants';
import { createTask } from '@planr/core/lib/taskMutations';
import { colors } from '../theme/colors';
import { GENERAL_PLAN_ID, ensureGeneralPlan, getSchedule, updateSchedule } from '../storage/scheduleStore';

function todayDayKey() {
  return DAYS[(new Date().getDay() + 6) % 7];
}

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {children}
    </Text>
  );
}

export default function NewTaskScreen() {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  const schedule = getSchedule();
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('9:00 AM');
  const [endTime, setEndTime] = useState('10:00 AM');
  const [planId, setPlanId] = useState(schedule.plans[0]?.id ?? GENERAL_PLAN_ID);

  const plans = schedule.plans.length > 0 ? schedule.plans : [{ id: GENERAL_PLAN_ID, title: 'General' }];

  function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    updateSchedule((s) => {
      const withPlan = ensureGeneralPlan(s);
      return createTask(
        { title: trimmed, startTime, endTime, planId },
        [todayDayKey()],
        null,
      )(withPlan);
    });
    navigation.goBack();
  }

  return (
    <ScrollView className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" contentContainerStyle={{ padding: 20, gap: 18 }}>
      <View>
        <FieldLabel>Title</FieldLabel>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Task title"
          placeholderTextColor={c.muted}
          autoFocus
          className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
        />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <FieldLabel>Start</FieldLabel>
          <TextInput
            value={startTime}
            onChangeText={setStartTime}
            placeholder="9:00 AM"
            placeholderTextColor={c.muted}
            className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
          />
        </View>
        <View className="flex-1">
          <FieldLabel>End</FieldLabel>
          <TextInput
            value={endTime}
            onChangeText={setEndTime}
            placeholder="10:00 AM"
            placeholderTextColor={c.muted}
            className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
          />
        </View>
      </View>

      <View>
        <FieldLabel>Plan</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {plans.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setPlanId(p.id)}
              className={`rounded-full border px-3.5 py-2 ${
                planId === p.id
                  ? 'border-black bg-black dark:border-white dark:bg-white'
                  : 'border-black/[0.12] bg-white dark:border-white/[0.12] dark:bg-neutral-900'
              }`}
            >
              <Text
                className={`text-[13px] font-semibold ${
                  planId === p.id ? 'text-white dark:text-black' : 'text-black dark:text-white'
                }`}
              >
                {p.title}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable
        onPress={save}
        disabled={!title.trim()}
        className="mt-2 items-center rounded-full bg-black py-3.5 disabled:opacity-40 dark:bg-white"
      >
        <Text className="text-[15px] font-bold text-white dark:text-black">Add task</Text>
      </Pressable>
    </ScrollView>
  );
}
