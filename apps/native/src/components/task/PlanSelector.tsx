import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { IconCheck, IconChevronDown } from '@tabler/icons-react-native';
import type { Plan } from '@planr/core/lib/scheduleTypes';
import { PLAN_NEUTRAL } from '@planr/core/lib/colorSystem';
import { SECTION_ICONS } from '../SectionIcons';
import { typography } from '../ui/Typography';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/**
 * Native port of components/task/PlanSelector.tsx. The list expands inline
 * under the field rather than as a floating popover (which a scrolling sheet
 * would clip).
 */
export function PlanSelector({ plans, selectedId, onSelect }: { plans: Plan[]; selectedId: string; onSelect: (plan: Plan) => void }) {
  const [open, setOpen] = useState(false);
  const selected = plans.find((p) => p.id === selectedId) ?? null;
  const accent = PLAN_NEUTRAL;
  const SelectedIcon = selected ? (SECTION_ICONS.find((i) => i.name === selected.emoji) ?? SECTION_ICONS[0]).icon : null;

  if (plans.length === 0) {
    return (
      <View className="items-center rounded-2xl border border-dashed border-neutral-200 p-5 dark:border-white/10">
        <Text className="text-[14px] font-semibold text-neutral-700 dark:text-neutral-300">Create a plan first</Text>
        <Text className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">Tasks need a parent plan.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text className={`mb-1.5 ${typography.eyebrow}`}>Plan</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={selected ? `Plan: ${selected.title}` : 'Select a plan'}
        onPress={() => setOpen((v) => !v)}
        className="h-11 w-full flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 dark:border-white/10 dark:bg-white/[0.04]"
      >
        {selected && SelectedIcon ? (
          <>
            <View className={`h-6 w-6 shrink-0 items-center justify-center rounded-lg ${accent.tint}`}>
              <Icon icon={SelectedIcon} size={13} strokeWidth={2} className={accent.icon} />
            </View>
            <Text className="flex-1 truncate text-[14px] font-semibold text-neutral-900 dark:text-white">{selected.title}</Text>
          </>
        ) : (
          <Text className="flex-1 text-[14px] font-medium text-neutral-500 dark:text-neutral-400">Select a plan…</Text>
        )}
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon icon={IconChevronDown} size={16} strokeWidth={2} className="shrink-0 text-neutral-500 dark:text-neutral-400" />
        </View>
      </Pressable>

      {open && (
        <View className="mt-1 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-900">
          <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
            {plans.map((plan, i) => {
              const PlanIcon = (SECTION_ICONS.find((s) => s.name === plan.emoji) ?? SECTION_ICONS[0]).icon;
              const sel = selectedId === plan.id;
              return (
                <Pressable
                  key={plan.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  onPress={() => {
                    onSelect(plan);
                    setOpen(false);
                  }}
                  className={`w-full flex-row items-center gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-neutral-100 dark:border-white/[0.05]' : ''} ${
                    sel ? 'bg-neutral-50 dark:bg-white/[0.04]' : 'active:bg-neutral-50 dark:active:bg-white/[0.04]'
                  }`}
                >
                  <View className={`h-7 w-7 shrink-0 items-center justify-center rounded-lg ${accent.tint}`}>
                    <Icon icon={PlanIcon} size={14} strokeWidth={2} className={accent.icon} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="truncate text-[14px] font-semibold text-neutral-900 dark:text-white">{plan.title}</Text>
                    {plan.description ? <Text className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">{plan.description}</Text> : null}
                  </View>
                  {sel && (
                    <View className={`h-4 w-4 shrink-0 items-center justify-center rounded-full ${accent.tint}`}>
                      <Icon icon={IconCheck} size={10} strokeWidth={3} className={accent.icon} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
