import { useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, View } from 'react-native';
import { IconCheck, IconPlus, IconSearch, IconX } from '@tabler/icons-react-native';
import type { Plan, Task } from '@planr/core/lib/scheduleTypes';
import BottomSheet from '../ui/BottomSheet';
import IconButton, { ICON_BUTTON_TONE } from '../ui/IconButton';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';
import { SECTION_ICONS } from '../SectionIcons';

/**
 * Native port of components/notes/TaskLinkPicker.tsx — a searchable picker to
 * attach tasks to a note. Stays open so several can be added in a row;
 * already-linked tasks show a check. `tasks` is de-duplicated by id.
 */
export default function TaskLinkPicker({
  open,
  tasks,
  plans,
  linkedIds,
  onAdd,
  onClose,
}: {
  open: boolean;
  tasks: Task[];
  plans: Plan[];
  linkedIds: string[];
  onAdd: (taskId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  // plan.emoji holds a Tabler icon NAME — resolve it to a component.
  const planIcon = useMemo(() => {
    const byName = new Map(SECTION_ICONS.map((s) => [s.name, s.icon]));
    return new Map(plans.map((p) => [p.id, byName.get(p.emoji) ?? SECTION_ICONS[0].icon]));
  }, [plans]);
  const linked = new Set(linkedIds);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks;
    return [...list].sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, query]);

  return (
    <BottomSheet open={open} onClose={onClose} scroll={false}>
      <View className="gap-4 px-5 pb-8 pt-5">
        <View className="flex-row items-center justify-between">
          <Text accessibilityRole="header" className="text-[18px] font-bold text-neutral-900 dark:text-white">
            Link a task
          </Text>
          <IconButton label="Close" variant="soft" size="md" radius="full" onPress={onClose}>
            <Icon icon={IconX} size={18} strokeWidth={2.2} className={ICON_BUTTON_TONE.soft} />
          </IconButton>
        </View>

        <View className="relative justify-center">
          <View pointerEvents="none" className="absolute left-3 z-10">
            <Icon icon={IconSearch} size={15} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search tasks"
            className="h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-[16px] text-neutral-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          />
        </View>

        <ScrollView style={{ maxHeight: Dimensions.get('window').height * 0.5 }} keyboardShouldPersistTaps="handled">
          {filtered.length === 0 ? (
            <Text className="py-6 text-center text-[13px] text-neutral-500 dark:text-neutral-400">{tasks.length === 0 ? 'No tasks yet.' : 'No tasks match.'}</Text>
          ) : (
            <View className="gap-1">
              {filtered.map((task) => {
                const isLinked = linked.has(task.id);
                return (
                  <Pressable
                    key={task.id}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isLinked }}
                    disabled={isLinked}
                    onPress={() => onAdd(task.id)}
                    className={`min-h-[44px] flex-row items-center gap-3 rounded-xl px-3 py-2 ${isLinked ? 'opacity-60' : 'active:bg-neutral-100 dark:active:bg-white/[0.05]'}`}
                  >
                    <Icon icon={planIcon.get(task.planId) ?? SECTION_ICONS[0].icon} size={17} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
                    <Text className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-800 dark:text-neutral-200">{task.title}</Text>
                    <Icon
                      icon={isLinked ? IconCheck : IconPlus}
                      size={16}
                      strokeWidth={2.4}
                      className={`shrink-0 ${isLinked ? 'text-emerald-500' : 'text-neutral-500 dark:text-neutral-400'}`}
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </BottomSheet>
  );
}
