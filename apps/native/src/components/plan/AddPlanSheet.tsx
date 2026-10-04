import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconPlus, IconX } from '@tabler/icons-react-native';
import type { SummaryConfig, ProgressTracker, Plan, Schedule, Goal } from '@planr/core/lib/scheduleTypes';
import { uid } from '@planr/core/lib/id';
import { categoryFromIcon, colorFromIcon, type AccentColor } from '@planr/core/lib/colorSystem';
import { stableFieldHash } from '@planr/core/lib/hash';
import { SECTION_ICONS } from '../SectionIcons';
import BottomSheet from '../ui/BottomSheet';
import SheetHeader from '../ui/SheetHeader';
import Button from '../ui/Button';
import Input from '../ui/Input';
import DateInput from '../ui/DateInput';
import { cycleAccentColor } from '../ui/Badge';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { PLAN_TITLE_MAX, DurationPresets, iconPickerClass } from './planFormShared';

type SetScheduleFn = (updater: (prev: Schedule) => Schedule) => void;

function inferUnit(label: string): string {
  const key = label.toLowerCase();
  if (key.includes('calorie')) return 'kcal';
  if (key.includes('protein') || key.includes('carb') || /\bfat\b/.test(key)) return 'g';
  if (key.includes('duration') || key.includes('time')) return 'min';
  if (key.includes('weight')) return 'kg';
  return '';
}

function createSummaryFromMeta(metaFields: string[]): SummaryConfig[] {
  return metaFields.map((field) => ({
    label: field,
    metaKey: field,
    unit: inferUnit(field),
    colorClass: `accent-${cycleAccentColor(stableFieldHash(field))}`,
  }));
}

