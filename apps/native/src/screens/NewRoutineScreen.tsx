import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useNavigation } from '@react-navigation/native';
import { uid } from '@planr/core/lib/id';
import { DAYS, DAY_LABELS, type DayKey } from '@planr/core/lib/scheduleConstants';
import { RITUAL_TRACKING_TYPES, type Ritual, type RitualTrackingType } from '@planr/core/lib/scheduleTypes';
import { colors } from '../theme/colors';
import { updateSchedule } from '../storage/scheduleStore';

const TRACKING_LABELS: Record<RitualTrackingType, string> = {
  checkbox: 'Checkbox',
  quantity: 'Quantity',
  duration: 'Duration',
  count: 'Count',
  checklist: 'Checklist',
  times: 'Times a day',
};

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {children}
    </Text>
  );
}

export default function NewRoutineScreen() {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  const [title, setTitle] = useState('');
  const [time, setTime] = useState('07:00');
  const [trackingType, setTrackingType] = useState<RitualTrackingType>('checkbox');
  const [unit, setUnit] = useState('');
  const [target, setTarget] = useState('');
  const [days, setDays] = useState<DayKey[]>([]);

  function toggleDay(day: DayKey) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    const ritual: Ritual = {
      id: uid(),
      title: trimmed,
      time,
      repeatDays: days.length > 0 ? days : undefined,
      trackingType,
      unit: unit.trim() || undefined,
      target: target.trim() ? Number(target) : undefined,
    };
    updateSchedule((s) => ({ ...s, rituals: [...s.rituals, ritual] }));
    navigation.goBack();
  }

  return (
    <ScrollView className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" contentContainerStyle={{ padding: 20, gap: 18 }}>
      <View>
        <FieldLabel>Title</FieldLabel>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Morning walk"
          placeholderTextColor={c.muted}
          autoFocus
          className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
        />
      </View>

      <View>
        <FieldLabel>Time (24h, HH:MM)</FieldLabel>
        <TextInput
          value={time}
          onChangeText={setTime}
          placeholder="07:00"
          placeholderTextColor={c.muted}
          className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
        />
      </View>

      <View>
        <FieldLabel>Tracking</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {RITUAL_TRACKING_TYPES.map((tt) => (
            <Pressable
              key={tt}
              onPress={() => setTrackingType(tt)}
              className={`rounded-full border px-3.5 py-2 ${
                trackingType === tt
                  ? 'border-black bg-black dark:border-white dark:bg-white'
                  : 'border-black/[0.12] bg-white dark:border-white/[0.12] dark:bg-neutral-900'
              }`}
            >
              <Text className={`text-[13px] font-semibold ${trackingType === tt ? 'text-white dark:text-black' : 'text-black dark:text-white'}`}>
                {TRACKING_LABELS[tt]}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {(trackingType === 'quantity' || trackingType === 'duration' || trackingType === 'count') && (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FieldLabel>Unit</FieldLabel>
            <TextInput
              value={unit}
              onChangeText={setUnit}
              placeholder="ml, min, reps…"
              placeholderTextColor={c.muted}
              className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
            />
          </View>
          <View className="flex-1">
            <FieldLabel>Target</FieldLabel>
            <TextInput
              value={target}
              onChangeText={setTarget}
              placeholder="2000"
              keyboardType="numeric"
              placeholderTextColor={c.muted}
              className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
            />
          </View>
        </View>
      )}

      <View>
        <FieldLabel>Repeat (none selected = every day)</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {DAYS.map((day) => (
            <Pressable
              key={day}
              onPress={() => toggleDay(day)}
              className={`h-10 w-10 items-center justify-center rounded-full border ${
                days.includes(day)
                  ? 'border-black bg-black dark:border-white dark:bg-white'
                  : 'border-black/[0.12] bg-white dark:border-white/[0.12] dark:bg-neutral-900'
              }`}
            >
              <Text className={`text-[12px] font-bold ${days.includes(day) ? 'text-white dark:text-black' : 'text-black dark:text-white'}`}>
                {DAY_LABELS[day]}
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
        <Text className="text-[15px] font-bold text-white dark:text-black">Add routine</Text>
      </Pressable>
    </ScrollView>
  );
}
