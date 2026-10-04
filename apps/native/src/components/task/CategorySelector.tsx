import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { IconCheck, IconChevronDown, IconMinus, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react-native';
import type { TaskCategory } from '@planr/core/lib/scheduleTypes';
import { canDeleteCategory } from '@planr/core/lib/taskCategories';
import { accentStyles } from '@planr/core/lib/colorSystem';
import { iconGlyph } from '../SectionIcons';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export interface CategorySelectorProps {
  categories: TaskCategory[];
  selectedId: string;
  onSelect: (category: TaskCategory) => void;
  onClear?: () => void;
  onCreate: () => void;
  onEdit?: (category: TaskCategory) => void;
  onDelete?: (category: TaskCategory) => void;
  usage?: ReadonlyMap<string, number>;
  optional?: boolean;
}

/**
 * Native port of components/task/CategorySelector.tsx — picks the category
 * (icon + colour) a task belongs to, with inline edit/delete and "New
 * category". Delete stays disabled for a category that's still in use.
 */
export function CategorySelector({ categories, selectedId, onSelect, onClear, onCreate, onEdit, onDelete, usage, optional = false }: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === selectedId) ?? null;
  const showClear = optional && !!onClear;
  const SelectedIcon = selected ? iconGlyph(selected.icon) : null;
  const selectedAccent = selected ? accentStyles(selected.color) : null;

  return (
    <View>
      <Text className={`mb-1.5 ${typography.eyebrow}`}>Category{optional ? ' (optional)' : ''}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={selected ? `Category: ${selected.title}` : 'Select a category'}
        onPress={() => setOpen((v) => !v)}
        className="h-11 w-full flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 dark:border-white/10 dark:bg-white/[0.04]"
      >
        {selected && SelectedIcon && selectedAccent ? (
          <>
            <View className={`h-6 w-6 shrink-0 items-center justify-center rounded-lg ${selectedAccent.tint}`}>
              <Icon icon={SelectedIcon} size={13} strokeWidth={2} className={selectedAccent.icon} />
            </View>
            <Text className="flex-1 truncate text-[14px] font-semibold text-neutral-900 dark:text-white">{selected.title}</Text>
          </>
        ) : (
          <Text className="flex-1 text-[14px] font-medium text-neutral-500 dark:text-neutral-400">
            {optional ? 'No category — counts as held time' : 'Select a category…'}
          </Text>
        )}
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon icon={IconChevronDown} size={16} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
        </View>
      </Pressable>

      {open && (
        <View className="mt-1 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900">
          <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
            {showClear && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onClear!();
                  setOpen(false);
                }}
                className={`w-full flex-row items-center gap-3 px-3 py-2.5 ${!selected ? 'bg-neutral-50 dark:bg-white/[0.04]' : ''}`}
              >
                <View className="h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dashed border-neutral-300 dark:border-white/20">
                  <Icon icon={IconMinus} size={14} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                </View>
                <Text className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-500 dark:text-neutral-400">No category — counts as held time</Text>
                {!selected && (
                  <View className="h-4 w-4 shrink-0 items-center justify-center rounded-full bg-neutral-200 dark:bg-white/[0.12]">
                    <Icon icon={IconCheck} size={10} strokeWidth={3} className="text-neutral-600 dark:text-neutral-200" />
                  </View>
                )}
              </Pressable>
            )}
            {categories.map((category, i) => {
              const glyph = iconGlyph(category.icon);
              const accent = accentStyles(category.color);
              const sel = selectedId === category.id;
              const inUse = usage?.get(category.id) ?? 0;
              const deletable = !!usage && canDeleteCategory(category.id, usage);
              return (
                <View
                  key={category.id}
                  className={`w-full flex-row items-center ${i > 0 || showClear ? 'border-t border-neutral-100 dark:border-white/[0.05]' : ''} ${
                    sel ? 'bg-neutral-50 dark:bg-white/[0.04]' : ''
                  }`}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    onPress={() => {
                      onSelect(category);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 flex-row items-center gap-3 py-2.5 pl-3 pr-1"
                  >
                    <View className={`h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accent.tint}`}>
                      <Icon icon={glyph} size={14} strokeWidth={2} className={accent.icon} />
                    </View>
                    <Text className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-900 dark:text-white">{category.title}</Text>
                    {sel && (
                      <View className={`h-4 w-4 shrink-0 items-center justify-center rounded-full ${accent.tint}`}>
                        <Icon icon={IconCheck} size={10} strokeWidth={3} className={accent.icon} />
                      </View>
                    )}
                  </Pressable>
                  {(onEdit || onDelete) && (
                    <View className="shrink-0 flex-row items-center gap-0.5 pr-2">
                      {onEdit && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${category.title}`}
                          onPress={() => {
                            setOpen(false);
                            onEdit(category);
                          }}
                          className="h-8 w-8 items-center justify-center rounded-lg active:bg-neutral-200/70 dark:active:bg-white/[0.08]"
                        >
                          <Icon icon={IconPencil} size={14} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                        </Pressable>
                      )}
                      {onDelete && (
                        <Pressable
                          accessibilityRole="button"
                          disabled={!deletable}
                          accessibilityLabel={
                            deletable ? `Delete ${category.title}` : `Can't delete ${category.title} — used by ${inUse} task${inUse === 1 ? '' : 's'}`
                          }
                          onPress={() => {
                            if (deletable) onDelete(category);
                          }}
                          className={`h-8 w-8 items-center justify-center rounded-lg active:bg-rose-500/10 ${deletable ? '' : 'opacity-30'}`}
                        >
                          <Icon icon={IconTrash} size={14} strokeWidth={2} className="text-neutral-500 dark:text-neutral-400" />
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setOpen(false);
              onCreate();
            }}
            className="w-full flex-row items-center gap-2 border-t border-neutral-100 px-3 py-2.5 active:bg-neutral-50 dark:border-white/[0.05] dark:active:bg-white/[0.04]"
          >
            <Icon icon={IconPlus} size={14} strokeWidth={2.2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
            <Text className="text-[13px] font-semibold text-neutral-500 dark:text-neutral-400">New category</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
