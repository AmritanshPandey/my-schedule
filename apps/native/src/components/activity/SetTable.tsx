import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconCheck, IconMinus } from '@tabler/icons-react-native';
import type { LoggedSet, SetLog } from '@planr/core/lib/scheduleTypes';
import AddRowButton from '../ui/AddRowButton';
import { Icon } from '../ui/Icon';
import { Text, TextInput } from '../ui/Text';

/**
 * Native port of components/activity/SetTable.tsx — Set · Previous · weight ·
 * Reps · ✓, one row per set. Shared by the Log sets sheet and focus mode; it
 * edits a list of sets and leaves saving to the caller.
 */
interface SetTableProps {
  sets: LoggedSet[];
  onChange: (sets: LoggedSet[]) => void;
  previous: SetLog | null;
  weightUnit: 'kg' | 'lb';
  showWeight?: boolean;
  onSetDone?: (index: number) => void;
  readOnly?: boolean;
}

const fmt = (n: number | undefined) => (n == null ? '' : String(n));

function previousLabel(set: LoggedSet | undefined, unit: string, showWeight: boolean): string {
  if (!set) return '–';
  if (showWeight && set.weight != null && set.reps != null) return `${fmt(set.weight)}${unit} × ${fmt(set.reps)}`;
  if (set.reps != null) return `× ${fmt(set.reps)}`;
  if (set.minutes != null) return `${fmt(set.minutes)}m`;
  return '–';
}

export default function SetTable({ sets, onChange, previous, weightUnit, showWeight = true, onSetDone, readOnly = false }: SetTableProps) {
  const prevWorking = previous?.sets.filter((s) => !s.warmup) ?? [];

  function update(i: number, patch: Partial<LoggedSet>) {
    onChange(sets.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function toggleDone(i: number) {
    const next = !sets[i].done;
    // Ticking an untouched row takes what Previous showed: "same as last time, done".
    const prev = prevWorking[i];
    const fill: Partial<LoggedSet> = {};
    if (next && sets[i].weight == null && prev?.weight != null && showWeight) fill.weight = prev.weight;
    if (next && sets[i].reps == null && prev?.reps != null) fill.reps = prev.reps;
    update(i, { ...fill, done: next });
    if (next) onSetDone?.(i);
  }

  function addSet() {
    const last = sets[sets.length - 1];
    onChange([...sets, { weight: last?.weight, reps: last?.reps, done: false }]);
  }

  return (
    <View>
      <View className="flex-row items-center gap-2 px-1 pb-1.5">
        <Text className="w-9 text-center text-[11px] font-bold uppercase tracking-[0.07em] text-neutral-500 dark:text-neutral-400">Set</Text>
        <Text className="min-w-0 flex-1 text-[11px] font-bold uppercase tracking-[0.07em] text-neutral-500 dark:text-neutral-400">Previous</Text>
        {showWeight && <Text className="w-[72px] text-center text-[11px] font-bold uppercase tracking-[0.07em] text-neutral-500 dark:text-neutral-400">{weightUnit}</Text>}
        <Text className="w-16 text-center text-[11px] font-bold uppercase tracking-[0.07em] text-neutral-500 dark:text-neutral-400">Reps</Text>
        <View className="w-11" />
      </View>

      <View className="gap-1.5">
        {sets.map((set, i) => (
          <View
            key={i}
            className={`flex-row items-center gap-2 rounded-xl px-1 py-1 ${set.done ? 'bg-green-600/10 dark:bg-green-500/15' : 'bg-neutral-100/70 dark:bg-white/[0.03]'}`}
          >
            <Text className="w-9 text-center text-[15px] font-bold text-neutral-700 dark:text-neutral-200" style={{ fontVariant: ['tabular-nums'] }}>
              {i + 1}
            </Text>
            <Text numberOfLines={1} className="min-w-0 flex-1 text-[14px] font-medium text-neutral-500 dark:text-neutral-400" style={{ fontVariant: ['tabular-nums'] }}>
              {previousLabel(prevWorking[i], weightUnit, showWeight)}
            </Text>
            {showWeight && (
              <NumberCell
                value={set.weight}
                decimal
                width="w-[72px]"
                label={`Set ${i + 1} weight in ${weightUnit}`}
                placeholder={fmt(prevWorking[i]?.weight)}
                readOnly={readOnly}
                onChange={(weight) => update(i, { weight })}
              />
            )}
            <NumberCell
              value={set.reps}
              width="w-16"
              label={`Set ${i + 1} reps`}
              placeholder={fmt(prevWorking[i]?.reps)}
              readOnly={readOnly}
              onChange={(reps) => update(i, { reps })}
            />
            <Pressable
              disabled={readOnly}
              onPress={() => toggleDone(i)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: set.done, disabled: readOnly }}
              accessibilityLabel={`Set ${i + 1} done`}
              className={`h-11 w-11 items-center justify-center rounded-xl border ${
                set.done ? 'border-transparent bg-green-600 dark:bg-green-500' : 'border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]'
              }`}
            >
              <Icon
                icon={IconCheck}
                size={18}
                strokeWidth={2.6}
                className={set.done ? 'text-white dark:text-neutral-950' : 'text-neutral-400 dark:text-neutral-500'}
              />
            </Pressable>
          </View>
        ))}
      </View>

      {!readOnly && (
        <View className="mt-2 flex-row items-center gap-2">
          <View className="flex-1">
            <AddRowButton label="Add set" onClick={addSet} />
          </View>
          {sets.length > 1 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove the last set"
              onPress={() => onChange(sets.slice(0, -1))}
              className="h-11 w-11 items-center justify-center rounded-xl active:bg-neutral-100 dark:active:bg-white/[0.06]"
            >
              <Icon icon={IconMinus} size={18} strokeWidth={2.2} className="text-neutral-500 dark:text-neutral-400" />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/** A 44px number cell; keeps its own text so "62." survives mid-typing. */
function NumberCell({
  value,
  onChange,
  label,
  placeholder,
  width,
  decimal = false,
  readOnly,
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  label: string;
  placeholder?: string;
  width: string;
  decimal?: boolean;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(fmt(value));
  const [lastValue, setLastValue] = useState(value);
  // Follow outside changes (a tick filling from Previous) without fighting typing.
  if (value !== lastValue) {
    setLastValue(value);
    if (Number(text.replace(',', '.')) !== value) setText(fmt(value));
  }
  return (
    <TextInput
      value={text}
      editable={!readOnly}
      placeholder={placeholder}
      accessibilityLabel={label}
      keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
      autoComplete="off"
      onChangeText={(raw) => {
        setText(raw);
        const n = Number(raw.replace(',', '.'));
        onChange(raw.trim() === '' || !Number.isFinite(n) ? undefined : n);
      }}
      className={`h-11 ${width} rounded-xl border border-neutral-200 bg-white text-center text-[16px] font-bold text-neutral-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white`}
      style={{ fontVariant: ['tabular-nums'] }}
    />
  );
}
