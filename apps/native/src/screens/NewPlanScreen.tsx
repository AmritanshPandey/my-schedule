import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { useNavigation } from '@react-navigation/native';
import { uid } from '@planr/core/lib/id';
import { colorFromIcon } from '@planr/core/lib/colorSystem';
import { colors } from '../theme/colors';
import { ICON_MAP, PLAN_ICON_KEYS } from '../theme/planIcons';
import { getSchedule, updateSchedule } from '../storage/scheduleStore';

function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {children}
    </Text>
  );
}

export default function NewPlanScreen() {
  const navigation = useNavigation();
  const { colorScheme } = useColorScheme();
  const c = colors[colorScheme ?? 'light'];

  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState(PLAN_ICON_KEYS[0]);
  const [goalId, setGoalId] = useState<string | null>(null);
  const goals = getSchedule().goals?.filter((g) => g.status === 'active') ?? [];

  function save() {
    const trimmed = title.trim();
    if (!trimmed) return;
    updateSchedule((s) => ({
      ...s,
      plans: [
        ...s.plans,
        {
          id: uid(),
          title: trimmed,
          category: 'routine',
          emoji,
          color: colorFromIcon(emoji),
          items: [],
          goalId: goalId ?? undefined,
        },
      ],
    }));
    navigation.goBack();
  }

  return (
    <ScrollView className="flex-1 bg-[#F3F4F1] dark:bg-[#0E0E0E]" contentContainerStyle={{ padding: 20, gap: 18 }}>
      <View>
        <FieldLabel>Title</FieldLabel>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Marathon training"
          placeholderTextColor={c.muted}
          autoFocus
          className="rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-[16px] text-black dark:border-white/[0.09] dark:bg-neutral-900 dark:text-white"
        />
      </View>

      <View>
        <FieldLabel>Icon</FieldLabel>
        <View className="flex-row flex-wrap gap-2">
          {PLAN_ICON_KEYS.map((key) => {
            const Icon = ICON_MAP[key];
            const selected = emoji === key;
            const hex = colorFromIcon(key);
            return (
              <Pressable
                key={key}
                onPress={() => setEmoji(key)}
                className="h-12 w-12 items-center justify-center rounded-full border-2"
                style={{ borderColor: selected ? '#00A63E' : 'transparent', backgroundColor: hex + '1F' }}
              >
                <Icon size={20} strokeWidth={1.8} color={hex} />
              </Pressable>
            );
          })}
        </View>
      </View>

      {goals.length > 0 && (
        <View>
          <FieldLabel>Goal (optional)</FieldLabel>
          <View className="flex-row flex-wrap gap-2">
            <Pressable
              onPress={() => setGoalId(null)}
              className={`rounded-full border px-3.5 py-2 ${
                goalId === null
                  ? 'border-black bg-black dark:border-white dark:bg-white'
                  : 'border-black/[0.12] bg-white dark:border-white/[0.12] dark:bg-neutral-900'
              }`}
            >
              <Text className={`text-[13px] font-semibold ${goalId === null ? 'text-white dark:text-black' : 'text-black dark:text-white'}`}>
                None
              </Text>
            </Pressable>
            {goals.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => setGoalId(g.id)}
                className={`rounded-full border px-3.5 py-2 ${
                  goalId === g.id
                    ? 'border-black bg-black dark:border-white dark:bg-white'
                    : 'border-black/[0.12] bg-white dark:border-white/[0.12] dark:bg-neutral-900'
                }`}
              >
                <Text
                  className={`text-[13px] font-semibold ${goalId === g.id ? 'text-white dark:text-black' : 'text-black dark:text-white'}`}
                  numberOfLines={1}
                >
                  {g.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Pressable
        onPress={save}
        disabled={!title.trim()}
        className="mt-2 items-center rounded-full bg-black py-3.5 disabled:opacity-40 dark:bg-white"
      >
        <Text className="text-[15px] font-bold text-white dark:text-black">Add plan</Text>
      </Pressable>
    </ScrollView>
  );
}
