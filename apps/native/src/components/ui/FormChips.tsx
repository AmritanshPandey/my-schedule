import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from './Text';
import { typography } from './Typography';

/**
 * The mobile-first form kit every create/edit sheet shares (DESIGN.md
 * "Forms"): a label above its control, never a cramped left column; choices
 * as 44px chips with 14px labels; a row of choices that scrolls sideways on
 * one line rather than wrapping into a second crowded row.
 */

const CHIP_ON = 'border-neutral-900 bg-neutral-900 dark:border-white dark:bg-white';
const CHIP_OFF = 'border-neutral-200 bg-white dark:border-white/10 dark:bg-white/[0.04]';

export function ChoiceChip({
  active,
  label,
  onPress,
  accessibilityLabel,
  detail,
  className = '',
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** A quieter second part of the label ("· 3 similar tasks"). */
  detail?: string;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={`h-11 flex-row items-center justify-center rounded-full border px-4 active:opacity-80 ${active ? CHIP_ON : CHIP_OFF} ${className}`}
    >
      <Text numberOfLines={1} className={`text-[14px] font-semibold tabular-nums ${active ? 'text-white dark:text-neutral-900' : 'text-neutral-700 dark:text-neutral-200'}`}>
        {label}
        {detail ? <Text className={`font-medium ${active ? 'text-white/70 dark:text-neutral-900/60' : 'text-neutral-500 dark:text-neutral-400'}`}>{detail}</Text> : null}
      </Text>
    </Pressable>
  );
}

/** A field's label, above it: the one label style every form uses. */
export function FieldLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View className="mb-2 min-h-[18px] flex-row items-center justify-between gap-3">
      <Text className={typography.eyebrow}>{children}</Text>
      {right}
    </View>
  );
}

/** A labelled field: label on top, the control full width below. */
export function FormSection({ label, right, children, className = '' }: { label: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <View className={className}>
      <FieldLabel right={right}>{label}</FieldLabel>
      {children}
    </View>
  );
}

/**
 * A labelled row of chips that scrolls sideways. It bleeds to the sheet's
 * edges (the house `px-5`), so the last chip is cut by the edge, which says
 * "more this way", instead of by the form's padding.
 */
export function ChipRow({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <View>
      {/* Sentence case, not an eyebrow: a chip row is a quick-pick under a
          field ("Start at · Now Morning"), not a section of its own. */}
      {label && <Text className="mb-2 text-[13px] font-semibold text-neutral-600 dark:text-neutral-400">{label}</Text>}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        className="-mx-5"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}
