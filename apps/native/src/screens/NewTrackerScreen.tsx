import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useNavigation } from '@react-navigation/native';
import { uid } from '@planr/core/lib/id';
import { GENERAL_PLAN_ID, ensureGeneralPlan, getSchedule, updateSchedule } from '../storage/scheduleStore';
import { colors } from '../theme/colors';

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {children}
    </Text>
  );
}

export default function NewTrackerScreen() {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  const schedule = getSchedule();
  const [title, setTitle] = useState('');
  const [unit, setUnit] = useState('');
  const [dailyTarget, setDailyTarget] = useState('');
  const [planId, setPlanId] = useState(schedule.plans[0]?.id ?? GENERAL_PLAN_ID);

  const plans = schedule.plans.length > 0 ? schedule.plans : [{ id: GENERAL_PLAN_ID, title: 'General' }];

  function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    updateSchedule((s) => {
      const withPlan = ensureGeneralPlan(s);
      return {
        ...withPlan,
        progressTrackers: [
          ...withPlan.progressTrackers,
          {
            id: uid(),
            planId,
            title: trimmed,
            type: 'number',
            unit: unit.trim() || undefined,
            dailyTarget: dailyTarget.trim() ? Number(dailyTarget) : undefined,
          },
        ],
      };
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
          placeholder="e.g. Water"
          placeholderTextColor={c.muted}
          autoFocus
          className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
        />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <FieldLabel>Unit</FieldLabel>
          <TextInput
            value={unit}
            onChangeText={setUnit}
            placeholder="ml, kg, pages…"
            placeholderTextColor={c.muted}
            className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
          />
        </View>
        <View className="flex-1">
          <FieldLabel>Daily target</FieldLabel>
          <TextInput
            value={dailyTarget}
            onChangeText={setDailyTarget}
            placeholder="2000"
            keyboardType="numeric"
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
        <Text className="text-[15px] font-bold text-white dark:text-black">Add tracker</Text>
      </Pressable>
    </ScrollView>
  );
}
