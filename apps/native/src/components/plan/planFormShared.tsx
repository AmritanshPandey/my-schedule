import { Pressable, View } from 'react-native';
import type { AccentColor } from '@planr/core/lib/colorSystem';
import { todayISO } from '@planr/core/lib/dateUtils';
import { typography } from '../ui/Typography';
import { Text } from '../ui/Text';
import { ChipRow, ChoiceChip } from '../ui/FormChips';

/** Native port of components/plan/planFormShared.tsx. */
export const PLAN_TITLE_MAX = 40;

export const PLAN_DURATION_PRESETS: { label: string; days: number | null }[] = [
  { label: '15 days', days: 15 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
  { label: 'Ongoing', days: null },
];

export const PLAN_COLOR_SWATCHES: { color: AccentColor; bg: string }[] = [
  { color: 'red', bg: 'bg-red-500' },
  { color: 'orange', bg: 'bg-orange-500' },
  { color: 'amber', bg: 'bg-amber-500' },
  { color: 'yellow', bg: 'bg-yellow-500' },
  { color: 'lime', bg: 'bg-lime-500' },
  { color: 'green', bg: 'bg-green-500' },
  { color: 'emerald', bg: 'bg-emerald-500' },
  { color: 'teal', bg: 'bg-teal-500' },
  { color: 'cyan', bg: 'bg-cyan-500' },
  { color: 'sky', bg: 'bg-sky-500' },
  { color: 'blue', bg: 'bg-blue-500' },
  { color: 'indigo', bg: 'bg-indigo-500' },
  { color: 'violet', bg: 'bg-violet-500' },
  { color: 'purple', bg: 'bg-purple-500' },
  { color: 'fuchsia', bg: 'bg-fuchsia-500' },
  { color: 'pink', bg: 'bg-pink-500' },
  { color: 'rose', bg: 'bg-rose-500' },
];

export function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

/** Icon-picker tile: container classes and the glyph color class. */
export function iconPickerClass(selected: boolean): { box: string; icon: string } {
  return selected
    ? { box: 'items-center justify-center gap-1 rounded-2xl py-3 bg-neutral-900 dark:bg-white', icon: 'text-white dark:text-neutral-900' }
    : {
        box: 'items-center justify-center gap-1 rounded-2xl py-3 bg-neutral-100 active:bg-neutral-200 dark:bg-white/[0.06] dark:active:bg-white/[0.1]',
        icon: 'text-neutral-500 dark:text-neutral-400',
      };
}

export function PlanColorPicker({ value, onChange }: { value: AccentColor; onChange: (color: AccentColor) => void }) {
  return (
    <View>
      <Text className={`mb-2 ${typography.eyebrow}`}>Color</Text>
      <View className="flex-row flex-wrap gap-1">
        {PLAN_COLOR_SWATCHES.map(({ color, bg }) => {
          const sel = value === color;
          return (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={color}
              accessibilityState={{ selected: sel }}
              onPress={() => onChange(color)}
              className={`h-11 w-11 items-center justify-center rounded-full border-2 ${sel ? 'border-neutral-900 dark:border-white' : 'border-transparent'}`}
            >
              <View className={`h-8 w-8 rounded-full ${bg}`} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function DurationPresets({
  startDate,
  endDate,
  onSelect,
}: {
  startDate: string;
  endDate: string;
  onSelect: (start: string, end: string) => void;
}) {
  const today = todayISO();
  return (
    <View>
      <ChipRow label="Quick duration">
        {PLAN_DURATION_PRESETS.map(({ label, days }) => {
          const isActive = days !== null ? startDate === today && endDate === addDaysISO(days) : startDate === today && !endDate;
          return <ChoiceChip key={label} active={isActive} label={label} onPress={() => onSelect(today, days !== null ? addDaysISO(days) : '')} />;
        })}
      </ChipRow>
    </View>
  );
}
