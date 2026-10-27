import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { IconCheck, IconChevronDown } from '@tabler/icons-react-native';
import { TRACKER_CADENCES, type TrackerCadence } from '@planr/core/lib/scheduleTypes';
import { CADENCE_LABEL } from '@planr/core/lib/trackerCadence';
import BottomSheet from '../ui/BottomSheet';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/**
 * Native port of components/tracking/CadencePicker.tsx — how often a tracker
 * asks for an entry: daily, weekly, monthly or yearly.
 *
 * Two shapes of the same control: a segmented picker for the tracker forms,
 * where the choice is being made deliberately, and a compact select for the
 * metric cards, where it is visible but out of the way.
 */
export function CadencePicker({ value, onChange }: { value: TrackerCadence; onChange: (cadence: TrackerCadence) => void }) {
  return (
    <View>
      <Text className={`mb-1.5 ${typography.eyebrow}`}>Check in</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="How often to log" className="flex-row gap-1.5">
        {TRACKER_CADENCES.map((cadence) => {
          const sel = value === cadence;
          return (
            <Pressable
              key={cadence}
              accessibilityRole="radio"
              accessibilityState={{ checked: sel }}
              onPress={() => onChange(cadence)}
              className={`h-11 flex-1 items-center justify-center rounded-xl border ${
                sel ? 'border-neutral-950 bg-neutral-950 dark:border-white dark:bg-white' : 'border-neutral-200 bg-neutral-50 dark:border-white/10 dark:bg-white/[0.04]'
              }`}
            >
              <Text className={`text-[13px] font-semibold ${sel ? 'text-white dark:text-neutral-900' : 'text-neutral-600 dark:text-neutral-300'}`}>
                {CADENCE_LABEL[cadence]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
        PlanR asks for an entry once per {value === 'daily' ? 'day' : value.replace(/ly$/, '')} and shows when one is due.
      </Text>
    </View>
  );
}

/**
 * The compact form: a pill showing the current cadence that opens the four
 * choices as a bottom-sheet list (the phone's version of the web's select).
 */
export function CadenceSelect({
  value,
  onChange,
  trackerTitle,
}: {
  value: TrackerCadence;
  onChange: (cadence: TrackerCadence) => void;
  trackerTitle: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`How often to log ${trackerTitle}, ${CADENCE_LABEL[value]}`}
        onPress={() => setOpen(true)}
        className="h-11 shrink-0 flex-row items-center gap-1.5 rounded-full border border-neutral-200 bg-white pl-3.5 pr-3 active:bg-neutral-50 dark:border-white/[0.12] dark:bg-neutral-900 dark:active:bg-white/[0.05]"
      >
        <Text className="text-[13px] font-bold text-neutral-700 dark:text-neutral-200">{CADENCE_LABEL[value]}</Text>
        <Icon icon={IconChevronDown} size={14} strokeWidth={2.4} className="text-neutral-500 dark:text-neutral-400" />
      </Pressable>

      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <View className="px-5 pb-6 pt-2">
          <Text accessibilityRole="header" className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">
            How often to log {trackerTitle}
          </Text>
          {TRACKER_CADENCES.map((cadence, i) => {
            const selected = cadence === value;
            return (
              <Pressable
                key={cadence}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(cadence);
                  setOpen(false);
                }}
                className={`min-h-[48px] flex-row items-center gap-3 py-3 active:bg-neutral-50 dark:active:bg-white/[0.04] ${
                  i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''
                }`}
              >
                <Text className={`flex-1 text-[15px] ${selected ? 'font-bold text-neutral-950 dark:text-white' : 'font-medium text-neutral-700 dark:text-neutral-300'}`}>
                  {CADENCE_LABEL[cadence]}
                </Text>
                {selected && <Icon icon={IconCheck} size={18} strokeWidth={2.5} className="text-emerald-600 dark:text-emerald-400" />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}
