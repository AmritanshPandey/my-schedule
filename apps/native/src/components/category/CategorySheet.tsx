import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { CategoryKind, TaskCategory } from '@planr/core/lib/scheduleTypes';
import { colorFromIcon, type AccentColor } from '@planr/core/lib/colorSystem';
import { defaultCategoryTitle } from '@planr/core/lib/taskCategories';
import { SECTION_ICONS } from '../SectionIcons';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { iconPickerClass, PlanColorPicker } from '../plan/planFormShared';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export const CATEGORY_TITLE_MAX = 24;

export interface CategoryDraft {
  title: string;
  icon: string;
  color: AccentColor;
  kind: CategoryKind;
}

const KIND_OPTIONS: Array<{ value: CategoryKind; label: string; hint: string }> = [
  { value: 'active', label: 'Active', hint: 'Work, training, errands — effort that fills your day.' },
  { value: 'rest', label: 'Rest', hint: 'Deliberate recovery. Counts as time spent, never as work.' },
  { value: 'sleep', label: 'Sleep', hint: 'Sets the waking day. Kept out of the active budget entirely.' },
];

/** Native port of components/category/CategorySheet.tsx — create or edit one category. */
export default function CategorySheet({
  open,
  category,
  onClose,
  onSave,
}: {
  open: boolean;
  category: TaskCategory | null;
  onClose: () => void;
  onSave: (draft: CategoryDraft) => void;
}) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState('star');
  const [color, setColor] = useState<AccentColor>('cyan');
  const [colorTouched, setColorTouched] = useState(false);
  const [titleTouched, setTitleTouched] = useState(false);
  const [kind, setKind] = useState<CategoryKind>('active');

  useEffect(() => {
    if (!open) return;
    if (category) {
      setTitle(category.title);
      setIcon(category.icon);
      setColor(category.color);
      setKind(category.kind ?? 'active');
      setColorTouched(true);
      setTitleTouched(true);
    } else {
      setTitle('');
      setIcon('star');
      setColor(colorFromIcon('star'));
      setKind('active');
      setColorTouched(false);
      setTitleTouched(false);
    }
  }, [open, category]);

  function handleSelectIcon(name: string) {
    setIcon(name);
    if (name === 'sleep' && kind === 'active') setKind('sleep');
    if (!colorTouched) setColor(colorFromIcon(name));
    if (!titleTouched) setTitle(defaultCategoryTitle(name));
  }

  const trimmed = title.trim();
  const canSave = trimmed.length > 0;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <View className="px-5 pb-8 pt-2">
        <SheetHeader eyebrow="Category" title={category ? 'Edit category' : 'New category'} onClose={onClose} />
        <View className="mt-5 gap-5">
          <Text className="text-[12px] text-neutral-500 dark:text-neutral-400">Every task in this category shares its icon and colour.</Text>
          <Input
            label="Title"
            value={title}
            maxLength={CATEGORY_TITLE_MAX}
            onChangeText={(v) => {
              setTitle(v);
              setTitleTouched(true);
            }}
            placeholder="Deep work"
            autoComplete="off"
            returnKeyType="done"
            accessibilityLabel="Category title"
          />

          <View>
            <Text className={`mb-2 ${typography.eyebrow}`}>Icon</Text>
            <View className="flex-row flex-wrap gap-2">
              {SECTION_ICONS.map(({ name, label, icon: glyph }) => {
                const cls = iconPickerClass(icon === name);
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: icon === name }}
                    onPress={() => handleSelectIcon(name)}
                    className={`${cls.box} w-[15%]`}
                  >
                    <Icon icon={glyph} size={18} strokeWidth={1.9} className={cls.icon} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          <PlanColorPicker
            value={color}
            onChange={(next) => {
              setColor(next);
              setColorTouched(true);
            }}
          />

          <View>
            <Text className={`mb-2 ${typography.eyebrow}`}>Counts as</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Counts as" className="flex-row gap-2">
              {KIND_OPTIONS.map((option) => {
                const active = kind === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    onPress={() => setKind(option.value)}
                    className={`flex-1 items-center rounded-xl border px-3 py-2 ${
                      active ? 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white' : 'border-neutral-200 dark:border-white/[0.12]'
                    }`}
                  >
                    <Text className={`text-[13px] font-bold ${active ? 'text-white dark:text-neutral-900' : 'text-neutral-600 dark:text-neutral-300'}`}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="mt-2 text-[12px] text-neutral-500 dark:text-neutral-400">{KIND_OPTIONS.find((o) => o.value === kind)?.hint}</Text>
          </View>

          <Button
            variant="primary"
            className="w-full"
            disabled={!canSave}
            onPress={() => {
              if (canSave) onSave({ title: trimmed, icon, color, kind });
            }}
          >
            {category ? 'Save category' : 'Create category'}
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}