export function GoalChips({ goals, value, onChange }: { goals: Goal[]; value: string; onChange: (id: string) => void }) {
  const options = [{ id: '', title: 'No goal' }, ...goals.map((g) => ({ id: g.id, title: g.title }))];
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {options.map((g) => {
        const on = value === g.id;
        return (
          <Pressable
            key={g.id || 'none'}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(g.id)}
            className={`rounded-full border px-3 py-1.5 ${
              on ? 'border-neutral-950 bg-neutral-950 dark:border-white dark:bg-white' : 'border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]'
            }`}
          >
            <Text className={`text-[13px] font-semibold ${on ? 'text-white dark:text-neutral-900' : 'text-neutral-700 dark:text-neutral-300'}`}>{g.title}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Native port of components/plan/AddPlanSheet.tsx — create a plan: title,
 * description, dates (or a duration preset), optional goal, icon, and
 * optional progress trackers. (The web's "Build this with AI" entry is part
 * of the AI scope and isn't offered here.)
 */
export default function AddPlanSheet({ open, onClose, setSchedule, goals = [] }: { open: boolean; onClose: () => void; setSchedule: SetScheduleFn; goals?: Goal[] }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [iconName, setIconName] = useState('brain');
  const [color, setColor] = useState<AccentColor>(() => colorFromIcon('brain'));
  const [metaFields, setMetaFields] = useState<string[]>([]);
  const [metaInput, setMetaInput] = useState('');
  const [goalId, setGoalId] = useState('');

  function reset() {
    setTitle('');
    setDescription('');
    setStartDate('');
    setEndDate('');
    setIconName('brain');
    setColor(colorFromIcon('brain'));
    setMetaFields([]);
    setMetaInput('');
    setGoalId('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSchedule((prev) => {
      const plan: Plan = {
        id: uid(),
        title: trimmedTitle,
        description: description.trim() || undefined,
        startDate: startDate || prev.preferences?.startDate,
        endDate: endDate || undefined,
        category: categoryFromIcon(iconName),
        emoji: iconName,
        color,
        items: [],
        metaFields,
        summary: createSummaryFromMeta(metaFields),
        goalId: goalId || undefined,
      };
      const trackers: ProgressTracker[] = metaFields.map((field) => ({
        id: uid(),
        planId: plan.id,
        title: field,
        type: 'number',
        unit: inferUnit(field),
      }));
      return { ...prev, plans: [...prev.plans, plan], progressTrackers: [...prev.progressTrackers, ...trackers] };
    });
    reset();
    onClose();
  }

  function addMetaField() {
    const val = metaInput.trim();
    if (val && !metaFields.includes(val)) {
      setMetaFields((prev) => [...prev, val]);
      setMetaInput('');
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose}>
      <View className="gap-4 p-5 pb-8">
        <SheetHeader eyebrow="New" title="Create plan" onClose={handleClose} />

        <View className="gap-2.5">
          <View>
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder="Plan title"
              autoFocus
              maxLength={PLAN_TITLE_MAX}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (title.trim()) handleSubmit();
              }}
              accessibilityLabel="Plan title"
            />
            <Text className="mt-1 text-right text-[11px] font-medium tabular-nums text-neutral-500 dark:text-neutral-400">
              {title.length}/{PLAN_TITLE_MAX}
            </Text>
          </View>
          <Input value={description} onChangeText={setDescription} placeholder="Short description (optional)" accessibilityLabel="Plan description" />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <DateInput label="Start date" value={startDate} onChange={setStartDate} placeholder="Today" />
            </View>
            <View className="flex-1">
              <DateInput label="End date" value={endDate} onChange={setEndDate} placeholder="Ongoing" />
            </View>
          </View>
          <DurationPresets
            startDate={startDate}
            endDate={endDate}
            onSelect={(s, e) => {
              setStartDate(s);
              setEndDate(e);
            }}
          />
        </View>

        {goals.length > 0 && (
          <View>
            <Text className={`mb-1 ${typography.eyebrow}`}>
              Goal <Text className="font-normal normal-case text-neutral-500 dark:text-neutral-400">(optional)</Text>
            </Text>
            <GoalChips goals={goals} value={goalId} onChange={setGoalId} />
          </View>
        )}

        <View>
          <Text className={`mb-2 ${typography.eyebrow}`}>Icon</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {SECTION_ICONS.map(({ name, label, icon: glyph }) => {
              const cls = iconPickerClass(iconName === name);
              return (
                <Pressable
                  key={name}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: iconName === name }}
                  onPress={() => setIconName(name)}
                  className={`${cls.box} w-[18.5%]`}
                >
                  <Icon icon={glyph} size={18} strokeWidth={1.5} className={cls.icon} />
                  <Text numberOfLines={1} className={`text-[9px] font-semibold leading-none ${cls.icon}`}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text className={`mb-2 ${typography.eyebrow}`}>
            Progress trackers <Text className="font-normal normal-case text-neutral-500 dark:text-neutral-400">(optional)</Text>
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Input value={metaInput} onChangeText={setMetaInput} onSubmitEditing={addMetaField} placeholder="Metric name…" accessibilityLabel="Metric name" />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add tracker"
              onPress={addMetaField}
              className="h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-200 active:bg-neutral-100 dark:border-white/10 dark:active:bg-white/[0.07]"
            >
              <Icon icon={IconPlus} size={16} className="text-neutral-500 dark:text-neutral-400" />
            </Pressable>
          </View>
          {metaFields.length > 0 && (
            <View className="mt-2 flex-row flex-wrap gap-1.5">
              {metaFields.map((field) => (
                <View
                  key={field}
                  className="flex-row items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <Text className="text-[12px] font-medium text-neutral-600 dark:text-neutral-300">{field}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${field}`} hitSlop={8} onPress={() => setMetaFields((prev) => prev.filter((f) => f !== field))} className="opacity-50">
                    <Icon icon={IconX} size={11} className="text-neutral-600 dark:text-neutral-300" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>

        <Button fullWidth onPress={handleSubmit} disabled={!title.trim()}>
          Create new plan
        </Button>
      </View>
    </BottomSheet>
  );
}
