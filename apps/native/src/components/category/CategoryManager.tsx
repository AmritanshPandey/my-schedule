import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconPlus, IconTrash } from '@tabler/icons-react-native';
import type { Schedule, TaskCategory } from '@planr/core/lib/scheduleTypes';
import { canDeleteCategory, categoryUsageCounts } from '@planr/core/lib/taskCategories';
import { accentStyles } from '@planr/core/lib/colorSystem';
import { haptic } from '../../lib/haptics';
import { iconGlyph } from '../SectionIcons';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import CategorySheet, { type CategoryDraft } from './CategorySheet';

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

interface CategoryManagerProps {
  schedule: Schedule;
  setSchedule: SetScheduleFn;
}

function uid(): string {
  return `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Native port of components/category/CategoryManager.tsx — Settings →
 * Categories. Create, rename, recolour and delete the categories every task's
 * identity resolves through. Deleting an in-use category is blocked rather
 * than cascading; the row states the count instead.
 */
export default function CategoryManager({ schedule, setSchedule }: CategoryManagerProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<TaskCategory | null>(null);

  const usageById = useMemo(() => categoryUsageCounts(schedule.activities), [schedule.activities]);

  const categories = useMemo(
    () => [...schedule.categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title)),
    [schedule.categories],
  );

  function handleSave(draft: CategoryDraft) {
    setSchedule((prev) => {
      if (editing) {
        return {
          ...prev,
          categories: prev.categories.map((c) => (c.id === editing.id ? { ...c, ...draft } : c)),
        };
      }
      return { ...prev, categories: [...prev.categories, { id: uid(), ...draft }] };
    });
    setSheetOpen(false);
    setEditing(null);
  }

  function handleDelete(category: TaskCategory) {
    if (!canDeleteCategory(category.id, usageById)) return;
    haptic('light');
    setSchedule((prev) => ({ ...prev, categories: prev.categories.filter((c) => c.id !== category.id) }));
  }

  return (
    <>
      {categories.length === 0 ? (
        <View className="items-center rounded-xl border border-dashed border-neutral-200 px-4 py-6 dark:border-white/[0.10]">
          <Text className="text-center text-[13px] font-bold text-neutral-900 dark:text-white">No categories yet</Text>
          <Text className="mt-1 text-center text-[12px] text-neutral-500 dark:text-neutral-400">Add one to give your tasks a colour.</Text>
        </View>
      ) : (
        <View>
          {categories.map((category, i) => {
            const accent = accentStyles(category.color);
            const inUse = usageById.get(category.id) ?? 0;
            return (
              <View key={category.id} className={`flex-row items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''}`}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${category.title}`}
                  onPress={() => {
                    haptic('light');
                    setEditing(category);
                    setSheetOpen(true);
                  }}
                  className="min-w-0 flex-1 flex-row items-center gap-3"
                >
                  <View className={`h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accent.tint}`}>
                    <Icon icon={iconGlyph(category.icon)} size={17} strokeWidth={2} className={accent.icon} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="truncate text-[14px] font-bold text-neutral-900 dark:text-white">{category.title}</Text>
                    <Text className="mt-0.5 text-[12px] text-neutral-500 dark:text-neutral-400">
                      {inUse === 0 ? 'Not used yet' : `Used by ${inUse} task${inUse === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    inUse > 0 ? `Can't delete ${category.title} — used by ${inUse} task${inUse === 1 ? '' : 's'}` : `Delete ${category.title}`
                  }
                  accessibilityState={{ disabled: inUse > 0 }}
                  onPress={() => handleDelete(category)}
                  disabled={inUse > 0}
                  className={`h-9 w-9 shrink-0 items-center justify-center rounded-xl active:bg-rose-500/10 ${inUse > 0 ? 'opacity-30' : ''}`}
                >
                  <Icon icon={IconTrash} size={16} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptic('light');
          setEditing(null);
          setSheetOpen(true);
        }}
        className="mt-3 w-full flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-200 py-2.5 active:border-neutral-300 dark:border-white/[0.10] dark:active:border-white/20"
      >
        <Icon icon={IconPlus} size={15} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
        <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">New category</Text>
      </Pressable>

      <CategorySheet
        open={sheetOpen}
        category={editing}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />
    </>
  );
}
