import { useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import { IconCheck } from '@tabler/icons-react-native';
import BottomSheet from './BottomSheet';
import { SETTINGS_CONTROL_CLASS } from './Input';
import { Icon, type TablerIcon } from './Icon';
import { Text } from './Text';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** The web's `aria-label`; also the option sheet's title. */
  label: string;
  /** The trailing glyph the web draws over its `appearance-none` select. */
  icon: TablerIcon;
  /** Renders the value muted — the web's `!text-neutral-500` for an unset choice. */
  muted?: boolean;
  className?: string;
}

/**
 * The native stand-in for the PWA's settings `<select>`: the same control
 * chrome (SETTINGS_CONTROL_CLASS) and trailing icon, opening the options as a
 * bottom-sheet list with the current one checked — the phone equivalent of the
 * picker Safari shows for a select.
 */
export default function Select({ value, options, onChange, label, icon, muted = false, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${current?.label ?? ''}`}
        onPress={() => setOpen(true)}
        className={`${SETTINGS_CONTROL_CLASS} flex-row items-center justify-between pr-3 ${className}`}
      >
        <Text className={`flex-1 truncate text-[16px] font-semibold ${muted ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}>
          {current?.label ?? ''}
        </Text>
        <Icon icon={icon} size={14} strokeWidth={2} className="ml-2 text-neutral-500 dark:text-neutral-400" />
      </Pressable>

      <BottomSheet open={open} onClose={() => setOpen(false)} maxHeight={Dimensions.get('window').height * 0.6}>
        <View className="px-5 pb-6 pt-2">
          <Text accessibilityRole="header" className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400">
            {label}
          </Text>
          {options.map((option, i) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`min-h-[48px] flex-row items-center gap-3 py-3 active:bg-neutral-50 dark:active:bg-white/[0.04] ${
                  i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.06]' : ''
                }`}
              >
                <Text className={`flex-1 text-[15px] ${selected ? 'font-bold text-neutral-950 dark:text-white' : 'font-medium text-neutral-700 dark:text-neutral-300'}`}>
                  {option.label}
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
